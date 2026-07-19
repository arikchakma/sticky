//! The transient toast panel.

use super::panel::close_panel_with_parent;
use super::*;

pub const TOAST_WINDOW_HEIGHT: f64 = 36.0;
/// Gap between the toast's bottom edge and its parent's.
pub const TOAST_WINDOW_INSET: f64 = 12.0;
pub const TOAST_HIDE_DELAY: Duration = Duration::from_millis(3000);

/// Every generation a toast panel was presented, keyed by the panel's
/// label. A toast re-shown while still visible bumps the generation,
/// which invalidates the earlier show's hide timer.
#[derive(Default)]
pub struct ToastState(pub Mutex<HashMap<String, u64>>);

/// Returns the label of the toast panel attached to `parent_label`.
pub fn toast_window_label(parent_label: &str) -> String {
    format!("{OTHER_WINDOW_PREFIX}toast_{parent_label}")
}

/// Creates the transient notification pill floated over the bottom of
/// its parent window.
///
/// It can never take focus and lets clicks fall through, so it never
/// interrupts typing.
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
        no_minimize: true,
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

/// Shows the toast bottom-centered over its parent and hides it again
/// after TOAST_HIDE_DELAY, unless a newer show has extended its life.
///
/// Called by the toast webview itself, once it has sized the window to
/// fit the message.
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
