use std::io::{Result as IoResult, Write};

use flexi_logger::{
    Age, Cleanup, Criterion, DeferredNow, FileSpec, LogSpecification, Logger,
    Naming,
};
use log::{error, warn, Level, Record};
use sticky_models::error::Error;
use sticky_models::models::Note;
use sticky_models::queries::{delete_note, get_note, list_notes, upsert_note};
use tauri::{
    include_image, tray::TrayIconBuilder, App, AppHandle, Emitter, Manager,
    RunEvent, Runtime, WebviewWindow, WindowEvent,
};
use tauri_plugin_window_state::{AppHandleExt, StateFlags, WindowExt};

#[cfg(target_os = "macos")]
mod mac_window;
mod window;
#[cfg(target_os = "macos")]
mod window_menu;

#[macro_use]
mod macros;

use window::MAIN_WINDOW_PREFIX;

#[derive(Default)]
pub struct AppState {}

#[tauri::command]
async fn cmd_new_child_window(
    parent_window: WebviewWindow,
    url: &str,
    label: &str,
    title: &str,
    inner_size: (f64, f64),
) -> Result<(), String> {
    window::create_child_window(&parent_window, url, label, title, inner_size);
    Ok(())
}

#[tauri::command]
async fn cmd_new_main_window(
    app_handle: AppHandle,
    url: &str,
    size: Option<(f64, f64)>,
    position: Option<(f64, f64)>,
) -> Result<(), String> {
    window::create_main_window(&app_handle, url, size, position);
    Ok(())
}

// A mousedown on a note's header either starts the native window drag
// or, when it follows another press closely enough, reports a double
// click for the frontend to act on. WebKit's own click counter
// (e.detail) is unreliable here because the native drag session
// started by the first press swallows the mouseup; `position` is the
// cursor in screen coordinates.
#[tauri::command]
async fn cmd_header_mouse_down(
    window: WebviewWindow,
    position: (f64, f64),
) -> Result<bool, String> {
    let state = window.app_handle().state::<window::HeaderClickState>();
    if window::register_header_click(&state, window.label(), position) {
        return Ok(true);
    }

    window.start_dragging().map_err(|e| e.to_string())?;
    Ok(false)
}

// Toggles the floating search panel anchored to the calling window. The
// panel is created on first use and kept around hidden afterwards, so
// reopening it is instant.
#[tauri::command]
async fn cmd_open_search_window(
    window: WebviewWindow,
    active_note_id: Option<String>,
) -> Result<(), String> {
    let label = window::search_window_label(window.label());
    if let Some(w) = window.app_handle().webview_windows().get(&label) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else if !window::panel_recently_hidden(window.app_handle(), &label) {
            let _ = w.emit_to(label.as_str(), "search:reset", active_note_id);
            window::present_search_window(&window, w);
        }
        return Ok(());
    }

    let mut url = format!("/search?parent={}", window.label());
    if let Some(id) = active_note_id {
        url.push_str(&format!("&noteId={id}"));
    }

    window::create_search_window(&window, &url);
    Ok(())
}

// Toggles the floating link editor popped up under the toolbar's link
// button; `anchor` is the button's bottom-center in logical coordinates
// relative to the calling window's top-left corner. Like the search
// panel, it is created on first use and kept around hidden afterwards.
#[tauri::command]
async fn cmd_open_link_window(
    window: WebviewWindow,
    current_url: Option<String>,
    anchor: (f64, f64),
) -> Result<(), String> {
    let label = window::link_window_label(window.label());
    if let Some(w) = window.app_handle().webview_windows().get(&label) {
        if w.is_visible().unwrap_or(false) {
            let _ = w.hide();
        } else if !window::panel_recently_hidden(window.app_handle(), &label) {
            let _ = w.emit_to(label.as_str(), "link:reset", current_url);
            window::present_link_window(&window, w, anchor);
        }
        return Ok(());
    }

    // The href can contain any character, so the initial value travels
    // to the panel percent-encoded in the query string.
    let mut url = tauri::Url::parse("tauri://localhost/link")
        .expect("Link panel base URL should parse");
    url.query_pairs_mut().append_pair("parent", window.label());
    if let Some(href) = &current_url {
        url.query_pairs_mut().append_pair("url", href);
    }
    let url = format!("{}?{}", url.path(), url.query().unwrap_or_default());

    window::create_link_window(&window, &url, anchor);
    Ok(())
}

// Shows a transient toast over the calling window. The toast lives in
// a small non-focusable panel window; like the other panels, it is
// created on first use and kept around hidden afterwards.
#[tauri::command]
async fn cmd_show_toast(
    window: WebviewWindow,
    message: String,
) -> Result<(), String> {
    let label = window::toast_window_label(window.label());
    if let Some(w) = window.app_handle().webview_windows().get(&label) {
        let _ = w.emit_to(label.as_str(), "toast:show", message);
        return Ok(());
    }

    // The first message travels percent-encoded in the query string;
    // the webview is not ready to receive events yet.
    let mut url = tauri::Url::parse("tauri://localhost/toast")
        .expect("Toast panel base URL should parse");
    url.query_pairs_mut()
        .append_pair("parent", window.label())
        .append_pair("message", &message);
    let url = format!("{}?{}", url.path(), url.query().unwrap_or_default());

    window::create_toast_window(&window, &url);
    Ok(())
}

// Called by the toast webview once it has sized the window to fit the
// message; anchors the toast over its parent, reveals it, and hides it
// again after a delay.
#[tauri::command]
async fn cmd_present_toast(
    window: WebviewWindow,
    parent: String,
) -> Result<(), String> {
    let Some(parent_window) =
        window.app_handle().webview_windows().get(&parent).cloned()
    else {
        return Err(format!("Unknown toast parent window: {parent}"));
    };

    window::present_toast_window(&parent_window, &window).await;
    Ok(())
}

// Pops up a native formatting menu for the editor toolbar; the chosen
// action comes back to the window as a `format-menu:action` event.
#[tauri::command]
async fn cmd_popup_format_menu(
    window: tauri::Window,
    menu: String,
    active: Vec<String>,
    position: (f64, f64),
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return window_menu::popup_format_menu(&window, &menu, &active, position)
        .map_err(|e| e.to_string());

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, menu, active, position);
        Ok(())
    }
}

#[tauri::command]
async fn cmd_list_notes<R: Runtime>(
    app_handle: AppHandle<R>,
) -> Result<Vec<Note>, Error> {
    list_notes(&app_handle).await
}

#[tauri::command]
async fn cmd_get_note<R: Runtime>(
    id: String,
    app_handle: AppHandle<R>,
) -> Result<Note, Error> {
    get_note(&app_handle, &id).await
}

#[tauri::command]
async fn cmd_upsert_note<R: Runtime>(
    note: Note,
    app_handle: AppHandle<R>,
) -> Result<Note, Error> {
    upsert_note(&app_handle, note).await
}

#[tauri::command]
async fn cmd_delete_note<R: Runtime>(
    note_id: String,
    app_handle: AppHandle<R>,
) -> Result<(), Error> {
    delete_note(&app_handle, &note_id).await
}

pub fn custom_colored_format(
    w: &mut dyn Write,
    now: &mut DeferredNow,
    record: &Record,
) -> IoResult<()> {
    let (level_color, level_str, msg_color, msg_fg_highlight) =
        match record.level() {
            Level::Error => ("\x1b[38;5;196m", "ERROR", "\x1b[38;5;196m", true),
            Level::Warn => ("\x1b[38;5;226m", "WARN ", "\x1b[38;5;226m", true),
            Level::Info => ("\x1b[38;5;51m", "INFO ", "\x1b[38;5;15m", false),
            Level::Debug => ("\x1b[38;5;27m", "DEBUG", "\x1b[38;5;15m", false),
            Level::Trace => ("\x1b[38;5;201m", "TRACE", "\x1b[38;5;15m", false),
        };

    let timestamp_color = "\x1b[38;5;15m";
    let module_color = "\x1b[38;5;250m";
    let reset = "\x1b[0m";

    let timestamp = now.format("%Y-%m-%d %H:%M:%S");
    let module = record.module_path().unwrap_or("<unknown>");

    let space = if msg_fg_highlight { "" } else { " " };
    write!(
        w,
        "{timestamp_color}{timestamp}{reset} [{level_color}{level_str}{reset}]{space}\n[{module_color}{module}{reset}] {msg_color}{msg}{reset}\n",
        msg = record.args(),
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    let log_spec =
        LogSpecification::builder().default(log::LevelFilter::Trace).build();

    #[cfg(not(debug_assertions))]
    let log_spec =
        LogSpecification::builder().default(log::LevelFilter::Info).build();

    let log_dir = std::env::temp_dir().join("notes_logs");
    std::fs::create_dir_all(&log_dir).unwrap_or_else(|e| {
        eprintln!("Failed to create log directory: {}", e);
    });

    let mut logger = Logger::with(log_spec)
        .log_to_file(FileSpec::default().directory(log_dir))
        .rotate(
            Criterion::Age(Age::Day),
            Naming::Timestamps,
            Cleanup::KeepLogFiles(3),
        )
        .format_for_files(flexi_logger::detailed_format);

    #[cfg(debug_assertions)]
    {
        use flexi_logger::Duplicate;
        logger = logger
            .duplicate_to_stdout(Duplicate::All)
            .format_for_stdout(custom_colored_format);
    }

    logger.start().unwrap_or_else(|e| {
        panic!("Failed to initialize logger: {}", e);
    });

    #[allow(unused_mut)]
    let mut builder = tauri::Builder::default()
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .skip_initial_state(&format!("{MAIN_WINDOW_PREFIX}0"))
                // Utility windows (like the search panel) are positioned
                // by the app; restoring a saved state would override it.
                .with_filter(|label| {
                    !label.starts_with(window::OTHER_WINDOW_PREFIX)
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(sticky_models::plugin::init())
        .setup(|app_handle: &mut App| {
            debug_log!("Setting up Tauri application");

            #[cfg(target_os = "macos")]
            {
                app_handle
                    .set_activation_policy(tauri::ActivationPolicy::Accessory);
            }

            let image = include_image!("./icons/tray/32x32.png");
            let _ =
                TrayIconBuilder::new().icon(image).build(app_handle).unwrap();
            app_handle.manage(AppState::default());
            app_handle.manage(window::PanelState::default());
            app_handle.manage(window::ToastState::default());
            app_handle.manage(window::HeaderClickState::new());

            Ok(())
        });

    builder
        .invoke_handler(tauri::generate_handler![
            cmd_header_mouse_down,
            cmd_new_child_window,
            cmd_new_main_window,
            cmd_open_link_window,
            cmd_open_search_window,
            cmd_popup_format_menu,
            cmd_show_toast,
            cmd_present_toast,
            cmd_list_notes,
            cmd_get_note,
            cmd_upsert_note,
            cmd_delete_note,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application")
        .run(|app_handle, event| {
            match event {
                RunEvent::Ready => {
                    debug_log!("Application is ready, creating main window");
                    let handle = app_handle.clone();
                    let window =
                        window::create_main_window(&handle, "/", None, None);

                    tauri::async_runtime::spawn(async move {
                        match window.restore_state(StateFlags::all()) {
                            Ok(_) => {
                                debug_log!("Restored window size successfully");
                            }
                            Err(e) => {
                                error!("Failed to restore window size: {:?}", e)
                            }
                        }
                    });
                }

                RunEvent::WindowEvent {
                    event: WindowEvent::Focused(true),
                    label,
                    ..
                } => {
                    debug_log!("Window focused: {}", label);
                }

                RunEvent::WindowEvent {
                    event: WindowEvent::CloseRequested { .. },
                    label,
                    ..
                } => {
                    debug_log!("Window close requested: {}", label);
                    let is_first_main_window =
                        label == format!("{MAIN_WINDOW_PREFIX}0");
                    // Utility windows (like the search panel) don't count
                    // towards the "last window standing" check.
                    let main_window_count = app_handle
                        .webview_windows()
                        .keys()
                        .filter(|l| l.starts_with(MAIN_WINDOW_PREFIX))
                        .count();
                    if !label.starts_with(window::OTHER_WINDOW_PREFIX)
                        && main_window_count <= 1
                        && is_first_main_window
                    {
                        if let Err(e) =
                            app_handle.save_window_state(StateFlags::all())
                        {
                            warn!("Failed to save window state {e:?}");
                        } else {
                            debug_log!("Window state saved successfully");
                        };
                    } else {
                        debug_log!(
                            "Skipping window state save for label: {}",
                            label
                        );
                    }
                }
                _ => {}
            };
        })
}
