#![allow(deprecated)]

use std::sync::atomic::{AtomicI64, Ordering};

use objc::{class, msg_send, sel, sel_impl};
use tauri::{Emitter, Runtime, WebviewWindow};

use crate::window::MAIN_WINDOW_PREFIX;

struct UnsafeWindowHandle(*mut std::ffi::c_void);

unsafe impl Send for UnsafeWindowHandle {}

unsafe impl Sync for UnsafeWindowHandle {}

const WINDOW_CONTROL_PAD_X: f64 = 13.0;
const WINDOW_CONTROL_PAD_Y: f64 = 16.0;

// Generates a delegate callback that only forwards to the super delegate.
macro_rules! forward_to_super {
    ($name:ident, $sel:ident) => {
        extern "C" fn $name(this: &Object, _cmd: Sel, arg: id) {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, $sel: arg];
            }
        }
    };
    ($name:ident, $sel:ident -> BOOL) => {
        extern "C" fn $name(this: &Object, _cmd: Sel, arg: id) -> BOOL {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                msg_send![super_del, $sel: arg]
            }
        }
    };
}

// Height of the frontend header bar; keep in sync with the
// --window-menu-height CSS variable in src-web/src/styles/global.css.
// The traffic lights are vertically centered against it so they align
// with the header's right-side buttons.
const HEADER_MENU_HEIGHT: f64 = 36.0;

// Tags used to find our custom traffic light views on subsequent calls.
const TRAFFIC_LIGHT_TAG_BASE: i64 = 91743;
const TRAFFIC_LIGHT_DIAMETER: f64 = 14.0;
const TRAFFIC_LIGHT_SPACING: f64 = 20.0;

// Focused close button: macOS system red (#FF5F57).
const CLOSE_RED: (f64, f64, f64) = (1.0, 0.373, 0.341);
// Decorative minimize/zoom, and all buttons when unfocused (#B8B8BD).
const DIMMED_GREY: (f64, f64, f64) = (0.722, 0.722, 0.741);
// The same, toned down so the circles don't glare on dark windows
// (#4F4F53).
const DIMMED_GREY_DARK: (f64, f64, f64) = (0.31, 0.31, 0.325);

// The glyphs (x, -, +) shown inside the circles on hover.
const GLYPH_INSET: f64 = 4.5;
const GLYPH_LINE_WIDTH: f64 = 1.5;
const GLYPH_ALPHA: f64 = 0.6;

// Fade duration for showing/hiding the buttons on window hover.
const FADE_DURATION: f64 = 0.15;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPathCreateMutable() -> *mut std::ffi::c_void;
    fn CGPathMoveToPoint(
        path: *mut std::ffi::c_void,
        transform: *const std::ffi::c_void,
        x: f64,
        y: f64,
    );
    fn CGPathAddLineToPoint(
        path: *mut std::ffi::c_void,
        transform: *const std::ffi::c_void,
        x: f64,
        y: f64,
    );
    fn CGPathRelease(path: *mut std::ffi::c_void);
}

// Runs `f` over the three traffic light buttons, found through the
// owner's shared superview.
fn for_each_traffic_light(
    owner: &objc::runtime::Object,
    f: impl Fn(cocoa::base::id),
) {
    unsafe {
        let owner_view =
            owner as *const objc::runtime::Object as cocoa::base::id;
        let container: cocoa::base::id = msg_send![owner_view, superview];
        if container == cocoa::base::nil {
            return;
        }

        for i in 0..3i64 {
            let tag = TRAFFIC_LIGHT_TAG_BASE + i;
            let sibling: cocoa::base::id =
                msg_send![container, viewWithTag: tag];
            if sibling != cocoa::base::nil {
                f(sibling);
            }
        }
    }
}

// Hovering anywhere over the traffic light cluster reveals every button's
// glyph, mirroring native macOS.
fn set_traffic_light_glyphs_hidden(
    owner: &objc::runtime::Object,
    hidden: bool,
) {
    for_each_traffic_light(owner, |sibling| unsafe {
        let sibling_obj = &*(sibling as *const objc::runtime::Object);
        let glyph: *mut std::ffi::c_void = *sibling_obj.get_ivar("glyph_layer");
        if !glyph.is_null() {
            let _: () = msg_send![glyph as cocoa::base::id, setHidden: hidden];
        }
    });
}

// The buttons are visible only while the mouse is inside the window;
// fade them in and out through the animator proxy. The buttons are found
// from the window's frame view, so this works from the window delegate.
fn fade_traffic_lights(ns_window: cocoa::base::id, alpha: f64) {
    unsafe {
        let content_view: cocoa::base::id = msg_send![ns_window, contentView];
        let frame_view: cocoa::base::id = msg_send![content_view, superview];
        if frame_view == cocoa::base::nil {
            return;
        }

        let _: () = msg_send![class!(NSAnimationContext), beginGrouping];
        let context: cocoa::base::id =
            msg_send![class!(NSAnimationContext), currentContext];
        let _: () = msg_send![context, setDuration: FADE_DURATION];

        for i in 0..3i64 {
            let tag = TRAFFIC_LIGHT_TAG_BASE + i;
            let button: cocoa::base::id =
                msg_send![frame_view, viewWithTag: tag];
            if button != cocoa::base::nil {
                let animator: cocoa::base::id = msg_send![button, animator];
                let _: () = msg_send![animator, setAlphaValue: alpha];
            }
        }

        let _: () = msg_send![class!(NSAnimationContext), endGrouping];
    }
}

// The close button's fill at rest: system red while the window is key,
// otherwise the appearance-aware dimmed grey.
fn close_resting_color(ns_window: cocoa::base::id) -> (f64, f64, f64) {
    use cocoa::base::{BOOL, YES};
    let is_key: BOOL = unsafe { msg_send![ns_window, isKeyWindow] };
    if is_key == YES {
        CLOSE_RED
    } else if is_dark_appearance(ns_window) {
        DIMMED_GREY_DARK
    } else {
        DIMMED_GREY
    }
}

// Repaints a traffic light circle's layer background.
fn set_traffic_light_color(button: cocoa::base::id, rgb: (f64, f64, f64)) {
    let (r, g, b) = rgb;
    unsafe {
        let color: cocoa::base::id = msg_send![
            class!(NSColor),
            colorWithSRGBRed: r green: g blue: b alpha: 1.0f64
        ];
        let cg_color: cocoa::base::id = msg_send![color, CGColor];
        let layer: cocoa::base::id = msg_send![button, layer];
        let _: () = msg_send![layer, setBackgroundColor: cg_color];
    }
}

extern "C" fn traffic_light_mouse_entered(
    this: &objc::runtime::Object,
    _cmd: objc::runtime::Sel,
    _event: cocoa::base::id,
) {
    set_traffic_light_glyphs_hidden(this, false);
    // `this` is the close button (it owns the cluster tracking area).
    // Give it its red even while the window is unfocused, so hovering
    // reveals the color the way native macOS does.
    let close = this as *const objc::runtime::Object as cocoa::base::id;
    set_traffic_light_color(close, CLOSE_RED);
}

extern "C" fn traffic_light_mouse_exited(
    this: &objc::runtime::Object,
    _cmd: objc::runtime::Sel,
    _event: cocoa::base::id,
) {
    set_traffic_light_glyphs_hidden(this, true);
    let close = this as *const objc::runtime::Object as cocoa::base::id;
    let ns_window: cocoa::base::id = unsafe { msg_send![close, window] };
    set_traffic_light_color(close, close_resting_color(ns_window));
}

// NSButton subclass that reveals the cluster's glyph sublayers on hover,
// mirroring how the native traffic lights reveal their glyphs.
fn traffic_light_button_class() -> &'static objc::runtime::Class {
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Sel};
    use std::sync::OnceLock;

    static CLASS: OnceLock<usize> = OnceLock::new();

    let cls = CLASS.get_or_init(|| unsafe {
        let mut decl =
            ClassDecl::new("StickyTrafficLightButton", class!(NSButton))
                .expect("Failed to declare StickyTrafficLightButton class");
        decl.add_ivar::<*mut std::ffi::c_void>("glyph_layer");
        decl.add_method(
            sel!(mouseEntered:),
            traffic_light_mouse_entered
                as extern "C" fn(&Object, Sel, cocoa::base::id),
        );
        decl.add_method(
            sel!(mouseExited:),
            traffic_light_mouse_exited
                as extern "C" fn(&Object, Sel, cocoa::base::id),
        );
        decl.register() as *const Class as usize
    });

    unsafe { &*(*cls as *const objc::runtime::Class) }
}

static LAST_CLICK_COUNT: AtomicI64 = AtomicI64::new(0);

// AppKit's click count for the most recent left mousedown, recorded by
// the monitor installed below. Reading consumes the count: both presses
// of a double click query it, and only one may see the 2.
pub fn take_click_count() -> i64 {
    LAST_CLICK_COUNT.swap(0, Ordering::Relaxed)
}

// Whether the left mouse button is currently pressed, system-wide.
pub fn is_left_mouse_down() -> bool {
    let buttons: u64 =
        unsafe { msg_send![class!(NSEvent), pressedMouseButtons] };
    buttons & 1 != 0
}

// Records the click count of every left mousedown before it is
// dispatched. WebKit's own counter (e.detail) resets once the native
// drag session started by a press on a drag region swallows the
// mouseup, so double clicks there are read from this instead — with
// the system's double-click interval and movement rules for free.
// Main thread only; call once at startup.
pub fn install_click_count_monitor() {
    use block::ConcreteBlock;
    use cocoa::base::id;

    const LEFT_MOUSE_DOWN_MASK: u64 = 1 << 1;

    let block = ConcreteBlock::new(|event: id| -> id {
        let count: i64 = unsafe { msg_send![event, clickCount] };
        LAST_CLICK_COUNT.store(count, Ordering::Relaxed);
        event
    });
    // The monitor lives for the app's lifetime, backed by the leaked
    // block.
    let block = Box::leak(Box::new(block.copy()));

    unsafe {
        let _: id = msg_send![
            class!(NSEvent),
            addLocalMonitorForEventsMatchingMask: LEFT_MOUSE_DOWN_MASK
            handler: &**block
        ];
    }
}

// Duration of the window height animation, in seconds. Fixed, unlike
// setFrame:animate:'s default, which grows with the resize distance
// and makes large resizes feel sluggish.
const RESIZE_DURATION: f64 = 0.15;

// Animates the window to `height` points, keeping its top-left corner
// in place. Main thread only.
pub fn animate_window_height<R: Runtime>(
    window: &WebviewWindow<R>,
    height: f64,
) {
    use cocoa::appkit::NSWindow;
    use cocoa::base::{id, YES};
    use cocoa::foundation::NSRect;

    let ns_window = window
        .ns_window()
        .expect("NS window should exist to animate the window height")
        as id;

    #[allow(unexpected_cfgs)]
    unsafe {
        let mut frame: NSRect = NSWindow::frame(ns_window);
        // Cocoa frames use a bottom-left origin with y growing upwards.
        frame.origin.y += frame.size.height - height;
        frame.size.height = height;

        let _: () = msg_send![class!(NSAnimationContext), beginGrouping];
        let context: id = msg_send![class!(NSAnimationContext), currentContext];
        let _: () = msg_send![context, setDuration: RESIZE_DURATION];
        let animator: id = msg_send![ns_window, animator];
        let _: () = msg_send![animator, setFrame: frame display: YES];
        let _: () = msg_send![class!(NSAnimationContext), endGrouping];
    }
}

// Distance kept between the window and its screen's top-right corner
// when it is snapped there.
const SNAP_MARGIN_RIGHT: f64 = 40.0;
const SNAP_MARGIN_TOP: f64 = 100.0;

// Animates the window into the top-right corner of its screen. Main
// thread only.
pub fn snap_window_to_top_right<R: Runtime>(window: &WebviewWindow<R>) {
    use cocoa::appkit::NSWindow;
    use cocoa::base::{id, nil, YES};
    use cocoa::foundation::NSRect;

    let ns_window =
        window.ns_window().expect("NS window should exist to snap the window")
            as id;

    #[allow(unexpected_cfgs)]
    unsafe {
        let screen: id = msg_send![ns_window, screen];
        if screen == nil {
            return;
        }
        let screen_frame: NSRect = msg_send![screen, frame];

        let mut frame: NSRect = NSWindow::frame(ns_window);
        frame.origin.x = screen_frame.origin.x + screen_frame.size.width
            - frame.size.width
            - SNAP_MARGIN_RIGHT;
        frame.origin.y = screen_frame.origin.y + screen_frame.size.height
            - SNAP_MARGIN_TOP
            - frame.size.height;
        let _: () =
            msg_send![ns_window, setFrame: frame display: YES animate: YES];
    }
}

// Utility panels keep the overlay titlebar for their native rounded
// corners and shadow, but show no window controls at all.
pub fn hide_window_controls<R: Runtime>(window: &WebviewWindow<R>) {
    use cocoa::appkit::{NSWindow, NSWindowButton};
    use cocoa::base::id;

    let ns_window = window
        .ns_window()
        .expect("NS window should exist to hide window controls")
        as id;

    #[allow(unexpected_cfgs)]
    unsafe {
        for kind in [
            NSWindowButton::NSWindowCloseButton,
            NSWindowButton::NSWindowMiniaturizeButton,
            NSWindowButton::NSWindowZoomButton,
        ] {
            let button = ns_window.standardWindowButton_(kind);
            let _: () = msg_send![button, setHidden: true];
        }
    }
}

// Anchors the search panel horizontally centered on its parent window,
// with its top edge top_offset points below the parent's. Positioned
// through the NSWindow frames directly so the math holds on any screen,
// unlike top-left coordinate conversions.
pub fn anchor_panel_to_parent<R: Runtime>(
    panel: &WebviewWindow<R>,
    parent: &WebviewWindow<R>,
    top_offset: f64,
) {
    use cocoa::appkit::NSWindow;
    use cocoa::base::id;
    use cocoa::foundation::{NSPoint, NSRect};

    let panel_window =
        panel.ns_window().expect("NS window should exist to anchor panel")
            as id;
    let parent_window = parent
        .ns_window()
        .expect("Parent NS window should exist to anchor panel")
        as id;

    #[allow(unexpected_cfgs)]
    unsafe {
        let parent_frame: NSRect = NSWindow::frame(parent_window);
        let panel_frame: NSRect = NSWindow::frame(panel_window);

        // Cocoa frames use a bottom-left origin with y growing upwards.
        let origin = NSPoint::new(
            parent_frame.origin.x
                + (parent_frame.size.width - panel_frame.size.width) / 2.0,
            parent_frame.origin.y + parent_frame.size.height
                - top_offset
                - panel_frame.size.height,
        );
        let _: () = msg_send![panel_window, setFrameOrigin: origin];
    }
}

// Anchors a panel with its top-left corner offset (x, y) points from
// the parent window's top-left corner. Positioned through the NSWindow
// frames directly; see anchor_panel_to_parent.
pub fn anchor_panel_at<R: Runtime>(
    panel: &WebviewWindow<R>,
    parent: &WebviewWindow<R>,
    x: f64,
    y: f64,
) {
    use cocoa::appkit::NSWindow;
    use cocoa::base::id;
    use cocoa::foundation::{NSPoint, NSRect};

    let panel_window =
        panel.ns_window().expect("NS window should exist to anchor panel")
            as id;
    let parent_window = parent
        .ns_window()
        .expect("Parent NS window should exist to anchor panel")
        as id;

    #[allow(unexpected_cfgs)]
    unsafe {
        let parent_frame: NSRect = NSWindow::frame(parent_window);
        let panel_frame: NSRect = NSWindow::frame(panel_window);

        // Cocoa frames use a bottom-left origin with y growing upwards.
        let origin = NSPoint::new(
            parent_frame.origin.x + x,
            parent_frame.origin.y + parent_frame.size.height
                - y
                - panel_frame.size.height,
        );
        let _: () = msg_send![panel_window, setFrameOrigin: origin];
    }
}

/// Whether the window currently renders with a dark appearance.
fn is_dark_appearance(ns_window: cocoa::base::id) -> bool {
    use cocoa::base::{nil, BOOL, YES};
    use cocoa::foundation::NSString;

    #[allow(unexpected_cfgs)]
    unsafe {
        let appearance: cocoa::base::id =
            msg_send![ns_window, effectiveAppearance];
        let name: cocoa::base::id = msg_send![appearance, name];
        // All dark appearance names ("NSAppearanceNameDarkAqua",
        // "NSAppearanceNameVibrantDark", ...) carry the marker.
        let marker = NSString::alloc(nil).init_str("Dark");
        let is_dark: BOOL = msg_send![name, containsString: marker];
        let _: () = msg_send![marker, release];
        is_dark == YES
    }
}

fn position_traffic_lights(
    ns_window_handle: UnsafeWindowHandle,
    x: f64,
    y: f64,
    label: String,
) {
    if !label.starts_with(MAIN_WINDOW_PREFIX) {
        return;
    }

    use cocoa::appkit::{NSView, NSWindow, NSWindowButton};
    use cocoa::base::{id, nil, BOOL, YES};
    use cocoa::foundation::{NSPoint, NSRect, NSSize, NSString};

    let ns_window = ns_window_handle.0 as id;
    #[allow(unexpected_cfgs)]
    unsafe {
        let close = ns_window
            .standardWindowButton_(NSWindowButton::NSWindowCloseButton);
        let miniaturize = ns_window
            .standardWindowButton_(NSWindowButton::NSWindowMiniaturizeButton);
        let zoom =
            ns_window.standardWindowButton_(NSWindowButton::NSWindowZoomButton);

        // The native buttons render disabled/inactive states as nearly white
        // circles, which are invisible on the note background. Hide them and
        // draw custom layer-backed circles with explicit colors instead.
        let _: () = msg_send![close, setHidden: true];
        let _: () = msg_send![miniaturize, setHidden: true];
        let _: () = msg_send![zoom, setHidden: true];

        let title_bar_container_view = close.superview().superview();

        let close_rect: NSRect = msg_send![close, frame];
        let button_height = close_rect.size.height;

        let title_bar_frame_height = button_height + y;
        let mut title_bar_rect = NSView::frame(title_bar_container_view);
        title_bar_rect.size.height = title_bar_frame_height;
        title_bar_rect.origin.y =
            NSView::frame(ns_window).size.height - title_bar_frame_height;
        let _: () =
            msg_send![title_bar_container_view, setFrame: title_bar_rect];

        let is_key_window: BOOL = msg_send![ns_window, isKeyWindow];
        let dimmed_grey = if is_dark_appearance(ns_window) {
            DIMMED_GREY_DARK
        } else {
            DIMMED_GREY
        };
        let close_rgb =
            if is_key_window == YES { CLOSE_RED } else { dimmed_grey };

        let window_buttons = vec![close, miniaturize, zoom];
        let space_between = TRAFFIC_LIGHT_SPACING;

        for (i, button) in window_buttons.into_iter().enumerate() {
            let mut rect: NSRect = NSView::frame(button);
            rect.origin.x = x + (i as f64 * space_between);
            button.setFrameOrigin(rect.origin);

            // Horizontally centered on the (hidden) native button frame;
            // vertically centered against the frontend header bar so the
            // circles line up with the header's right-side buttons. The
            // container is anchored to the window top, so in its unflipped
            // coordinates the header's midline sits HEADER_MENU_HEIGHT / 2
            // below the container's top edge.
            let circle_rect = NSRect::new(
                NSPoint::new(
                    rect.origin.x
                        + (rect.size.width - TRAFFIC_LIGHT_DIAMETER) / 2.0,
                    title_bar_frame_height
                        - HEADER_MENU_HEIGHT / 2.0
                        - TRAFFIC_LIGHT_DIAMETER / 2.0,
                ),
                NSSize::new(TRAFFIC_LIGHT_DIAMETER, TRAFFIC_LIGHT_DIAMETER),
            );

            let tag = TRAFFIC_LIGHT_TAG_BASE + i as i64;
            let mut circle: id =
                msg_send![title_bar_container_view, viewWithTag: tag];
            if circle == nil {
                circle = msg_send![traffic_light_button_class(), alloc];
                circle = msg_send![circle, initWithFrame: circle_rect];
                let _: () = msg_send![circle, setTag: tag];
                let _: () = msg_send![circle, setBordered: false];
                let empty_title = NSString::alloc(nil).init_str("");
                let _: () = msg_send![circle, setTitle: empty_title];
                let _: () = msg_send![empty_title, release];
                let _: () = msg_send![circle, setWantsLayer: true];
                // Hidden until the mouse enters the window.
                let _: () = msg_send![circle, setAlphaValue: 0.0f64];
                if i == 0 {
                    let _: () = msg_send![circle, setTarget: ns_window];
                    let _: () =
                        msg_send![circle, setAction: sel!(performClose:)];

                    // "x" glyph revealed on cluster hover. The decorative
                    // minimize/maximize circles are disabled, so like native
                    // disabled buttons they get no glyph (their "glyph_layer"
                    // ivar stays null and the hover handler skips them).
                    let glyph: id = msg_send![class!(CAShapeLayer), layer];
                    let path = CGPathCreateMutable();
                    let near = GLYPH_INSET;
                    let far = TRAFFIC_LIGHT_DIAMETER - GLYPH_INSET;
                    CGPathMoveToPoint(path, std::ptr::null(), near, near);
                    CGPathAddLineToPoint(path, std::ptr::null(), far, far);
                    CGPathMoveToPoint(path, std::ptr::null(), near, far);
                    CGPathAddLineToPoint(path, std::ptr::null(), far, near);
                    let _: () = msg_send![glyph, setPath: path];
                    CGPathRelease(path);

                    let glyph_frame = NSRect::new(
                        NSPoint::new(0.0, 0.0),
                        NSSize::new(
                            TRAFFIC_LIGHT_DIAMETER,
                            TRAFFIC_LIGHT_DIAMETER,
                        ),
                    );
                    let _: () = msg_send![glyph, setFrame: glyph_frame];

                    let stroke: id = msg_send![
                        class!(NSColor),
                        colorWithSRGBRed: 0.0f64
                        green: 0.0f64
                        blue: 0.0f64
                        alpha: GLYPH_ALPHA
                    ];
                    let stroke_cg: id = msg_send![stroke, CGColor];
                    let _: () = msg_send![glyph, setStrokeColor: stroke_cg];
                    let no_fill: *const std::ffi::c_void = std::ptr::null();
                    let _: () = msg_send![glyph, setFillColor: no_fill];
                    let _: () =
                        msg_send![glyph, setLineWidth: GLYPH_LINE_WIDTH];
                    let round_cap = NSString::alloc(nil).init_str("round");
                    let _: () = msg_send![glyph, setLineCap: round_cap];
                    let _: () = msg_send![round_cap, release];
                    let scale: f64 = msg_send![ns_window, backingScaleFactor];
                    let _: () = msg_send![glyph, setContentsScale: scale];
                    let _: () = msg_send![glyph, setHidden: true];

                    let circle_layer: id = msg_send![circle, layer];
                    let _: () = msg_send![circle_layer, addSublayer: glyph];
                    (*(circle as *mut objc::runtime::Object))
                        .set_ivar::<*mut std::ffi::c_void>(
                        "glyph_layer",
                        glyph as *mut std::ffi::c_void,
                    );
                } else {
                    // Decorative only: never clickable.
                    let _: () = msg_send![circle, setEnabled: false];
                }

                if i == 0 {
                    // One tracking area spanning the whole cluster, so moving
                    // between circles doesn't flicker the glyphs. The close
                    // button owns it and toggles all siblings.
                    let cluster_rect = NSRect::new(
                        circle_rect.origin,
                        NSSize::new(
                            2.0 * TRAFFIC_LIGHT_SPACING
                                + TRAFFIC_LIGHT_DIAMETER,
                            TRAFFIC_LIGHT_DIAMETER,
                        ),
                    );
                    let tracking: id = msg_send![class!(NSTrackingArea), alloc];
                    let opts: cocoa::foundation::NSUInteger = 0x01 // MouseEnteredAndExited
                        | 0x80; // ActiveAlways
                    let tracking: id = msg_send![
                        tracking,
                        initWithRect: cluster_rect
                        options: opts
                        owner: circle
                        userInfo: nil
                    ];
                    let _: () = msg_send![
                        title_bar_container_view,
                        addTrackingArea: tracking
                    ];
                    let _: () = msg_send![tracking, release];
                }

                let _: () =
                    msg_send![title_bar_container_view, addSubview: circle];
                let _: () = msg_send![circle, release];
            } else {
                let _: () = msg_send![circle, setFrame: circle_rect];
            }

            let (r, g, b) = if i == 0 { close_rgb } else { dimmed_grey };
            let color: id = msg_send![
                class!(NSColor),
                colorWithSRGBRed: r green: g blue: b alpha: 1.0f64
            ];
            let cg_color: id = msg_send![color, CGColor];
            let layer: id = msg_send![circle, layer];
            let _: () = msg_send![
                layer,
                setCornerRadius: (TRAFFIC_LIGHT_DIAMETER / 2.0)
            ];
            let _: () = msg_send![layer, setBackgroundColor: cg_color];
        }
    }
}

#[derive(Debug)]
struct WindowState<R: Runtime> {
    window: WebviewWindow<R>,
}

pub fn setup_traffic_light_positioner<R: Runtime>(window: &WebviewWindow<R>) {
    use cocoa::appkit::NSWindow;
    use cocoa::base::{id, BOOL};
    use cocoa::delegate;
    use cocoa::foundation::NSUInteger;
    use objc::runtime::{Object, Sel};
    use rand::distr::Alphanumeric;
    use rand::Rng;
    use std::ffi::c_void;

    position_traffic_lights(
        UnsafeWindowHandle(
            window.ns_window().expect("Failed to create window handle"),
        ),
        WINDOW_CONTROL_PAD_X,
        WINDOW_CONTROL_PAD_Y,
        window.label().to_string(),
    );

    // Ensure they stay in place while resizing the window.
    fn with_window_state<R: Runtime, F: FnOnce(&mut WindowState<R>) -> T, T>(
        this: &Object,
        func: F,
    ) {
        let ptr = unsafe {
            let x: *mut c_void = *this.get_ivar("app_box");
            &mut *(x as *mut WindowState<R>)
        };
        func(ptr);
    }

    // Re-run positioning so the traffic lights keep their placement and
    // pick up the colors for the window's current key state. The
    // NSWindow comes from the delegate's ivar rather than back through
    // Tauri: these callbacks can fire while the runtime's window map is
    // mutably borrowed (e.g. when another window mid-close hands over
    // key status), where re-entering Tauri panics on the RefCell.
    fn reposition_from_state<R: Runtime>(this: &Object) {
        let ns_win: cocoa::base::id = unsafe { *this.get_ivar("window") };
        with_window_state(this, |state: &mut WindowState<R>| {
            position_traffic_lights(
                UnsafeWindowHandle(ns_win as *mut c_void),
                WINDOW_CONTROL_PAD_X,
                WINDOW_CONTROL_PAD_Y,
                state.window.label().to_string(),
            );
        });
    }

    #[allow(unexpected_cfgs)]
    unsafe {
        let ns_win = window
            .ns_window()
            .expect("NS Window should exist to mount traffic light delegate.")
            as id;

        let current_delegate: id = ns_win.delegate();

        forward_to_super!(on_window_should_close, windowShouldClose -> BOOL);
        forward_to_super!(on_window_will_close, windowWillClose);
        forward_to_super!(on_window_did_move, windowDidMove);
        forward_to_super!(
            on_window_did_change_backing_properties,
            windowDidChangeBackingProperties
        );
        forward_to_super!(on_dragging_entered, draggingEntered -> BOOL);
        forward_to_super!(
            on_prepare_for_drag_operation,
            prepareForDragOperation -> BOOL
        );
        forward_to_super!(
            on_perform_drag_operation,
            performDragOperation -> BOOL
        );
        forward_to_super!(on_conclude_drag_operation, concludeDragOperation);
        forward_to_super!(on_dragging_exited, draggingExited);

        extern "C" fn on_window_did_resize<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                reposition_from_state::<R>(this);

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowDidResize: notification];
            }
        }
        extern "C" fn on_window_did_become_key<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                reposition_from_state::<R>(this);

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () =
                    msg_send![super_del, windowDidBecomeKey: notification];
            }
        }
        extern "C" fn on_window_did_resign_key<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                reposition_from_state::<R>(this);

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () =
                    msg_send![super_del, windowDidResignKey: notification];
            }
        }
        extern "C" fn on_window_will_use_full_screen_presentation_options(
            this: &Object,
            _cmd: Sel,
            window: id,
            proposed_options: NSUInteger,
        ) -> NSUInteger {
            unsafe {
                let super_del: id = *this.get_ivar("super_delegate");
                msg_send![super_del, window: window willUseFullScreenPresentationOptions: proposed_options]
            }
        }
        extern "C" fn on_window_did_enter_full_screen<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                with_window_state(&*this, |state: &mut WindowState<R>| {
                    state
                        .window
                        .emit("did-enter-fullscreen", ())
                        .expect("Failed to emit event");
                });

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowDidEnterFullScreen: notification];
            }
        }
        extern "C" fn on_window_will_enter_full_screen<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                with_window_state(&*this, |state: &mut WindowState<R>| {
                    state
                        .window
                        .emit("will-enter-fullscreen", ())
                        .expect("Failed to emit event");
                });

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowWillEnterFullScreen: notification];
            }
        }
        extern "C" fn on_window_did_exit_full_screen<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                with_window_state(&*this, |state: &mut WindowState<R>| {
                    state
                        .window
                        .emit("did-exit-fullscreen", ())
                        .expect("Failed to emit event");
                });
                reposition_from_state::<R>(this);

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () =
                    msg_send![super_del, windowDidExitFullScreen: notification];
            }
        }
        extern "C" fn on_window_will_exit_full_screen<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                with_window_state(&*this, |state: &mut WindowState<R>| {
                    state
                        .window
                        .emit("will-exit-fullscreen", ())
                        .expect("Failed to emit event");
                });

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![super_del, windowWillExitFullScreen: notification];
            }
        }
        forward_to_super!(
            on_window_did_fail_to_enter_full_screen,
            windowDidFailToEnterFullScreen
        );
        // Repaint the traffic lights in the colors of the new appearance.
        extern "C" fn on_effective_appearance_did_change<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            notification: id,
        ) {
            unsafe {
                reposition_from_state::<R>(this);

                let super_del: id = *this.get_ivar("super_delegate");
                let _: () = msg_send![
                    super_del,
                    effectiveAppearanceDidChange: notification
                ];
            }
        }
        forward_to_super!(
            on_effective_appearance_did_changed_on_main_thread,
            effectiveAppearanceDidChangedOnMainThread
        );

        // The window-wide tracking area (see below) is owned by the
        // delegate: on hover it fades the native traffic lights and mirrors
        // the state to the webview so the HTML chrome can follow suit.
        extern "C" fn on_mouse_entered<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            _event: id,
        ) {
            unsafe {
                let ns_win: id = *this.get_ivar("window");
                fade_traffic_lights(ns_win, 1.0);
                with_window_state(&*this, |state: &mut WindowState<R>| {
                    let label = state.window.label().to_string();
                    let _ = state.window.emit_to(label, "window-hover", true);
                });
            }
        }
        extern "C" fn on_mouse_exited<R: Runtime>(
            this: &Object,
            _cmd: Sel,
            _event: id,
        ) {
            unsafe {
                let ns_win: id = *this.get_ivar("window");
                fade_traffic_lights(ns_win, 0.0);
                with_window_state(&*this, |state: &mut WindowState<R>| {
                    let label = state.window.label().to_string();
                    let _ = state.window.emit_to(label, "window-hover", false);
                });
            }
        }

        // Note: the boxed window state is intentionally leaked — the
        // delegate (and its app_box ivar) lives for the window's lifetime.
        let window_label = window.label().to_string();

        let app_state = WindowState { window: window.clone() };
        let app_box = Box::into_raw(Box::new(app_state)) as *mut c_void;
        let random_str: String = rand::rng()
            .sample_iter(&Alphanumeric)
            .take(20)
            .map(char::from)
            .collect();

        // We need to ensure we have a unique delegate name, otherwise we will panic while trying to create a duplicate
        // delegate with the same name.
        let delegate_name =
            format!("windowDelegate_{}_{}", window_label, random_str);

        let delegate_obj = delegate!(&delegate_name, {
            window: id = ns_win,
            app_box: *mut c_void = app_box,
            toolbar: id = cocoa::base::nil,
            super_delegate: id = current_delegate,
            (mouseEntered:) => on_mouse_entered::<R> as extern "C" fn(&Object, Sel, id),
            (mouseExited:) => on_mouse_exited::<R> as extern "C" fn(&Object, Sel, id),
            (windowShouldClose:) => on_window_should_close as extern "C" fn(&Object, Sel, id) -> BOOL,
            (windowWillClose:) => on_window_will_close as extern "C" fn(&Object, Sel, id),
            (windowDidResize:) => on_window_did_resize::<R> as extern "C" fn(&Object, Sel, id),
            (windowDidMove:) => on_window_did_move as extern "C" fn(&Object, Sel, id),
            (windowDidChangeBackingProperties:) => on_window_did_change_backing_properties as extern "C" fn(&Object, Sel, id),
            (windowDidBecomeKey:) => on_window_did_become_key::<R> as extern "C" fn(&Object, Sel, id),
            (windowDidResignKey:) => on_window_did_resign_key::<R> as extern "C" fn(&Object, Sel, id),
            (draggingEntered:) => on_dragging_entered as extern "C" fn(&Object, Sel, id) -> BOOL,
            (prepareForDragOperation:) => on_prepare_for_drag_operation as extern "C" fn(&Object, Sel, id) -> BOOL,
            (performDragOperation:) => on_perform_drag_operation as extern "C" fn(&Object, Sel, id) -> BOOL,
            (concludeDragOperation:) => on_conclude_drag_operation as extern "C" fn(&Object, Sel, id),
            (draggingExited:) => on_dragging_exited as extern "C" fn(&Object, Sel, id),
            (window:willUseFullScreenPresentationOptions:) => on_window_will_use_full_screen_presentation_options as extern "C" fn(&Object, Sel, id, NSUInteger) -> NSUInteger,
            (windowDidEnterFullScreen:) => on_window_did_enter_full_screen::<R> as extern "C" fn(&Object, Sel, id),
            (windowWillEnterFullScreen:) => on_window_will_enter_full_screen::<R> as extern "C" fn(&Object, Sel, id),
            (windowDidExitFullScreen:) => on_window_did_exit_full_screen::<R> as extern "C" fn(&Object, Sel, id),
            (windowWillExitFullScreen:) => on_window_will_exit_full_screen::<R> as extern "C" fn(&Object, Sel, id),
            (windowDidFailToEnterFullScreen:) => on_window_did_fail_to_enter_full_screen as extern "C" fn(&Object, Sel, id),
            (effectiveAppearanceDidChange:) => on_effective_appearance_did_change::<R> as extern "C" fn(&Object, Sel, id),
            (effectiveAppearanceDidChangedOnMainThread:) => on_effective_appearance_did_changed_on_main_thread as extern "C" fn(&Object, Sel, id)
        });

        // Window-wide hover tracking, active regardless of key state.
        // InVisibleRect keeps the rect in sync with resizes.
        {
            use cocoa::foundation::{NSPoint, NSRect, NSSize};

            let content_view: id = msg_send![ns_win, contentView];
            let tracking: id = msg_send![class!(NSTrackingArea), alloc];
            let opts: NSUInteger = 0x01 // MouseEnteredAndExited
                | 0x80 // ActiveAlways
                | 0x200; // InVisibleRect
            let zero_rect =
                NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(0.0, 0.0));
            let tracking: id = msg_send![
                tracking,
                initWithRect: zero_rect
                options: opts
                owner: delegate_obj
                userInfo: cocoa::base::nil
            ];
            let _: () = msg_send![content_view, addTrackingArea: tracking];
            let _: () = msg_send![tracking, release];
        }

        ns_win.setDelegate_(delegate_obj)
    }
}
