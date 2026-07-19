//! Note windows and the utility panels floated over them.

mod link;
mod main;
mod panel;
mod search;
mod toast;

pub use link::{create_link_window, link_window_label, present_link_window};
pub use main::{create_child_window, create_main_window};
pub use panel::{panel_recently_hidden, PanelState};
pub use search::{
    create_search_window, present_search_window, search_window_label,
};
pub use toast::{
    create_toast_window, present_toast_window, toast_window_label, ToastState,
};

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow,
    WindowEvent,
};
use tokio::sync::mpsc;

use crate::debug_log;

/// Label prefix of the note windows.
pub const MAIN_WINDOW_PREFIX: &str = "main_";
/// Label prefix of the utility windows; the window-state plugin skips
/// these.
pub const OTHER_WINDOW_PREFIX: &str = "other_";

pub use sticky_models::constants::{MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH};

/// Settings for a window about to be created.
#[derive(Default, Debug)]
pub(crate) struct CreateWindowConfig<'s> {
    pub url: &'s str,
    pub label: &'s str,
    pub title: &'s str,
    pub inner_size: Option<(f64, f64)>,
    pub position: Option<(f64, f64)>,
    pub navigation_tx: Option<mpsc::Sender<String>>,
    pub close_tx: Option<mpsc::Sender<()>>,
    pub hide_titlebar: bool,
    pub always_on_top: bool,
    pub max_size: Option<(Option<f64>, Option<f64>)>,
    pub fixed_size: bool,
    /// Created invisible, for windows that are positioned after creation.
    pub start_hidden: bool,
    /// Skips the automatic focus on creation, for display-only panels
    /// that are never given focus afterwards either.
    pub no_auto_focus: bool,
}

/// Creates a window according to `config`, wiring up the app menu, the
/// macOS traffic lights, and the menu event handling shared by every
/// window.
pub(crate) fn create_window<R: Runtime>(
    handle: &AppHandle<R>,
    config: CreateWindowConfig,
) -> WebviewWindow<R> {
    #[cfg(target_os = "macos")]
    {
        use crate::window_menu::app_menu;

        let menu = app_menu(handle).unwrap();
        handle.set_menu(menu).expect("Failed to set app menu");
    }

    debug_log!("Create new window label={}", config.label);

    let mut win_builder = tauri::WebviewWindowBuilder::new(
        handle,
        config.label,
        WebviewUrl::App(config.url.into()),
    )
    .title(config.title)
    .resizable(!config.fixed_size)
    .fullscreen(false)
    .disable_drag_drop_handler(); // Required for frontend Dnd on windows

    if !config.fixed_size {
        win_builder =
            win_builder.min_inner_size(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT);
    }

    if config.start_hidden {
        win_builder = win_builder.visible(false);
    }

    if config.no_auto_focus {
        win_builder = win_builder.focused(false);
    }

    if let Some((w, h)) = config.inner_size {
        win_builder = win_builder.inner_size(w, h);
    } else {
        win_builder = win_builder.inner_size(600.0, 600.0);
    }

    if let Some((x, y)) = config.position {
        win_builder = win_builder.position(x, y);
    } else {
        win_builder = win_builder.center();
    }

    if let Some(tx) = config.navigation_tx {
        win_builder = win_builder.on_navigation(move |url| {
            let url = url.to_string();
            let tx = tx.clone();
            tauri::async_runtime::block_on(async move {
                tx.send(url).await.unwrap();
            });
            true
        });
    }

    if config.hide_titlebar {
        #[cfg(target_os = "macos")]
        {
            use tauri::TitleBarStyle;
            win_builder = win_builder
                .hidden_title(true)
                .title_bar_style(TitleBarStyle::Overlay);
        }
    }

    if let Some((max_width, max_height)) = config.max_size {
        match (max_width, max_height) {
            (Some(w), Some(h)) => {
                win_builder = win_builder.max_inner_size(w, h);
            }
            (Some(w), None) => {
                win_builder = win_builder.max_inner_size(w, f64::MAX);
            }
            (None, Some(h)) => {
                win_builder = win_builder.max_inner_size(f64::MAX, h);
            }
            _ => {}
        }
    }

    if config.always_on_top {
        win_builder = win_builder.always_on_top(true);
    }

    if let Some(w) = handle.webview_windows().get(config.label) {
        debug_log!(
            "Webview with label {} already exists. Focusing existing",
            config.label
        );
        w.set_focus().unwrap();
        return w.to_owned();
    }

    let win = win_builder.build().unwrap();

    if let Some(tx) = config.close_tx {
        win.on_window_event(move |event| match event {
            WindowEvent::CloseRequested { .. } => {
                let tx = tx.clone();
                tauri::async_runtime::spawn(async move {
                    tx.send(()).await.unwrap();
                });
            }
            _ => {}
        });
    }

    #[cfg(target_os = "macos")]
    {
        use log::warn;
        use tauri_plugin_opener::OpenerExt;

        use crate::mac_window;

        // AppKit is main-thread-only; windows can be created from async
        // commands, which run on a worker thread.
        let traffic_light_window = win.clone();
        win.run_on_main_thread(move || {
            mac_window::setup_traffic_light_positioner(&traffic_light_window)
        })
        .expect("Failed to set up traffic lights on the main thread");

        win.on_menu_event(move |w, event| {
            if !w.is_focused().unwrap() {
                return;
            }

            let event_id = event.id().0.as_str();

            // Selections from the native formatting menus popped up by
            // `window_menu::popup_format_menu`; the editor applies them.
            if let Some(action) = event_id.strip_prefix("format:") {
                let _ = w.emit_to(w.label(), "format-menu:action", action);
                return;
            }

            match event_id {
                "hacked_quit" => {
                    // Cmd+Q on macOS doesn't trigger `CloseRequested` so we use a custom Quit menu
                    // and trigger close() for each window.
                    w.webview_windows().iter().for_each(|(_, w)| {
                        debug_log!("Closing window {}", w.label());
                        let _ = w.close();
                    });
                }
                "close" => w.close().unwrap(),
                "open_feedback" => {
                    debug_log!("Opening feedback URL");
                    if let Err(e) = w
                        .app_handle()
                        .opener()
                        .open_url("https://arikko.dev/", None::<&str>)
                    {
                        warn!("Failed to open feedback {e:?}")
                    }
                }
                _ => {}
            }
        });
    }

    win
}
