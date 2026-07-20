//! The note windows themselves.

use super::*;

pub const DEFAULT_FIRST_MAIN_WINDOW_HEIGHT: f64 = 190.0;
pub const DEFAULT_WINDOW_WIDTH: f64 = MIN_WINDOW_WIDTH;
pub const DEFAULT_WINDOW_HEIGHT: f64 = 700.0;

pub const MAX_WINDOW_WIDTH: f64 = 700.0;

/// Creates a note window under the first free `main_N` label.
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
        // Kept invisible until the frontend has painted the themed
        // editor, which reveals the window; showing any earlier would
        // flash the webview's white default background.
        start_hidden: true,
        ..Default::default()
    };

    create_window(handle, config)
}

/// Creates a window centered on its parent that keeps focus while both
/// are open and closes together with the parent.
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
