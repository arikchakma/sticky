use tauri::menu::{
    AboutMetadata, CheckMenuItem, ContextMenu, Menu, MenuItemBuilder,
    PredefinedMenuItem, Submenu, WINDOW_SUBMENU_ID,
};
pub use tauri::AppHandle;
use tauri::{LogicalPosition, Manager, Runtime, Window};

// The formatting menus the editor toolbar can pop up. The accelerators
// are display hints only: they mirror the editor's own keybindings,
// which handle the actual keystrokes.
fn format_menu_items(
    menu: &str,
) -> Option<&'static [(&'static str, &'static str, &'static str)]> {
    Some(match menu {
        "heading" => &[
            ("heading-1", "Heading 1", "Cmd+Alt+1"),
            ("heading-2", "Heading 2", "Cmd+Alt+2"),
            ("heading-3", "Heading 3", "Cmd+Alt+3"),
        ],
        "style" => &[
            ("bold", "Bold", "Cmd+B"),
            ("italic", "Italic", "Cmd+I"),
            ("underline", "Underline", "Cmd+U"),
            ("strike", "Strikethrough", "Cmd+Shift+S"),
        ],
        "list" => &[
            ("ordered-list", "Ordered List", "Cmd+Shift+7"),
            ("bullet-list", "Bullet List", "Cmd+Shift+8"),
            ("task-list", "Task List", "Cmd+Shift+9"),
        ],
        _ => return None,
    })
}

// Pops up a native menu at `position`, logical coordinates relative to
// the window's top-left corner. The selection comes back with a
// `format:{id}` menu event, which the handler in `window::create_window`
// forwards to the window as a `format-menu:action` event.
pub fn popup_format_menu<R: Runtime>(
    window: &Window<R>,
    menu: &str,
    active: &[String],
    position: (f64, f64),
) -> tauri::Result<()> {
    let Some(items) = format_menu_items(menu) else {
        return Ok(());
    };

    let app_handle = window.app_handle();
    let popup = Menu::new(app_handle)?;
    for (id, text, accelerator) in items {
        let checked = active.iter().any(|a| a == id);
        popup.append(&CheckMenuItem::with_id(
            app_handle,
            format!("format:{id}"),
            text,
            true,
            checked,
            Some(accelerator),
        )?)?;
    }

    popup.popup_at(window.clone(), LogicalPosition::new(position.0, position.1))
}

pub fn app_menu<R: Runtime>(
    app_handle: &AppHandle<R>,
) -> tauri::Result<Menu<R>> {
    let pkg_info = app_handle.package_info();
    let config = app_handle.config();

    let about_metadata = AboutMetadata {
        name: Some(pkg_info.name.clone()),
        version: Some(pkg_info.version.to_string()),
        copyright: config.bundle.copyright.clone(),
        authors: config.bundle.publisher.clone().map(|p| vec![p]),
        ..Default::default()
    };

    let window_menu = Submenu::with_id_and_items(
        app_handle,
        WINDOW_SUBMENU_ID,
        "Window",
        true,
        &[&PredefinedMenuItem::close_window(app_handle, None)?],
    )?;

    let edit_menu = Submenu::with_items(
        app_handle,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app_handle, None)?,
            &PredefinedMenuItem::redo(app_handle, None)?,
            &PredefinedMenuItem::separator(app_handle)?,
            &PredefinedMenuItem::cut(app_handle, None)?,
            &PredefinedMenuItem::copy(app_handle, None)?,
            &PredefinedMenuItem::paste(app_handle, None)?,
            &PredefinedMenuItem::select_all(app_handle, None)?,
        ],
    )?;

    let menu = Menu::with_items(
        app_handle,
        &[
            &Submenu::with_items(
                app_handle,
                pkg_info.name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(
                        app_handle,
                        None,
                        Some(about_metadata),
                    )?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::services(app_handle, None)?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    &PredefinedMenuItem::hide(app_handle, None)?,
                    &PredefinedMenuItem::hide_others(app_handle, None)?,
                    &PredefinedMenuItem::separator(app_handle)?,
                    // NOTE: Replace the predefined quit item with a custom one because, for some
                    //  reason, ExitRequested events are not fired on cmd+Q. Perhaps this will be
                    //  fixed in the future?
                    //  https://github.com/tauri-apps/tauri/issues/9198
                    &MenuItemBuilder::with_id(
                        "hacked_quit".to_string(),
                        format!("Quit {}", app_handle.package_info().name),
                    )
                    .accelerator("CmdOrCtrl+q")
                    .build(app_handle)?,
                ],
            )?,
            &edit_menu,
            &window_menu,
        ],
    )?;

    Ok(menu)
}
