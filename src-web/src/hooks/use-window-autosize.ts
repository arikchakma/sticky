import { MIN_WINDOW_HEIGHT } from '@sticky/models';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, type RefObject } from 'react';
import { getIsManuallyResized, setIsManuallyResized } from '~/lib/autosize';

// The tallest the window auto-sizes to, as a share of the monitor's
// work area.
const MAX_HEIGHT_RATIO = 0.75;

// The note the previous editor mount in this window showed. The editor
// remounts per note (key={noteId}), so a different id here means the
// route swapped notes rather than the window just opening.
let lastMountedNoteId: string | undefined;

// Whether the viewport scrolls its overflow or clips it. Clip, not
// hidden: a hidden element is still a programmatic scroll container,
// so the editor's scroll-cursor-into-view would jolt the content up a
// line before the window has grown to fit it. And never `visible`,
// which would let the content paint over the menu bar while the
// window catches up.
function setViewportOverflow(
  viewport: HTMLElement,
  options: { scrolls: boolean }
) {
  viewport.classList.toggle('overflow-y-scroll', options.scrolls);
  viewport.classList.toggle('overflow-y-clip', !options.scrolls);
}

// Keeps the window's height following the note's content, until the
// user resizes the window by hand. Manual mode is stored per window
// (see lib/autosize) and left through fitWindow or toggleAutoSize.
export function useWindowAutoSize(
  editor: Editor,
  noteId: string | undefined,
  editorContentRef: RefObject<HTMLDivElement | null>
) {
  // Resizes the window to fit the note's content, capped at a share
  // of the screen's work area. The target is the current height plus
  // however much the content overflows (or underflows) its scroll
  // viewport; the chrome around the viewport cancels out, so nothing
  // else needs measuring. Returns 'unchanged' when the window already
  // fits, and undefined when the layout wasn't measurable.
  const fitToContent = useCallback(
    async (options?: { animate?: boolean }) => {
      const viewport = editorContentRef.current;
      if (!viewport) {
        return undefined;
      }

      // Everything is measured synchronously in logical pixels — the
      // window is borderless, so its outer height is innerHeight —
      // and the resize is dispatched in the same tick. Waiting on IPC
      // round trips here would let a paint through that still shows
      // the grown content clipped.
      const slack =
        editor.view.dom.getBoundingClientRect().height - viewport.clientHeight;
      const maxHeight = Math.floor(screen.availHeight * MAX_HEIGHT_RATIO);
      const fit = Math.max(MIN_WINDOW_HEIGHT, window.innerHeight + slack);
      const newHeight = Math.ceil(Math.min(maxHeight, fit));

      // At the height cap the note scrolls; below it the window fits
      // the content and scrolling would only rubber-band.
      setViewportOverflow(viewport, { scrolls: fit >= maxHeight });

      // Within rounding of the target already; skip the resize so no
      // resize event is emitted that would need explaining away.
      if (Math.abs(window.innerHeight - newHeight) <= 2) {
        return 'unchanged' as const;
      }

      if (options?.animate) {
        await invoke('cmd_animate_window_height', { height: newHeight });
      } else {
        await getCurrentWindow().setSize(
          new LogicalSize(window.innerWidth, newHeight)
        );
      }
      return 'resized' as const;
    },
    [editor, editorContentRef]
  );

  // Dragging a window edge switches to manual sizing. The drag is
  // recognized by the held left mouse button: resize events from our
  // own setSize and animation frames all arrive with it released.
  useEffect(() => {
    const unlisten = getCurrentWindow().onResized(async () => {
      if (getIsManuallyResized()) {
        return;
      }
      if (!(await invoke<boolean>('cmd_is_left_mouse_down'))) {
        return;
      }

      setIsManuallyResized(true);
      const viewport = editorContentRef.current;
      if (viewport) {
        setViewportOverflow(viewport, { scrolls: true });
      }
      editor.commands.focus();
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [editor, editorContentRef]);

  useEffect(() => {
    // Switching notes keeps the window, so the old note's height
    // would linger; re-fit to the new content. The window's first
    // mount keeps its restored size.
    const isNoteSwitch =
      lastMountedNoteId !== undefined && lastMountedNoteId !== noteId;
    lastMountedNoteId = noteId;
    if (isNoteSwitch && !getIsManuallyResized()) {
      fitToContent({ animate: true });
    }

    // The window follows the content's height through a
    // ResizeObserver on the editor's DOM: unlike listening to editor
    // transactions, it also catches async growth like code blocks
    // receiving their highlighting. The observer reports once on
    // observe; that report is skipped so the window doesn't jump on
    // mount.
    let isInitialReport = true;
    const observer = new ResizeObserver(() => {
      if (isInitialReport) {
        isInitialReport = false;
        return;
      }

      if (!getIsManuallyResized()) {
        fitToContent();
      }
    });

    observer.observe(editor.view.dom);
    return () => observer.disconnect();
  }, [editor, noteId, fitToContent]);

  const fitWindow = useCallback(async () => {
    setIsManuallyResized(false);

    const result = await fitToContent({ animate: true });
    editor.commands.focus();
    return result;
  }, [editor, fitToContent]);

  // Fits the window; when it already fits, tucks it into the
  // monitor's top-right corner instead.
  const fitOrSnapWindow = useCallback(async () => {
    const result = await fitWindow();
    if (result === 'unchanged') {
      await invoke('cmd_snap_window_to_corner');
    }
  }, [fitWindow]);

  const toggleAutoSize = useCallback(() => {
    if (getIsManuallyResized()) {
      fitWindow();
      return;
    }

    setIsManuallyResized(true);
    const viewport = editorContentRef.current;
    if (viewport) {
      setViewportOverflow(viewport, { scrolls: true });
    }
  }, [fitWindow, editorContentRef]);

  const isAutoSizing = useCallback(() => !getIsManuallyResized(), []);

  return { fitWindow, fitOrSnapWindow, toggleAutoSize, isAutoSizing };
}
