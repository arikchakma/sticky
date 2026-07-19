use std::time::Duration;

use log::{error, warn};
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_full::{
    new_debouncer, DebounceEventResult, Debouncer, RecommendedCache,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::error::{Error, Result};
use crate::store::{is_note_name, NotesStore};

/// The event windows listen to for note data changes. The payload is
/// the affected note id, or null when any note may have changed.
pub const NOTES_CHANGED: &str = "notes:changed";

/// How long the watcher lets a burst of file events settle before
/// reporting; a save is a temp-file dance of several events.
const DEBOUNCE: Duration = Duration::from_millis(400);

/// The notes-directory watcher, kept alive for the app's lifetime as
/// managed state.
pub struct NotesWatcher(
    #[allow(dead_code)] Debouncer<RecommendedWatcher, RecommendedCache>,
);

/// Start watching the store's directory. Call once at setup, after
/// the store is managed.
///
/// Edits made by other programs — an agent, an editor, a sync tool —
/// surface as a [`NOTES_CHANGED`] event to every window. The store's
/// own writes are recognized by content hash and stay silent.
pub fn start<R: Runtime>(app_handle: &AppHandle<R>) -> Result<()> {
    let dir = app_handle.state::<NotesStore>().dir().to_path_buf();
    let handle = app_handle.clone();

    let mut debouncer =
        new_debouncer(DEBOUNCE, None, move |result: DebounceEventResult| {
            let events = match result {
                Ok(events) => events,
                Err(errors) => {
                    warn!("Notes watcher errors: {errors:?}");
                    return;
                }
            };

            let store = handle.state::<NotesStore>();
            let external = events
                .iter()
                .flat_map(|event| event.paths.iter())
                .any(|path| is_note_name(path) && !store.is_own_write(path));

            if external {
                if let Err(e) = handle.emit(NOTES_CHANGED, None::<String>) {
                    error!("Failed to emit {NOTES_CHANGED}: {e}");
                }
            }
        })
        .map_err(watch_error)?;

    debouncer.watch(&dir, RecursiveMode::NonRecursive).map_err(watch_error)?;
    app_handle.manage(NotesWatcher(debouncer));
    Ok(())
}

fn watch_error(e: notify::Error) -> Error {
    Error::GenericError(format!("Notes watcher failed: {e}"))
}
