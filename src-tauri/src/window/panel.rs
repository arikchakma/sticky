//! Behavior shared by the utility panels floated over note windows.

use super::*;

/// Grace period after a panel was hidden by losing focus.
///
/// Clicking the toggle button while a panel is open blurs the panel
/// first (hiding it) and only then delivers the click, which would
/// instantly re-present it. Reopens within this period of a blur-hide
/// are treated as that same click and ignored.
pub const PANEL_TOGGLE_GRACE: Duration = Duration::from_millis(300);

/// When each utility panel was last hidden because it lost focus,
/// keyed by the panel's label.
#[derive(Default)]
pub struct PanelState(pub Mutex<HashMap<String, Instant>>);

/// Whether the panel `label` was blur-hidden within the toggle grace
/// period.
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

/// Closes `panel` together with its parent window.
pub(super) fn close_panel_with_parent(
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

/// Hides `panel` whenever it loses focus and closes it together with
/// its parent window.
///
/// Utility panels are created once and then kept around so reopening
/// them is instant: losing focus only hides them, and they die with
/// their parent window.
pub(super) fn attach_panel_lifecycle(
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
