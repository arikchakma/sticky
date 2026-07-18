use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    AppHandle, Emitter, Manager, Runtime, WebviewUrl, WebviewWindow,
    WindowEvent,
};
use tokio::sync::mpsc;

use crate::debug_log;

pub const MAIN_WINDOW_PREFIX: &str = "main_";
pub const OTHER_WINDOW_PREFIX: &str = "other_";

pub const DEFAULT_FIRST_MAIN_WINDOW_HEIGHT: f64 = 190.0;
pub const DEFAULT_WINDOW_WIDTH: f64 = 400.0;
pub const DEFAULT_WINDOW_HEIGHT: f64 = 700.0;

pub const MIN_WINDOW_WIDTH: f64 = 400.0;
pub const MIN_WINDOW_HEIGHT: f64 = 115.0;

pub const MAX_WINDOW_WIDTH: f64 = 700.0;

pub const SEARCH_WINDOW_MIN_WIDTH: f64 = 360.0;
pub const SEARCH_WINDOW_MAX_WIDTH: f64 = 480.0;
// Maximum panel height; the frontend shrinks the window to fit its
// content. Keep in sync with MAX_PANEL_HEIGHT in src-web's search route.
pub const SEARCH_WINDOW_HEIGHT: f64 = 430.0;
// Horizontal inset from the parent window's edges, and the distance
// between the parent's top edge and the panel's.
pub const SEARCH_WINDOW_INSET: f64 = 16.0;
pub const SEARCH_WINDOW_TOP_OFFSET: f64 = 50.0;

pub const LINK_WINDOW_WIDTH: f64 = 256.0;
pub const LINK_WINDOW_HEIGHT: f64 = 44.0;

pub const TOAST_WINDOW_HEIGHT: f64 = 36.0;
// Gap between the toast's bottom edge and its parent's.
pub const TOAST_WINDOW_INSET: f64 = 12.0;
pub const TOAST_HIDE_DELAY: Duration = Duration::from_millis(3000);

// Clicking the toggle button while a panel is open blurs the panel
// first (hiding it) and only then delivers the click, which would
// instantly re-present it. Reopens within this grace period of a
// blur-hide are treated as that same click and ignored.
pub const PANEL_TOGGLE_GRACE: Duration = Duration::from_millis(300);

// When each utility panel was last hidden because it lost focus,
// keyed by the panel's label.
#[derive(Default)]
pub struct PanelState(pub Mutex<HashMap<String, Instant>>);

pub fn panel_recently_hidden<R: Runtime>(
    app_handle: &AppHandle<R>,
    label: &str,
) -> bool {
    let state = app_handle.state::<PanelState>();
    let hidden_at = state.0.lock().expect("Panel state poisoned");
    hidden_at.get(label).is_some_and(|at| at.elapsed() < PANEL_TOGGLE_GRACE)
}

fn mark_panel_hidden<R: Runtime>(window: &WebviewWindow<R>) {
    let state = window.app_handle().state::<PanelState>();
    let mut hidden_at = state.0.lock().expect("Panel state poisoned");
    hidden_at.insert(window.label().to_string(), Instant::now());
}

// Every generation a toast panel was presented, keyed by the panel's
// label. A toast re-shown while still visible bumps the generation,
// which invalidates the earlier show's hide timer.
#[derive(Default)]
pub struct ToastState(pub Mutex<HashMap<String, u64>>);

fn close_panel_with_parent(
    parent_window: &WebviewWindow,
    panel: &WebviewWindow,
) {
    let panel = panel.clone();
    parent_window.on_window_event(move |e| match e {
        WindowEvent::CloseRequested { .. } | WindowEvent::Destroyed => {
            let _ = panel.close();
        }
        _ => {}
    });
}

// Utility panels are created once and then kept around so reopening
// them is instant: losing focus only hides them, and they die with
// their parent window.
fn attach_panel_lifecycle(
    parent_window: &WebviewWindow,
    panel: &WebviewWindow,
) {
    {
        let panel = panel.clone();
        panel.clone().on_window_event(move |e| match e {
            WindowEvent::Focused(false) => {
                if panel.hide().is_ok() {
                    mark_panel_hidden(&panel);
                }
            }
            _ => {}
        });
    }

    close_panel_with_parent(parent_window, panel);
}

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
    // Created invisible, for windows that are positioned after creation.
    pub start_hidden: bool,
    // Skips the automatic focus on creation, for display-only panels
    // that are never given focus afterwards either.
    pub no_auto_focus: bool,
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

pub fn create_main_window(
    handle: &AppHandle,
    url: &str,
    size: Option<(f64, f64)>,
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
    let default_size = if counter == 0 {
        (DEFAULT_WINDOW_WIDTH, DEFAULT_FIRST_MAIN_WINDOW_HEIGHT)
    } else {
        (DEFAULT_WINDOW_WIDTH, DEFAULT_WINDOW_HEIGHT)
    };
    let inner_size = size.unwrap_or(default_size);

    let config = CreateWindowConfig {
        url,
        label: label.as_str(),
        title: "Sticky",
        inner_size: Some(inner_size),
        position: Some(position),
        hide_titlebar: true,
        always_on_top: true,
        max_size: Some((Some(MAX_WINDOW_WIDTH), None)),
        ..Default::default()
    };

    create_window(handle, config)
}

pub fn search_window_label(parent_label: &str) -> String {
    format!("{OTHER_WINDOW_PREFIX}search_{parent_label}")
}

// A floating search panel anchored to a note window, behaving like a
// native pop-over: fixed size, no window controls, and dismissed as
// soon as it loses focus.
pub fn create_search_window(
    parent_window: &WebviewWindow,
    url: &str,
) -> WebviewWindow {
    let app_handle = parent_window.app_handle();
    let label = search_window_label(parent_window.label());
    let scale_factor = parent_window.scale_factor().unwrap();

    let parent_size =
        parent_window.outer_size().unwrap().to_logical::<f64>(scale_factor);

    let width = (parent_size.width - SEARCH_WINDOW_INSET * 2.0)
        .clamp(SEARCH_WINDOW_MIN_WIDTH, SEARCH_WINDOW_MAX_WIDTH);

    let config = CreateWindowConfig {
        url,
        label: label.as_str(),
        title: "Search Notes",
        inner_size: Some((width, SEARCH_WINDOW_HEIGHT)),
        hide_titlebar: true,
        always_on_top: true,
        fixed_size: true,
        start_hidden: true,
        ..Default::default()
    };

    let search_window = create_window(&app_handle, config);

    #[cfg(target_os = "macos")]
    {
        // AppKit is main-thread-only; see create_window. The panel stays
        // invisible after anchoring: the frontend shows it once it has
        // shrunk the window to fit its content, so it never flashes at
        // the wrong position or size.
        let panel = search_window.clone();
        let parent = parent_window.clone();
        search_window
            .clone()
            .run_on_main_thread(move || {
                crate::mac_window::hide_window_controls(&panel);
                crate::mac_window::anchor_panel_to_parent(
                    &panel,
                    &parent,
                    SEARCH_WINDOW_TOP_OFFSET,
                );
            })
            .expect("Failed to set up the search panel on the main thread");
    }

    attach_panel_lifecycle(parent_window, &search_window);

    search_window
}

// Re-anchors an existing (hidden) search panel to its parent and brings
// it back up, focused.
pub fn present_search_window(
    parent_window: &WebviewWindow,
    search_window: &WebviewWindow,
) {
    #[cfg(target_os = "macos")]
    {
        let panel = search_window.clone();
        let parent = parent_window.clone();
        search_window
            .run_on_main_thread(move || {
                crate::mac_window::anchor_panel_to_parent(
                    &panel,
                    &parent,
                    SEARCH_WINDOW_TOP_OFFSET,
                );
                let _ = panel.show();
                let _ = panel.set_focus();
            })
            .expect("Failed to present the search panel on the main thread");
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = parent_window;
        let _ = search_window.show();
        let _ = search_window.set_focus();
    }
}

pub fn link_window_label(parent_label: &str) -> String {
    format!("{OTHER_WINDOW_PREFIX}link_{parent_label}")
}

// A floating link editor popped up under the toolbar's link button,
// behaving like the native format menus: always on top, no window
// controls, and dismissed as soon as it loses focus. `anchor` is the
// button's bottom-center in logical coordinates relative to the parent
// window's top-left corner; the panel is centered on it.
pub fn create_link_window(
    parent_window: &WebviewWindow,
    url: &str,
    anchor: (f64, f64),
) -> WebviewWindow {
    let app_handle = parent_window.app_handle();
    let label = link_window_label(parent_window.label());

    let config = CreateWindowConfig {
        url,
        label: label.as_str(),
        title: "Edit Link",
        inner_size: Some((LINK_WINDOW_WIDTH, LINK_WINDOW_HEIGHT)),
        hide_titlebar: true,
        always_on_top: true,
        fixed_size: true,
        start_hidden: true,
        ..Default::default()
    };

    let link_window = create_window(&app_handle, config);

    #[cfg(target_os = "macos")]
    {
        // AppKit is main-thread-only; see create_window. The panel stays
        // invisible after anchoring: the frontend shows it once mounted,
        // so it never flashes at the wrong position.
        let panel = link_window.clone();
        let parent = parent_window.clone();
        link_window
            .clone()
            .run_on_main_thread(move || {
                crate::mac_window::hide_window_controls(&panel);
                crate::mac_window::anchor_panel_at(
                    &panel,
                    &parent,
                    anchor.0 - LINK_WINDOW_WIDTH / 2.0,
                    anchor.1,
                );
            })
            .expect("Failed to set up the link panel on the main thread");
    }

    #[cfg(not(target_os = "macos"))]
    let _ = anchor;

    attach_panel_lifecycle(parent_window, &link_window);

    link_window
}

// Re-anchors an existing (hidden) link panel under the toolbar's link
// button and brings it back up, focused.
pub fn present_link_window(
    parent_window: &WebviewWindow,
    link_window: &WebviewWindow,
    anchor: (f64, f64),
) {
    #[cfg(target_os = "macos")]
    {
        let panel = link_window.clone();
        let parent = parent_window.clone();
        link_window
            .run_on_main_thread(move || {
                crate::mac_window::anchor_panel_at(
                    &panel,
                    &parent,
                    anchor.0 - LINK_WINDOW_WIDTH / 2.0,
                    anchor.1,
                );
                let _ = panel.show();
                let _ = panel.set_focus();
            })
            .expect("Failed to present the link panel on the main thread");
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (parent_window, anchor);
        let _ = link_window.show();
        let _ = link_window.set_focus();
    }
}

pub fn toast_window_label(parent_label: &str) -> String {
    format!("{OTHER_WINDOW_PREFIX}toast_{parent_label}")
}

// A transient notification pill floated over the bottom of its parent
// window. It can never take focus and lets clicks fall through, so it
// never interrupts typing.
pub fn create_toast_window(
    parent_window: &WebviewWindow,
    url: &str,
) -> WebviewWindow {
    let app_handle = parent_window.app_handle();
    let label = toast_window_label(parent_window.label());

    let config = CreateWindowConfig {
        url,
        label: label.as_str(),
        title: "Toast",
        inner_size: Some((200.0, TOAST_WINDOW_HEIGHT)),
        hide_titlebar: true,
        always_on_top: true,
        fixed_size: true,
        start_hidden: true,
        no_auto_focus: true,
        ..Default::default()
    };

    let toast_window = create_window(&app_handle, config);
    let _ = toast_window.set_ignore_cursor_events(true);

    #[cfg(target_os = "macos")]
    {
        // AppKit is main-thread-only; see create_window.
        let panel = toast_window.clone();
        toast_window
            .clone()
            .run_on_main_thread(move || {
                crate::mac_window::hide_window_controls(&panel);
            })
            .expect("Failed to set up the toast panel on the main thread");
    }

    close_panel_with_parent(parent_window, &toast_window);

    toast_window
}

// Shows the toast bottom-centered over its parent and hides it again
// after TOAST_HIDE_DELAY, unless a newer show has extended its life.
// Called by the toast webview itself, once it has sized the window to
// fit the message.
pub async fn present_toast_window(
    parent_window: &WebviewWindow,
    toast_window: &WebviewWindow,
) {
    let generation = {
        let state = toast_window.app_handle().state::<ToastState>();
        let mut generations = state.0.lock().expect("Toast state poisoned");
        let generation =
            generations.entry(toast_window.label().to_string()).or_insert(0);
        *generation += 1;
        *generation
    };

    #[cfg(target_os = "macos")]
    {
        let scale_factor = parent_window.scale_factor().unwrap();
        let parent_size =
            parent_window.outer_size().unwrap().to_logical::<f64>(scale_factor);
        let toast_size =
            toast_window.outer_size().unwrap().to_logical::<f64>(scale_factor);

        let panel = toast_window.clone();
        let parent = parent_window.clone();
        toast_window
            .run_on_main_thread(move || {
                crate::mac_window::anchor_panel_at(
                    &panel,
                    &parent,
                    (parent_size.width - toast_size.width) / 2.0,
                    parent_size.height - TOAST_WINDOW_INSET - toast_size.height,
                );
                let _ = panel.show();
            })
            .expect("Failed to present the toast panel on the main thread");
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = parent_window;
        let _ = toast_window.show();
    }

    tokio::time::sleep(TOAST_HIDE_DELAY).await;

    let state = toast_window.app_handle().state::<ToastState>();
    let current = state
        .0
        .lock()
        .expect("Toast state poisoned")
        .get(toast_window.label())
        .copied()
        .unwrap_or(0);
    if current == generation {
        let _ = toast_window.hide();
    }
}

pub fn create_child_window(
    parent_window: &WebviewWindow,
    url: &str,
    label: &str,
    title: &str,
    inner_size: (f64, f64),
) -> WebviewWindow {
    let app_handle = parent_window.app_handle();
    let label = format!("{OTHER_WINDOW_PREFIX}{label}");
    let scale_factor = parent_window.scale_factor().unwrap();

    let current_pos =
        parent_window.inner_position().unwrap().to_logical::<f64>(scale_factor);
    let current_size =
        parent_window.inner_size().unwrap().to_logical::<f64>(scale_factor);

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
                if let Some(w) =
                    parent_window.get_webview_window(child_window.label())
                {
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
                    if let Some(w) =
                        parent_window.get_webview_window(child_window.label())
                    {
                        w.set_focus().unwrap();
                    };
                }
            }
            _ => {}
        });
    }

    child_window
}
