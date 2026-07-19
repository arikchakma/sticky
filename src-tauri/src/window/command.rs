//! The floating command palette.

use sticky_models::constants::COMMAND_WINDOW_HEIGHT;

use super::panel::attach_panel_lifecycle;
use super::*;

pub const COMMAND_WINDOW_MIN_WIDTH: f64 = 340.0;
pub const COMMAND_WINDOW_MAX_WIDTH: f64 = 420.0;
/// Horizontal inset from the parent window's edges.
pub const COMMAND_WINDOW_INSET: f64 = 16.0;
/// Distance between the parent's top edge and the panel's.
pub const COMMAND_WINDOW_TOP_OFFSET: f64 = 50.0;

/// Returns the label of the command palette attached to `parent_label`.
pub fn command_window_label(parent_label: &str) -> String {
    format!("{OTHER_WINDOW_PREFIX}command_{parent_label}")
}

/// Creates the floating command palette anchored to a note window.
///
/// Behaves like a native pop-over: fixed size, no window controls, and
/// dismissed as soon as it loses focus.
pub fn create_command_window(
    parent_window: &WebviewWindow,
    url: &str,
) -> WebviewWindow {
    let app_handle = parent_window.app_handle();
    let label = command_window_label(parent_window.label());
    let scale_factor = parent_window.scale_factor().unwrap();

    let parent_size =
        parent_window.outer_size().unwrap().to_logical::<f64>(scale_factor);

    let width = (parent_size.width - COMMAND_WINDOW_INSET * 2.0)
        .clamp(COMMAND_WINDOW_MIN_WIDTH, COMMAND_WINDOW_MAX_WIDTH);

    let config = CreateWindowConfig {
        url,
        label: label.as_str(),
        title: "Commands",
        inner_size: Some((width, COMMAND_WINDOW_HEIGHT)),
        hide_titlebar: true,
        always_on_top: true,
        fixed_size: true,
        start_hidden: true,
        // Focus is always given explicitly when the panel is revealed;
        // taking it on creation would blur the note window even when
        // the panel is only built ahead of time.
        no_auto_focus: true,
        no_minimize: true,
        ..Default::default()
    };

    let command_window = create_window(&app_handle, config);

    #[cfg(target_os = "macos")]
    {
        // AppKit is main-thread-only; see create_window. The panel stays
        // invisible after anchoring: the frontend shows it once it has
        // shrunk the window to fit its content, so it never flashes at
        // the wrong position or size.
        let panel = command_window.clone();
        let parent = parent_window.clone();
        command_window
            .clone()
            .run_on_main_thread(move || {
                crate::mac_window::hide_window_controls(&panel);
                crate::mac_window::anchor_panel_to_parent(
                    &panel,
                    &parent,
                    COMMAND_WINDOW_TOP_OFFSET,
                );
            })
            .expect("Failed to set up the command palette on the main thread");
    }

    attach_panel_lifecycle(parent_window, &command_window);

    command_window
}

/// Builds the command palette ahead of its first use.
///
/// Like the search panel, booting the palette's webview takes long
/// enough to be felt on the first Cmd+K; it is built right after the
/// note window has settled instead. The pre-warmed panel stays hidden
/// and unfocused until it is presented.
pub fn prewarm_command_window(parent_window: &WebviewWindow) {
    // Hop off the page-load callback; creating windows inside event
    // handlers is prone to deadlocks.
    let parent = parent_window.clone();
    tauri::async_runtime::spawn(async move {
        // The parent may have closed in the meantime, and the user may
        // also have beaten the page load to the panel.
        let windows = parent.app_handle().webview_windows();
        let label = command_window_label(parent.label());
        if !windows.contains_key(parent.label()) || windows.contains_key(&label)
        {
            return;
        }

        let url = format!("/commands?parent={}&prewarm=true", parent.label());
        create_command_window(&parent, &url);
    });
}

/// Re-anchors an existing (hidden) command palette to its parent and
/// brings it back up, focused.
pub fn present_command_window(
    parent_window: &WebviewWindow,
    command_window: &WebviewWindow,
) {
    #[cfg(target_os = "macos")]
    {
        let panel = command_window.clone();
        let parent = parent_window.clone();
        command_window
            .run_on_main_thread(move || {
                crate::mac_window::anchor_panel_to_parent(
                    &panel,
                    &parent,
                    COMMAND_WINDOW_TOP_OFFSET,
                );
                let _ = panel.show();
                let _ = panel.set_focus();
            })
            .expect("Failed to present the command palette on the main thread");
    }

    #[cfg(not(target_os = "macos"))]
    {
        let _ = parent_window;
        let _ = command_window.show();
        let _ = command_window.set_focus();
    }
}
