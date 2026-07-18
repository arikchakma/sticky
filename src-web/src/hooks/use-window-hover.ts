import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';

const WINDOW_HOVERED_CLASS = 'window-hovered';

/**
 * Toggles the `window-hovered` class on the root element while the mouse
 * is inside the window. Driven by the native `window-hover` event emitted
 * from the window's NSTrackingArea (see mac_window.rs), so it stays in
 * sync with the traffic lights even when the window is not focused.
 * Elements with the `window-chrome` class fade based on it (global.css).
 */
export function useWindowHover() {
  useEffect(() => {
    const root = document.documentElement;
    const unlisten = getCurrentWindow().listen<boolean>(
      'window-hover',
      (event) => {
        root.classList.toggle(WINDOW_HOVERED_CLASS, event.payload);
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
