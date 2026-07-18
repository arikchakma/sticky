#![allow(deprecated)]

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

// The glyphs (x, -, +) shown inside the circles on hover.
const GLYPH_INSET: f64 = 4.5;
const GLYPH_LINE_WIDTH: f64 = 1.5;
const GLYPH_ALPHA: f64 = 0.6;

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

// Hovering anywhere over the traffic light cluster reveals every button's
// glyph, mirroring native macOS. The tracking area's owner is one of our
// buttons; from it we reach the siblings through the shared superview.
fn set_traffic_light_glyphs_hidden(
    owner: &objc::runtime::Object,
    hidden: bool,
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
            if sibling == cocoa::base::nil {
                continue;
            }
            let sibling_obj = &*(sibling as *const objc::runtime::Object);
            let glyph: *mut std::ffi::c_void =
                *sibling_obj.get_ivar("glyph_layer");
            if !glyph.is_null() {
                let _: () =
                    msg_send![glyph as cocoa::base::id, setHidden: hidden];
            }
        }
    }
}

extern "C" fn traffic_light_mouse_entered(
    this: &objc::runtime::Object,
    _cmd: objc::runtime::Sel,
    _event: cocoa::base::id,
) {
    set_traffic_light_glyphs_hidden(this, false);
}

extern "C" fn traffic_light_mouse_exited(
    this: &objc::runtime::Object,
    _cmd: objc::runtime::Sel,
    _event: cocoa::base::id,
) {
    set_traffic_light_glyphs_hidden(this, true);
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
        let close_rgb =
            if is_key_window == YES { CLOSE_RED } else { DIMMED_GREY };

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
                        | 0x40; // ActiveAlways
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

            let (r, g, b) = if i == 0 { close_rgb } else { DIMMED_GREY };
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
    // pick up the colors for the window's current key state.
    fn reposition_from_state<R: Runtime>(this: &Object) {
        with_window_state(this, |state: &mut WindowState<R>| {
            let id = state
                .window
                .ns_window()
                .expect("NS window should exist on state to reposition")
                as cocoa::base::id;

            position_traffic_lights(
                UnsafeWindowHandle(id as *mut std::ffi::c_void),
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
        forward_to_super!(
            on_effective_appearance_did_change,
            effectiveAppearanceDidChange
        );
        forward_to_super!(
            on_effective_appearance_did_changed_on_main_thread,
            effectiveAppearanceDidChangedOnMainThread
        );

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

        ns_win.setDelegate_(delegate!(&delegate_name, {
            window: id = ns_win,
            app_box: *mut c_void = app_box,
            toolbar: id = cocoa::base::nil,
            super_delegate: id = current_delegate,
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
            (effectiveAppearanceDidChange:) => on_effective_appearance_did_change as extern "C" fn(&Object, Sel, id),
            (effectiveAppearanceDidChangedOnMainThread:) => on_effective_appearance_did_changed_on_main_thread as extern "C" fn(&Object, Sel, id)
        }))
    }
}
