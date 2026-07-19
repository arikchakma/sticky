use std::path::PathBuf;

use log::{error, warn};
use tauri::plugin::TauriPlugin;
use tauri::{AppHandle, Manager, Runtime};

use crate::store::NotesStore;
use crate::watcher;

/// The plugin owning note storage: opens the store and starts the
/// file watcher.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    tauri::plugin::Builder::new("sticky_models")
        .setup(|app_handle, _api| {
            let store =
                NotesStore::open(notes_dir(app_handle)).map_err(|e| {
                    error!("Failed to open notes store: {e:?}");
                    Box::<dyn std::error::Error>::from(e.to_string())
                })?;

            app_handle.manage(store);

            // The app stays usable without live external-change
            // events, so a watcher failure only logs.
            if let Err(e) = watcher::start(app_handle) {
                error!("Failed to start notes watcher: {e:?}");
            }

            Ok(())
        })
        .build()
}

/// The folder holding the note files: `Sticky` in the user's home
/// directory. Unlike Documents, the home root has no macOS privacy
/// gate (every agent and tool can read the notes without a permission
/// prompt) and is never captured by iCloud's Desktop & Documents
/// sync. Falls back to the app data directory when no home directory
/// resolves. Dev builds get their own folder so experiments never
/// touch real notes.
fn notes_dir<R: Runtime>(app_handle: &AppHandle<R>) -> PathBuf {
    let folder = if app_handle.config().identifier.ends_with(".dev") {
        "Sticky Dev"
    } else {
        "Sticky"
    };

    match app_handle.path().home_dir() {
        Ok(home) => home.join(folder),
        Err(e) => {
            warn!("No home folder ({e}); keeping notes in app data");
            app_handle
                .path()
                .app_data_dir()
                .expect("App data directory should be resolvable")
                .join("notes")
        }
    }
}
