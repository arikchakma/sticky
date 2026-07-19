use std::collections::HashMap;
use std::ffi::OsString;
use std::fs;
use std::hash::{DefaultHasher, Hash, Hasher};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use chrono::{DateTime, SecondsFormat, Utc};
use log::warn;
use sticky_matter::Document;
use tempfile::NamedTempFile;

use crate::error::{Error, Result};
use crate::models::{ModelType, Note};
use crate::queries::generate_model_id;

/// The longest filename slug derived from a note's first line.
const MAX_SLUG_LEN: usize = 60;

/// The frontmatter fields the store owns; anything else in a note's
/// header belongs to external tools and passes through untouched.
const ID: &str = "id";
const CREATED_AT: &str = "createdAt";
const UPDATED_AT: &str = "updatedAt";

/// A markdown-file store: one file per note in a flat directory.
///
/// A note's identity is the `id` in its frontmatter, never its path.
/// Filenames follow the note's first line and are purely cosmetic, so
/// external renames break nothing.
pub struct NotesStore {
    dir: PathBuf,
    index: Mutex<HashMap<String, PathBuf>>,
    /// What this store last did to each file (keyed by file name):
    /// the hash of the contents it wrote, or `None` for a removal.
    /// The file watcher uses it to tell its own writes from external
    /// ones.
    writes: Mutex<HashMap<OsString, Option<u64>>>,
    /// The body hash each editor is working from, per note id: what
    /// the store last served or wrote. An upsert finding different
    /// bytes on disk knows an external edit is about to be overwritten
    /// and saves it as a conflict copy first.
    bases: Mutex<HashMap<String, u64>>,
}

impl NotesStore {
    /// Open the store, creating the directory if needed.
    pub fn open(dir: PathBuf) -> Result<Self> {
        fs::create_dir_all(&dir)?;
        let store = Self {
            dir,
            index: Mutex::new(HashMap::new()),
            writes: Mutex::new(HashMap::new()),
            bases: Mutex::new(HashMap::new()),
        };
        store.scan()?;
        Ok(store)
    }

    /// The directory holding the note files.
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// Read every note from disk, newest first.
    pub fn list(&self) -> Result<Vec<Note>> {
        let mut notes = self.scan()?;
        notes.sort_by(|a, b| {
            b.updated_at.cmp(&a.updated_at).then_with(|| a.id.cmp(&b.id))
        });
        Ok(notes)
    }

    /// Read a single note by id.
    pub fn get(&self, id: &str) -> Result<Note> {
        let note = match self.lookup(id).and_then(|p| read_note(&p, id)) {
            Some(note) => note,
            None => {
                // The file may have moved or changed under us; rescan.
                self.scan()?;
                self.lookup(id)
                    .and_then(|p| read_note(&p, id))
                    .ok_or_else(|| Error::ModelNotFound(id.to_string()))?
            }
        };

        // Whatever content the caller sees now is what its edits will
        // be based on.
        self.bases
            .lock()
            .unwrap()
            .insert(id.to_string(), body_hash(&note.content));
        Ok(note)
    }

    /// Write a note to disk, creating it when the id is new or empty.
    ///
    /// Returns the persisted note with backend-owned id and timestamps.
    pub fn upsert(&self, note: Note) -> Result<Note> {
        let id = match note.id.as_str() {
            "" => generate_model_id(ModelType::TypeNote),
            _ => note.id.clone(),
        };

        let current = match self.lookup(&id).filter(|p| p.is_file()) {
            Some(path) => Some(path),
            None => {
                self.scan()?;
                self.lookup(&id).filter(|p| p.is_file())
            }
        };

        let mut doc = current
            .as_deref()
            .and_then(|p| fs::read_to_string(p).ok())
            .map_or_else(Document::new, |text| Document::parse(&text));

        let now = truncate(Utc::now());
        let (created_at, updated_at) = if current.is_some() {
            (read_time(&doc, CREATED_AT).unwrap_or(now), now)
        } else {
            (
                truncate(timestamp_for_upsert(note.created_at)),
                truncate(timestamp_for_upsert(note.updated_at)),
            )
        };

        // The file changed since this note's content was last served
        // or written: something external edited it. Keep those bytes
        // as a conflict copy instead of silently overwriting them.
        let body = note.content.trim_end_matches('\n');
        if let Some(path) = &current {
            let disk = body_hash(doc.body());
            let base = self.bases.lock().unwrap().get(&id).copied();
            if base.is_some_and(|b| b != disk) && doc.body() != body {
                self.conflict_copy(path, doc.body(), updated_at)?;
            }
        }

        doc.set(ID, id.as_str());
        doc.set(CREATED_AT, write_time(created_at));
        doc.set(UPDATED_AT, write_time(updated_at));
        doc.set_body(body);

        let path = self.place(&id, doc.body(), current)?;
        self.write(&path, &doc.render())?;
        self.index.lock().unwrap().insert(id.clone(), path);
        self.bases.lock().unwrap().insert(id.clone(), body_hash(doc.body()));

        Ok(Note {
            model: "note".to_string(),
            id,
            created_at,
            updated_at,
            content: doc.body().to_string(),
        })
    }

    /// Remove a note's file.
    ///
    /// Missing ids are a silent no-op, matching the SQL `DELETE` this
    /// replaced.
    pub fn delete(&self, id: &str) -> Result<()> {
        self.scan()?;
        if let Some(path) = self.index.lock().unwrap().remove(id) {
            fs::remove_file(&path)?;
            self.record_write(&path, None);
        }
        self.bases.lock().unwrap().remove(id);
        Ok(())
    }

    /// Whether the state of `path` on disk is this store's own doing:
    /// its contents are exactly what the store last wrote, or it is
    /// gone and the store removed it. The file watcher stays quiet for
    /// these.
    pub fn is_own_write(&self, path: &Path) -> bool {
        let Some(name) = path.file_name() else {
            return false;
        };
        let Some(last) = self.writes.lock().unwrap().get(name).copied() else {
            return false;
        };

        match fs::read_to_string(path) {
            Ok(contents) => last == Some(body_hash(&contents)),
            Err(_) => last.is_none(),
        }
    }

    /// Rebuild the index from disk and return all readable notes.
    ///
    /// Files created by hand without an id are adopted: they get an id
    /// and timestamps written back, becoming regular notes.
    fn scan(&self) -> Result<Vec<Note>> {
        let mut notes = Vec::new();
        let mut index = HashMap::new();

        for entry in fs::read_dir(&self.dir)? {
            let path = entry?.path();
            if !is_note_file(&path) {
                continue;
            }

            let note = match self.adopt_note(&path) {
                Ok(note) => note,
                Err(e) => {
                    warn!("Skipping unreadable note {path:?}: {e}");
                    continue;
                }
            };

            if index.insert(note.id.clone(), path.clone()).is_some() {
                warn!("Duplicate note id {} at {path:?}", note.id);
            }
            notes.push(note);
        }

        *self.index.lock().unwrap() = index;
        Ok(notes)
    }

    fn lookup(&self, id: &str) -> Option<PathBuf> {
        self.index.lock().unwrap().get(id).cloned()
    }

    /// Pick the file path for a note.
    ///
    /// Keeps the current file while its name still matches the note's
    /// first line and renames it otherwise.
    fn place(
        &self,
        id: &str,
        body: &str,
        current: Option<PathBuf>,
    ) -> Result<PathBuf> {
        let slug = slugify(body);

        if let Some(current) = current {
            let stem = current
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default();
            if stem == slug || is_suffixed(stem, &slug) {
                return Ok(current);
            }

            let target = self.available_path(&slug, id);
            fs::rename(&current, &target)?;
            self.record_write(&current, None);
            return Ok(target);
        }

        Ok(self.available_path(&slug, id))
    }

    /// Find the first free `slug.md`, `slug-2.md`, ... name.
    ///
    /// Existing names are compared case-insensitively because APFS is.
    fn available_path(&self, slug: &str, id: &str) -> PathBuf {
        let taken: Vec<String> = self
            .index
            .lock()
            .unwrap()
            .iter()
            .filter(|(other, _)| other.as_str() != id)
            .filter_map(|(_, p)| p.file_stem()?.to_str())
            .map(str::to_lowercase)
            .collect();

        let mut n = 1;
        loop {
            let stem =
                if n == 1 { slug.to_string() } else { format!("{slug}-{n}") };
            let path = self.dir.join(format!("{stem}.md"));
            if !taken.contains(&stem) && !path.exists() {
                return path;
            }
            n += 1;
        }
    }

    /// Load a note file, assigning an id and timestamps (and writing
    /// them back) when the file lacks them.
    fn adopt_note(&self, path: &Path) -> Result<Note> {
        let text = fs::read_to_string(path)?;
        let mut doc = Document::parse(&text);
        let meta = fs::metadata(path)?;

        let id = file_id(&doc).map(str::to_string);
        let created = read_time(&doc, CREATED_AT);
        let updated = read_time(&doc, UPDATED_AT);
        let complete = id.is_some() && created.is_some() && updated.is_some();

        let id = id.unwrap_or_else(|| generate_model_id(ModelType::TypeNote));
        let created_at = created
            .or_else(|| meta.created().ok().map(DateTime::from))
            .map_or_else(|| truncate(Utc::now()), truncate);
        let updated_at = updated
            .or_else(|| meta.modified().ok().map(DateTime::from))
            .map_or_else(|| truncate(Utc::now()), truncate);

        if !complete {
            doc.set(ID, id.as_str());
            doc.set(CREATED_AT, write_time(created_at));
            doc.set(UPDATED_AT, write_time(updated_at));
            self.write(path, &doc.render())?;
        }

        Ok(Note {
            model: "note".to_string(),
            id,
            created_at,
            updated_at,
            content: doc.body().to_string(),
        })
    }

    /// Save externally edited content that is about to be overwritten
    /// into a sibling file.
    ///
    /// The copy carries no frontmatter, so the next scan adopts it as
    /// a regular note of its own.
    fn conflict_copy(
        &self,
        path: &Path,
        body: &str,
        at: DateTime<Utc>,
    ) -> Result<()> {
        let stem =
            path.file_stem().and_then(|s| s.to_str()).unwrap_or("untitled");
        let name =
            format!("{stem} (conflict {}).md", at.format("%Y%m%d-%H%M%S"));

        let mut contents = body.trim_end_matches('\n').to_string();
        contents.push('\n');
        self.write(&self.dir.join(name), &contents)
    }

    /// Write file contents crash-safely: temp file in the same
    /// directory, fsync, atomic rename.
    ///
    /// The write is remembered so the file watcher can recognize it
    /// as the store's own.
    fn write(&self, path: &Path, contents: &str) -> Result<()> {
        let dir = path.parent().ok_or_else(|| {
            Error::GenericError(format!("Note path has no parent: {path:?}"))
        })?;

        let mut file = NamedTempFile::new_in(dir)?;
        file.write_all(contents.as_bytes())?;
        file.as_file().sync_all()?;
        file.persist(path).map_err(|e| Error::from(e.error))?;

        self.record_write(path, Some(body_hash(contents)));
        Ok(())
    }

    fn record_write(&self, path: &Path, contents: Option<u64>) {
        if let Some(name) = path.file_name() {
            self.writes.lock().unwrap().insert(name.to_os_string(), contents);
        }
    }
}

/// Clamp a timestamp to the microsecond precision the frontmatter
/// stores, so in-memory notes always match what a reread would return.
fn truncate(dt: DateTime<Utc>) -> DateTime<Utc> {
    DateTime::from_timestamp_micros(dt.timestamp_micros())
        .expect("Microsecond truncation should stay in range")
}

/// Fall back to the current time when the timestamp is epoch zero,
/// which is what the frontend sends for notes it hasn't saved yet.
fn timestamp_for_upsert(dt: DateTime<Utc>) -> DateTime<Utc> {
    if dt.timestamp() == 0 {
        Utc::now()
    } else {
        dt
    }
}

/// Read a note file, returning it only when it carries the wanted id.
fn read_note(path: &Path, id: &str) -> Option<Note> {
    let text = fs::read_to_string(path).ok()?;
    let doc = Document::parse(&text);
    (file_id(&doc) == Some(id)).then(|| {
        let now = Utc::now();
        Note {
            model: "note".to_string(),
            id: id.to_string(),
            created_at: read_time(&doc, CREATED_AT).unwrap_or(now),
            updated_at: read_time(&doc, UPDATED_AT).unwrap_or(now),
            content: doc.body().to_string(),
        }
    })
}

/// The id a note file carries, if any.
fn file_id(doc: &Document) -> Option<&str> {
    doc.get(ID).filter(|id| !id.is_empty())
}

/// Read one of the timestamp fields.
///
/// Accepts RFC 3339 and the bare format the old SQLite schema
/// produced with `datetime('now')`.
fn read_time(doc: &Document, key: &str) -> Option<DateTime<Utc>> {
    let value = doc.get(key)?;
    if let Ok(dt) = DateTime::parse_from_rfc3339(value) {
        return Some(dt.with_timezone(&Utc));
    }

    let naive =
        chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
            .ok()?;
    Some(naive.and_utc())
}

/// Format a timestamp for the frontmatter.
fn write_time(dt: DateTime<Utc>) -> String {
    dt.to_rfc3339_opts(SecondsFormat::Micros, true)
}

/// The identity of a note body for base and self-write comparisons.
fn body_hash(text: &str) -> u64 {
    let mut hasher = DefaultHasher::new();
    text.hash(&mut hasher);
    hasher.finish()
}

/// A visible `.md` file; temp files are dotfiles and get skipped.
fn is_note_file(path: &Path) -> bool {
    path.is_file() && is_note_name(path)
}

/// Whether the path is named like a note, whether or not it still
/// exists — the watcher also sees events for deleted files.
pub(crate) fn is_note_name(path: &Path) -> bool {
    path.extension().is_some_and(|ext| ext == "md")
        && path
            .file_name()
            .and_then(|n| n.to_str())
            .is_some_and(|n| !n.starts_with('.'))
}

/// Whether `stem` is `slug` plus a numeric collision suffix.
fn is_suffixed(stem: &str, slug: &str) -> bool {
    stem.strip_prefix(slug)
        .and_then(|rest| rest.strip_prefix('-'))
        .is_some_and(|n| !n.is_empty() && n.bytes().all(|b| b.is_ascii_digit()))
}

/// Derive a filename slug from the first non-empty line of a note.
fn slugify(body: &str) -> String {
    let line = body.lines().find(|l| !l.trim().is_empty()).unwrap_or("");
    let line = strip_line_markers(line);

    let mut slug = String::new();
    let mut gap = false;
    for c in line.chars() {
        if slug.len() >= MAX_SLUG_LEN {
            break;
        }
        if c.is_alphanumeric() {
            if gap && !slug.is_empty() {
                slug.push('-');
            }
            gap = false;
            slug.extend(c.to_lowercase());
        } else {
            gap = true;
        }
    }

    if slug.is_empty() {
        "untitled".to_string()
    } else {
        slug
    }
}

/// Strip leading block markers (headings, quotes, list bullets, task
/// checkboxes) so the slug reflects the title text itself.
fn strip_line_markers(line: &str) -> &str {
    let mut s = line.trim();
    loop {
        let mut t =
            s.trim_start_matches(['#', '>', '-', '*', '+']).trim_start();
        for marker in ["[ ]", "[x]", "[X]"] {
            if let Some(rest) = t.strip_prefix(marker) {
                t = rest.trim_start();
            }
        }
        let digits = t.bytes().take_while(|b| b.is_ascii_digit()).count();
        if digits > 0 && matches!(t.as_bytes().get(digits), Some(b'.' | b')')) {
            t = t[digits + 1..].trim_start();
        }
        if t == s {
            return s;
        }
        s = t;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> (tempfile::TempDir, NotesStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = NotesStore::open(dir.path().join("notes")).unwrap();
        (dir, store)
    }

    fn upsert(store: &NotesStore, id: &str, content: &str) -> Note {
        store
            .upsert(Note {
                id: id.to_string(),
                content: content.to_string(),
                ..Default::default()
            })
            .unwrap()
    }

    #[test]
    fn creates_gets_and_lists_notes() {
        let (_dir, store) = store();
        let a = upsert(&store, "", "# Groceries\n\n- [ ] Milk");
        let b = upsert(&store, "", "# Ideas");

        assert!(a.id.starts_with("note_"));
        assert_eq!(store.get(&a.id).unwrap().content, a.content);

        let listed = store.list().unwrap();
        assert_eq!(listed.len(), 2);
        assert_eq!(listed[0].id, b.id, "newest first");
    }

    #[test]
    fn names_files_after_the_first_line() {
        let (_dir, store) = store();
        let note = upsert(&store, "", "# Groceries & Stuff!");
        let path = store.lookup(&note.id).unwrap();
        assert_eq!(path.file_name().unwrap(), "groceries-stuff.md");
    }

    #[test]
    fn renames_the_file_when_the_title_changes() {
        let (_dir, store) = store();
        let note = upsert(&store, "", "# Old title");
        let old_path = store.lookup(&note.id).unwrap();

        upsert(&store, &note.id, "# New title");
        let new_path = store.lookup(&note.id).unwrap();

        assert_eq!(new_path.file_name().unwrap(), "new-title.md");
        assert!(!old_path.exists());
        assert_eq!(store.list().unwrap().len(), 1);
    }

    #[test]
    fn suffixes_colliding_titles_case_insensitively() {
        let (_dir, store) = store();
        upsert(&store, "", "Meeting");
        let second = upsert(&store, "", "MEETING");
        let path = store.lookup(&second.id).unwrap();
        assert_eq!(path.file_name().unwrap(), "meeting-2.md");
    }

    #[test]
    fn keeps_created_at_and_bumps_updated_at_on_update() {
        let (_dir, store) = store();
        let created = upsert(&store, "", "first");
        let updated = upsert(&store, &created.id, "first edited");

        assert_eq!(updated.created_at, created.created_at);
        assert!(updated.updated_at >= created.updated_at);
    }

    #[test]
    fn preserves_foreign_frontmatter_on_resave() {
        let (_dir, store) = store();
        let note = upsert(&store, "", "hello");
        let path = store.lookup(&note.id).unwrap();

        let tagged = fs::read_to_string(&path)
            .unwrap()
            .replace("---\n\nhello", "tags: [inbox]\n---\n\nhello");
        fs::write(&path, tagged).unwrap();

        upsert(&store, &note.id, "hello again");
        let text = fs::read_to_string(store.lookup(&note.id).unwrap()).unwrap();
        assert!(text.contains("tags: [inbox]"));
        assert!(text.contains("hello again"));
    }

    #[test]
    fn adopts_files_created_without_frontmatter() {
        let (_dir, store) = store();
        fs::write(store.dir().join("dropped-in.md"), "# From an agent\n")
            .unwrap();

        let listed = store.list().unwrap();
        assert_eq!(listed.len(), 1);
        assert!(listed[0].id.starts_with("note_"));
        assert_eq!(listed[0].content, "# From an agent");

        let text =
            fs::read_to_string(store.dir().join("dropped-in.md")).unwrap();
        assert!(text.starts_with("---\nid: note_"));
    }

    #[test]
    fn reads_legacy_sqlite_timestamps() {
        let (_dir, store) = store();
        fs::write(
            store.dir().join("old.md"),
            "---\nid: note_legacy\ncreatedAt: 2026-03-11 22:56:44\n\
             updatedAt: 2026-03-11 23:23:34\n---\n\nhi\n",
        )
        .unwrap();

        let note = store.get("note_legacy").unwrap();
        assert_eq!(note.created_at.to_rfc3339(), "2026-03-11T22:56:44+00:00");
        assert_eq!(note.updated_at.to_rfc3339(), "2026-03-11T23:23:34+00:00");
    }

    #[test]
    fn finds_a_note_renamed_externally() {
        let (_dir, store) = store();
        let note = upsert(&store, "", "# Findable");
        let path = store.lookup(&note.id).unwrap();
        fs::rename(&path, store.dir().join("elsewhere.md")).unwrap();

        assert_eq!(store.get(&note.id).unwrap().content, "# Findable");
    }

    #[test]
    fn deletes_are_idempotent() {
        let (_dir, store) = store();
        let note = upsert(&store, "", "bye");
        store.delete(&note.id).unwrap();
        store.delete(&note.id).unwrap();
        assert!(store.list().unwrap().is_empty());
    }

    #[test]
    fn saves_a_conflict_copy_when_overwriting_external_edits() {
        let (_dir, store) = store();
        let note = upsert(&store, "", "# Plan\n\noriginal");
        let path = store.lookup(&note.id).unwrap();

        // An agent rewrites the file between our save and our next one.
        let text = fs::read_to_string(&path)
            .unwrap()
            .replace("original", "agent edit");
        fs::write(&path, text).unwrap();

        upsert(&store, &note.id, "# Plan\n\nuser edit");

        let notes = store.list().unwrap();
        assert_eq!(notes.len(), 2, "conflict copy became a note");
        let copy =
            notes.iter().find(|n| n.content.contains("agent edit")).unwrap();
        assert!(copy.id.starts_with("note_"));
        assert_eq!(store.get(&note.id).unwrap().content, "# Plan\n\nuser edit");
    }

    #[test]
    fn overwrites_silently_when_disk_matches_the_base() {
        let (_dir, store) = store();
        let note = upsert(&store, "", "first");
        upsert(&store, &note.id, "second");
        assert_eq!(store.list().unwrap().len(), 1, "no conflict copy");
    }

    #[test]
    fn recognizes_its_own_writes() {
        let (_dir, store) = store();
        let note = upsert(&store, "", "mine");
        let path = store.lookup(&note.id).unwrap();
        assert!(store.is_own_write(&path));

        fs::write(&path, "someone else").unwrap();
        assert!(!store.is_own_write(&path));

        store.delete(&note.id).unwrap();
        assert!(store.is_own_write(&path), "own deletes stay quiet");
    }

    #[test]
    fn empty_notes_land_on_untitled() {
        let (_dir, store) = store();
        let note = upsert(&store, "", "");
        let path = store.lookup(&note.id).unwrap();
        assert_eq!(path.file_name().unwrap(), "untitled.md");
    }
}
