use flexi_logger::LogSpecification;
use flexi_logger::{Age, Cleanup, Criterion, FileSpec, Logger, Naming};
use log::{error, warn};
use sticky_models::models::Note;
use sticky_models::queries::{delete_note, get_note, get_setting, list_notes, set_setting, upsert_note};
use tauri::{
    include_image, tray::TrayIconBuilder, App, AppHandle, Manager, RunEvent,
    Runtime, WebviewWindow, WindowEvent,
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

#[tauri::command]
async fn cmd_list_notes<R: Runtime>(
    app_handle: AppHandle<R>,
) -> Result<Vec<Note>, String> {
    list_notes(&app_handle).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_get_note<R: Runtime>(
    id: String,
    app_handle: AppHandle<R>,
) -> Result<Note, String> {
    get_note(&app_handle, &id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_upsert_note<R: Runtime>(
    note: Note,
    app_handle: AppHandle<R>,
) -> Result<Note, String> {
    upsert_note(&app_handle, note).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_delete_note<R: Runtime>(
    note_id: String,
    app_handle: AppHandle<R>,
) -> Result<(), String> {
    delete_note(&app_handle, &note_id).await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_get_setting<R: Runtime>(
    key: String,
    app_handle: AppHandle<R>,
) -> Result<Option<String>, String> {
    get_setting(&app_handle, &key)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn cmd_set_setting<R: Runtime>(
    key: String,
    value: String,
    app_handle: AppHandle<R>,
) -> Result<(), String> {
    set_setting(&app_handle, &key, &value)
        .await
        .map_err(|e| e.to_string())
}

// Custom colored format for logging
use flexi_logger::DeferredNow;
use log::{Level, Record};
use std::io::{Result as IoResult, Write};

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

    if msg_fg_highlight {
        write!(
            w,
            "{ts_color}{timestamp}{reset} [{level_color}{level_str}{reset}]\n[{module_color}{module}{reset}] {msg_color}{msg}{reset}\n",
            ts_color = timestamp_color,
            timestamp = timestamp,
            reset = reset,
            level_color = level_color,
            level_str = level_str,
            module_color = module_color,
            module = module,
            msg_color = msg_color,
            msg = record.args(),
        )
    } else {
        write!(
            w,
            "{ts_color}{timestamp}{reset} [{level_color}{level_str}{reset}] \n[{module_color}{module}{reset}] {msg_color}{msg}{reset}\n",
            ts_color = timestamp_color,
            timestamp = timestamp,
            reset = reset,
            level_color = level_color,
            level_str = level_str,
            module_color = module_color,
            module = module,
            msg_color = msg_color,
            msg = record.args()
        )
    }
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

            Ok(())
        });

    builder
        .invoke_handler(tauri::generate_handler![
            cmd_new_child_window,
            cmd_new_main_window,
            cmd_list_notes,
            cmd_get_note,
            cmd_upsert_note,
            cmd_delete_note,
            cmd_get_setting,
            cmd_set_setting,
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
                    if !label.starts_with(window::OTHER_WINDOW_PREFIX)
                        && !(app_handle.webview_windows().len() > 1)
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
