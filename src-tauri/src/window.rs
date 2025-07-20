use tauri::{AppHandle, Manager, Runtime, WebviewUrl, WebviewWindow, WindowEvent};
use tokio::sync::mpsc;

use crate::debug_log;

pub const MAIN_WINDOW_PREFIX: &str = "main_";
pub const OTHER_WINDOW_PREFIX: &str = "other_";

pub const DEFAULT_WINDOW_WIDTH: f64 = 400.0;
pub const DEFAULT_WINDOW_HEIGHT: f64 = 700.0;

pub const MIN_WINDOW_WIDTH: f64 = 400.0;
pub const MIN_WINDOW_HEIGHT: f64 = 400.0;

pub const MAX_WINDOW_WIDTH: f64 = 700.0;

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
}

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

    let mut win_builder =
        tauri::WebviewWindowBuilder::new(handle, config.label, WebviewUrl::App(config.url.into()))
            .title(config.title)
            .resizable(true)
            .fullscreen(false)
            .disable_drag_drop_handler() // Required for frontend Dnd on windows
            .min_inner_size(MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT);

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
        mac_window::setup_traffic_light_positioner(&win);

        win.on_menu_event(move |w, event| {
            if !w.is_focused().unwrap() {
                return;
            }

            let event_id = event.id().0.as_str();
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

pub fn create_main_window(
    handle: &AppHandle,
    url: &str,
    position: Option<(f64, f64)>,
) -> WebviewWindow {
    let mut counter = 0;
    let label = loop {
        let label = format!("{MAIN_WINDOW_PREFIX}{counter}");
        match handle.webview_windows().get(label.as_str()) {
            None => break Some(label),
            Some(_) => counter += 1,
        }
    }
    .expect("Failed to generate label for new window");

    let position = position.unwrap_or((100.0, 100.0));

    let config = CreateWindowConfig {
        url,
        label: label.as_str(),
        title: "Sticky Notes",
        inner_size: Some((DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)),
        position: Some(position),
        hide_titlebar: true,
        always_on_top: true,
        max_size: Some((Some(MAX_WINDOW_WIDTH), None)),
        ..Default::default()
    };

    create_window(handle, config)
}

pub fn create_child_window(
    parent_window: &WebviewWindow,
    url: &str,
    label: &str,
    title: &str,
    inner_size: (f64, f64),
) -> WebviewWindow {
    let app_handle = parent_window.app_handle();
    let label = format!("{OTHER_WINDOW_PREFIX}_{label}");
    let scale_factor = parent_window.scale_factor().unwrap();

    let current_pos = parent_window
        .inner_position()
        .unwrap()
        .to_logical::<f64>(scale_factor);
    let current_size = parent_window
        .inner_size()
        .unwrap()
        .to_logical::<f64>(scale_factor);

    let position = (
        current_pos.x + current_size.width / 2.0 - inner_size.0 / 2.0,
        current_pos.y + current_size.height / 2.0 - inner_size.1 / 2.0,
    );

    let config = CreateWindowConfig {
        label: label.as_str(),
        title,
        url,
        inner_size: Some(inner_size),
        position: Some(position),
        hide_titlebar: true,
        ..Default::default()
    };

    let child_window = create_window(&app_handle, config);

    {
        let parent_window = parent_window.clone();
        let child_window = child_window.clone();
        child_window.clone().on_window_event(move |e| match e {
            WindowEvent::Destroyed => {
                if let Some(w) = parent_window.get_webview_window(child_window.label()) {
                    w.set_focus().unwrap();
                }
            }
            _ => {}
        });
    }

    {
        let parent_window = parent_window.clone();
        let child_window = child_window.clone();
        parent_window.clone().on_window_event(move |e| match e {
            WindowEvent::CloseRequested { .. } => child_window.close().unwrap(),
            WindowEvent::Focused(focus) => {
                if *focus {
                    if let Some(w) = parent_window.get_webview_window(child_window.label()) {
                        w.set_focus().unwrap();
                    };
                }
            }
            _ => {}
        });
    }

    child_window
}
