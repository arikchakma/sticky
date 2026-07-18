//! Double-click detection for the note windows' header bar.

use super::*;

/// Two header presses this close together in screen position count as
/// a double click; screen coordinates stay put even when the first
/// press's drag moves the window under the cursor.
const HEADER_DOUBLE_CLICK_SLOP: f64 = 10.0;

/// When and where each main window's header was last pressed, keyed by
/// the window's label.
///
/// Dragging from the header hands the mouse session to the native drag
/// loop, which swallows the mouseup and resets WebKit's own click
/// counter, so double clicks are detected here instead.
pub struct HeaderClickState {
    interval: Duration,
    last: Mutex<HashMap<String, (Instant, (f64, f64))>>,
}

impl HeaderClickState {
    /// Reads the user's double-click speed; call on the main thread.
    pub fn new() -> Self {
        #[cfg(target_os = "macos")]
        let interval =
            Duration::from_secs_f64(crate::mac_window::double_click_interval());
        #[cfg(not(target_os = "macos"))]
        let interval = Duration::from_millis(500);

        Self { interval, last: Mutex::default() }
    }
}

/// Records a header press and reports whether it completed a double
/// click; `position` is the cursor in screen coordinates.
pub fn register_header_click(
    state: &HeaderClickState,
    label: &str,
    position: (f64, f64),
) -> bool {
    let now = Instant::now();
    let mut last = state.last.lock().expect("Header click state poisoned");
    let previous = last.insert(label.to_string(), (now, position));

    let Some((at, (x, y))) = previous else {
        return false;
    };
    let is_double = now.duration_since(at) <= state.interval
        && (position.0 - x).abs() <= HEADER_DOUBLE_CLICK_SLOP
        && (position.1 - y).abs() <= HEADER_DOUBLE_CLICK_SLOP;
    if is_double {
        // A third rapid press starts a new sequence rather than
        // chaining double clicks.
        last.remove(label);
    }

    is_double
}
