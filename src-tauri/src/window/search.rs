//! The floating search panel.

use super::panel::attach_panel_lifecycle;
use super::*;

pub const SEARCH_WINDOW_MIN_WIDTH: f64 = 360.0;
pub const SEARCH_WINDOW_MAX_WIDTH: f64 = 480.0;
/// Maximum panel height; the frontend shrinks the window to fit its
/// content. Keep in sync with MAX_PANEL_HEIGHT in src-web's search
/// route.
pub const SEARCH_WINDOW_HEIGHT: f64 = 430.0;
/// Horizontal inset from the parent window's edges.
pub const SEARCH_WINDOW_INSET: f64 = 16.0;
/// Distance between the parent's top edge and the panel's.
pub const SEARCH_WINDOW_TOP_OFFSET: f64 = 50.0;

/// Returns the label of the search panel attached to `parent_label`.
pub fn search_window_label(parent_label: &str) -> String {
    format!("{OTHER_WINDOW_PREFIX}search_{parent_label}")
}

/// Creates the floating search panel anchored to a note window.
///
/// Behaves like a native pop-over: fixed size, no window controls, and
/// dismissed as soon as it loses focus.
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

/// Re-anchors an existing (hidden) search panel to its parent and
/// brings it back up, focused.
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
