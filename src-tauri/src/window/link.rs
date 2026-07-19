//! The floating link editor.

use super::panel::attach_panel_lifecycle;
use super::*;

pub const LINK_WINDOW_WIDTH: f64 = 256.0;
pub const LINK_WINDOW_HEIGHT: f64 = 44.0;

/// Returns the label of the link panel attached to `parent_label`.
pub fn link_window_label(parent_label: &str) -> String {
    format!("{OTHER_WINDOW_PREFIX}link_{parent_label}")
}

/// Creates the floating link editor popped up under the toolbar's link
/// button.
///
/// Behaves like the native format menus: always on top, no window
/// controls, and dismissed as soon as it loses focus. `anchor` is the
/// button's bottom-center in logical coordinates relative to the
/// parent window's top-left corner; the panel is centered on it.
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
        no_minimize: true,
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

/// Re-anchors an existing (hidden) link panel under the toolbar's link
/// button and brings it back up, focused.
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
