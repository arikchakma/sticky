//! The menu bar tray icon.
//!
//! The app runs as an accessory with no Dock icon, so the tray is its
//! only persistent entry point: it opens and lists notes, toggles
//! their visibility, and quits — even while no window is open.

use log::warn;
use sticky_models::store::{note_title, NotesStore};
use sticky_models::watcher::NOTES_CHANGED;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{include_image, App, AppHandle, Listener, Manager, Wry};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

use crate::window::{
    self, MAIN_WINDOW_PREFIX, MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH,
};

/// The tray icon's registration id.
const TRAY_ID: &str = "main";

/// How many recent notes the menu lists.
const MAX_RECENT_NOTES: usize = 8;

/// The longest note title shown in the menu, in characters.
const MAX_MENU_TITLE_LEN: usize = 40;

/// The fixed menu items' ids.
const NEW_NOTE: &str = "tray_new_note";
const TOGGLE_NOTES: &str = "tray_toggle_notes";
const QUIT: &str = "tray_quit";

/// Id prefix of the recent-note items; the note id follows.
const NOTE_PREFIX: &str = "tray_note:";

/// Build the tray icon with its menu and keep the menu's recent-notes
/// section following the store. Call once at setup.
pub fn init(app: &App) -> tauri::Result<()> {
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(include_image!("./icons/tray/32x32.png"))
        .menu(&build_menu(app.handle())?)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| handle_selection(app, event.id().as_ref()))
        .build(app.handle())?;

    // Saves, deletes, and external file edits all surface as this
    // event; rebuild the recent-notes section on each.
    let handle = app.handle().clone();
    app.listen(NOTES_CHANGED, move |_| {
        let app = handle.clone();
        // Menus are AppKit objects; they must be touched on the main
        // thread.
        let _ = handle.run_on_main_thread(move || refresh(&app));
    });

    Ok(())
}

/// Rebuild the tray menu from the current notes.
fn refresh(app: &AppHandle) {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return;
    };

    match build_menu(app) {
        Ok(menu) => {
            if let Err(e) = tray.set_menu(Some(menu)) {
                warn!("Failed to update tray menu: {e}");
            }
        }
        Err(e) => warn!("Failed to build tray menu: {e}"),
    }
}

/// The tray menu: New Note, the most recent notes, Show/Hide All,
/// Quit.
fn build_menu(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let menu = Menu::new(app)?;
    let item = |id: &str, text: &str| {
        MenuItem::with_id(app, id, text, true, None::<&str>)
    };

    menu.append(&item(NEW_NOTE, "New Note")?)?;

    let notes = app.state::<NotesStore>().list().unwrap_or_else(|e| {
        warn!("Tray menu could not list notes: {e}");
        Vec::new()
    });

    if !notes.is_empty() {
        menu.append(&PredefinedMenuItem::separator(app)?)?;
    }
    for note in notes.iter().take(MAX_RECENT_NOTES) {
        let id = format!("{NOTE_PREFIX}{}", note.id);
        menu.append(&item(&id, &menu_title(&note.content))?)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&item(TOGGLE_NOTES, "Show/Hide All Notes")?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&item(QUIT, "Quit Sticky")?)?;

    Ok(menu)
}

/// A note title clipped to fit the menu.
fn menu_title(content: &str) -> String {
    let title = note_title(content);
    let mut clipped: String = title.chars().take(MAX_MENU_TITLE_LEN).collect();
    if clipped.len() < title.len() {
        clipped.push('…');
    }
    clipped
}

/// React to a tray menu selection.
fn handle_selection(app: &AppHandle, id: &str) {
    match id {
        NEW_NOTE => new_note(app),
        TOGGLE_NOTES => toggle_notes(app),
        QUIT => quit(app),
        _ => {
            if let Some(note_id) = id.strip_prefix(NOTE_PREFIX) {
                open_note(app, note_id);
            }
        }
    }
}

/// Open a fresh note in a new window; the `/new` route creates the
/// note itself.
fn new_note(app: &AppHandle) {
    window::create_main_window(
        app,
        "/new",
        Some((MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT)),
        None,
    );
}

/// Focus the window already showing the note, or open one for it.
fn open_note(app: &AppHandle, note_id: &str) {
    let path = format!("/{note_id}");
    let existing = app.webview_windows().into_iter().find(|(label, w)| {
        label.starts_with(MAIN_WINDOW_PREFIX)
            && w.url().is_ok_and(|url| url.path() == path)
    });

    if let Some((_, w)) = existing {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }

    window::create_main_window(app, &path, None, None);
}

/// Hide every note window when any is visible; show them all
/// otherwise. With no window open, open the most recent note.
fn toggle_notes(app: &AppHandle) {
    let windows: Vec<_> = app
        .webview_windows()
        .into_iter()
        .filter(|(label, _)| label.starts_with(MAIN_WINDOW_PREFIX))
        .map(|(_, w)| w)
        .collect();

    if windows.is_empty() {
        window::create_main_window(app, "/", None, None);
        return;
    }

    let any_visible = windows.iter().any(|w| w.is_visible().unwrap_or(false));
    for w in &windows {
        let _ = if any_visible { w.hide() } else { w.show() };
    }

    if !any_visible {
        if let Some(w) = windows.first() {
            let _ = w.set_focus();
        }
    }
}

/// Quit the app. Saves window state like the Cmd+Q path, and the
/// explicit exit code bypasses the keep-alive in `run`.
fn quit(app: &AppHandle) {
    if let Err(e) = app.save_window_state(StateFlags::all()) {
        warn!("Failed to save window state on quit: {e:?}");
    }
    app.exit(0);
}
