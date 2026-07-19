//! Format-preserving YAML frontmatter for markdown files.

use std::borrow::Cow;

/// A markdown file with an optional YAML frontmatter header.
///
/// Parsing is lenient and infallible: any text yields a document, and
/// header lines the parser doesn't manage — comments, lists, indented
/// block content — survive rendering byte for byte, in their original
/// order. Only the flat `key: value` fields touched through [`set`]
/// and [`remove`] are rewritten.
///
/// [`set`]: Self::set
/// [`remove`]: Self::remove
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Document {
    /// The frontmatter lines, in file order.
    header: Vec<Entry>,
    /// The markdown body, without trailing newlines.
    body: String,
}

/// A line in the frontmatter header.
#[derive(Debug, Clone, PartialEq)]
enum Entry {
    /// A top-level `key: value` line.
    Field {
        /// The key before the colon.
        key: String,
        /// The value, with quoting and trailing comments resolved.
        value: String,
        /// The original line, kept verbatim until the value changes.
        raw: Option<String>,
    },
    /// Any other line, rendered back verbatim.
    Raw(String),
}

impl Document {
    /// Create an empty document.
    pub fn new() -> Self {
        Self::default()
    }

    /// Parse file contents.
    ///
    /// Never fails: text without a complete frontmatter header is a
    /// document whose entire content is the body.
    pub fn parse(text: &str) -> Self {
        let Some((header, body)) = split(text) else {
            return Self { header: vec![], body: trim_body(text) };
        };

        Self {
            header: header.lines().map(Entry::parse).collect(),
            body: trim_body(body),
        }
    }

    /// The value of a field.
    ///
    /// The value has one layer of YAML quoting stripped and, for
    /// plain values, any trailing ` # comment` removed.
    pub fn get(&self, key: &str) -> Option<&str> {
        self.header.iter().find_map(|entry| match entry {
            Entry::Field { key: k, value, .. } if k == key => {
                Some(value.as_str())
            }
            _ => None,
        })
    }

    /// Set a field.
    ///
    /// An existing field keeps its position in the header; a new one
    /// is appended at the end.
    pub fn set(&mut self, key: &str, value: impl Into<String>) {
        let value = value.into();
        for entry in &mut self.header {
            if let Entry::Field { key: k, value: v, raw } = entry {
                if k == key {
                    *v = value;
                    *raw = None;
                    return;
                }
            }
        }

        let key = key.to_string();
        self.header.push(Entry::Field { key, value, raw: None });
    }

    /// Remove a field, returning its value.
    ///
    /// Only the field's own line is removed; block content indented
    /// under it stays behind as raw lines.
    pub fn remove(&mut self, key: &str) -> Option<String> {
        let index = self.header.iter().position(
            |entry| matches!(entry, Entry::Field { key: k, .. } if k == key),
        )?;

        let Entry::Field { value, .. } = self.header.remove(index) else {
            return None;
        };
        Some(value)
    }

    /// The markdown body, without trailing newlines.
    pub fn body(&self) -> &str {
        &self.body
    }

    /// Replace the body.
    ///
    /// Trailing newlines are normalized away; [`render`](Self::render)
    /// terminates the file with a single one.
    pub fn set_body(&mut self, body: impl Into<String>) {
        self.body = body.into();
        self.body.truncate(self.body.trim_end_matches('\n').len());
    }

    /// Render the document back into file contents.
    ///
    /// Untouched header lines reproduce byte for byte; modified
    /// fields are written as `key: value`, quoted only when YAML
    /// would misread the plain value. An empty header renders no
    /// fences at all.
    pub fn render(&self) -> String {
        let mut out = String::new();
        if !self.header.is_empty() {
            out.push_str("---\n");
            for entry in &self.header {
                entry.render_into(&mut out);
            }
            out.push_str("---\n");
        }

        if !self.body.is_empty() {
            if !out.is_empty() {
                out.push('\n');
            }
            out.push_str(&self.body);
            out.push('\n');
        }

        out
    }
}

impl Entry {
    /// Parse a header line.
    fn parse(line: &str) -> Self {
        let Some((key, rest)) = line.split_once(':') else {
            return Self::Raw(line.to_string());
        };

        // A field key sits flush left, is a single word, and is not a
        // comment; YAML further requires the colon to be followed by
        // a space or the end of the line. Everything else passes
        // through verbatim.
        let field = !key.is_empty()
            && !key.starts_with('#')
            && !key.contains(char::is_whitespace)
            && (rest.is_empty() || rest.starts_with(' '));
        if !field {
            return Self::Raw(line.to_string());
        }

        Self::Field {
            key: key.to_string(),
            value: parse_value(rest.trim()),
            raw: Some(line.to_string()),
        }
    }

    /// Render the line, followed by a newline.
    fn render_into(&self, out: &mut String) {
        match self {
            Self::Field { raw: Some(raw), .. } | Self::Raw(raw) => {
                out.push_str(raw);
            }
            Self::Field { key, value, raw: None } => {
                out.push_str(key);
                out.push_str(": ");
                out.push_str(&quote(value));
            }
        }
        out.push('\n');
    }
}

/// Split text into header and body if it starts with a frontmatter
/// fence.
fn split(text: &str) -> Option<(&str, &str)> {
    let rest = text.strip_prefix("---\n")?;
    match rest.find("\n---\n") {
        Some(end) => Some((&rest[..end], &rest[end + 5..])),
        None => rest.strip_suffix("\n---").map(|header| (header, "")),
    }
}

/// Strip the blank separator line and trailing newlines.
fn trim_body(body: &str) -> String {
    let body = body.strip_prefix('\n').unwrap_or(body);
    body.trim_end_matches('\n').to_string()
}

/// Extract the value from the text after a field's colon.
///
/// Strips one layer of quoting from quoted values and a trailing
/// ` # comment` from plain ones. Only the escapes [`Document::render`]
/// writes (`\"` and `\\`) are interpreted.
fn parse_value(raw: &str) -> String {
    if let Some(inner) = strip_quotes(raw, '"') {
        let mut out = String::with_capacity(inner.len());
        let mut chars = inner.chars();
        while let Some(c) = chars.next() {
            out.push(if c == '\\' { chars.next().unwrap_or('\\') } else { c });
        }
        out
    } else if let Some(inner) = strip_quotes(raw, '\'') {
        inner.replace("''", "'")
    } else {
        raw.split(" #").next().unwrap_or(raw).trim_end().to_string()
    }
}

/// The text between a matching pair of quotes, if any.
fn strip_quotes(raw: &str, quote: char) -> Option<&str> {
    raw.strip_prefix(quote)?.strip_suffix(quote)
}

/// Quote a value if YAML would misread it plain.
fn quote(value: &str) -> Cow<'_, str> {
    if !needs_quotes(value) {
        return Cow::Borrowed(value);
    }

    let mut quoted = String::with_capacity(value.len() + 2);
    quoted.push('"');
    for c in value.chars() {
        if matches!(c, '"' | '\\') {
            quoted.push('\\');
        }
        quoted.push(c);
    }
    quoted.push('"');
    Cow::Owned(quoted)
}

/// Whether a plain scalar would parse back differently.
fn needs_quotes(value: &str) -> bool {
    const INDICATORS: &[char] = &[
        '#', '"', '\'', '&', '*', '!', '|', '>', '%', '@', '`', '[', ']', '{',
        '}', ',',
    ];

    value.is_empty()
        || value != value.trim()
        || value.starts_with(INDICATORS)
        || value.starts_with("- ")
        || value == "-"
        || value.contains(" #")
        || value.contains(": ")
        || value.ends_with(':')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_without_frontmatter() {
        let doc = Document::parse("just some text\n");
        assert_eq!(doc.get("id"), None);
        assert_eq!(doc.body(), "just some text");
        assert_eq!(doc.render(), "just some text\n");
    }

    #[test]
    fn test_unterminated_header_is_body() {
        let text = "---\nnot actually frontmatter";
        assert_eq!(Document::parse(text).body(), text);
    }

    #[test]
    fn test_untouched_documents_render_byte_for_byte() {
        #[track_caller]
        fn test(text: &str) {
            assert_eq!(Document::parse(text).render(), text);
        }

        test("---\nid: note_abc\n---\n\n# Title\n\nSome text.\n");
        test("---\nid: note_abc\n---\n");
        test("# Just a body\n");
        test(
            "---\n# a comment\nid:   spaced   \ntags:\n  - inbox\n  \
             - later\nempty:\nweird text here\n---\n\nbody\n",
        );
    }

    #[test]
    fn test_get_resolves_quoting_and_comments() {
        #[track_caller]
        fn test(line: &str, expected: &str) {
            let text = format!("---\n{line}\n---\n");
            let doc = Document::parse(&text);
            assert_eq!(doc.get("k"), Some(expected));
        }

        test("k: plain", "plain");
        test("k: \"quoted\"", "quoted");
        test("k: \"esc \\\" ape\"", "esc \" ape");
        test("k: 'single ''quoted'''", "single 'quoted'");
        test("k: plain # comment", "plain");
        test("k:", "");
        test("k:   padded   ", "padded");
    }

    #[test]
    fn test_set_keeps_position_and_neighbors() {
        let text = "---\n# keep me\nid: old\ntags: [a, b]\n---\n\nhi\n";
        let mut doc = Document::parse(text);
        doc.set("id", "new");
        assert_eq!(
            doc.render(),
            "---\n# keep me\nid: new\ntags: [a, b]\n---\n\nhi\n",
        );
    }

    #[test]
    fn test_set_appends_new_fields() {
        let mut doc = Document::new();
        doc.set("id", "note_abc");
        doc.set("createdAt", "2026-07-19T10:00:00Z");
        doc.set_body("# Title");
        assert_eq!(
            doc.render(),
            "---\nid: note_abc\ncreatedAt: 2026-07-19T10:00:00Z\n---\n\
             \n# Title\n",
        );
    }

    #[test]
    fn test_set_quotes_only_when_needed() {
        #[track_caller]
        fn test(value: &str, expected: &str) {
            let mut doc = Document::parse("---\nk: x\n---\n");
            doc.set("k", value);
            assert_eq!(doc.render(), format!("---\nk: {expected}\n---\n"));
            assert_eq!(Document::parse(&doc.render()).get("k"), Some(value));
        }

        test("plain", "plain");
        test("2026-07-19T10:00:00Z", "2026-07-19T10:00:00Z");
        test("", "\"\"");
        test(" padded ", "\" padded \"");
        test("a: b", "\"a: b\"");
        test("note # one", "\"note # one\"");
        test("say \"hi\"", "say \"hi\"");
        test("\"hi\" there", "\"\\\"hi\\\" there\"");
        test("#tag", "\"#tag\"");
    }

    #[test]
    fn test_remove() {
        let mut doc = Document::parse("---\na: 1\nb: 2\n---\n\nhi\n");
        assert_eq!(doc.remove("a"), Some("1".to_string()));
        assert_eq!(doc.remove("a"), None);
        assert_eq!(doc.render(), "---\nb: 2\n---\n\nhi\n");
    }

    #[test]
    fn test_removing_every_field_drops_the_fences() {
        let mut doc = Document::parse("---\na: 1\n---\n\nhi\n");
        doc.remove("a");
        assert_eq!(doc.render(), "hi\n");
    }

    #[test]
    fn test_set_body_normalizes_trailing_newlines() {
        let mut doc = Document::new();
        doc.set_body("hello\n\n\n");
        assert_eq!(doc.body(), "hello");
        assert_eq!(doc.render(), "hello\n");
    }

    #[test]
    fn test_empty_document_renders_nothing() {
        assert_eq!(Document::new().render(), "");
    }

    #[test]
    fn test_header_only_document() {
        let text = "---\nid: note_abc\n---\n";
        let doc = Document::parse(text);
        assert_eq!(doc.body(), "");
        assert_eq!(doc.render(), text);
    }
}
