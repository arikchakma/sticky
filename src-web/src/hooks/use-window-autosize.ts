import { MIN_WINDOW_HEIGHT } from '@sticky/models';
import { invoke } from '@tauri-apps/api/core';
import {
  currentMonitor,
  getCurrentWindow,
  PhysicalSize,
  type Monitor,
} from '@tauri-apps/api/window';
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useOnWindowResize } from '~/hooks/use-on-window-resize';
import { getIsManuallyResized, setIsManuallyResized } from '~/lib/autosize';

type AutoSizeRefs = {
  header: RefObject<HTMLDivElement | null>;
  menuBar: RefObject<HTMLDivElement | null>;
  editorContent: RefObject<HTMLDivElement | null>;
  topDivider: RefObject<HTMLDivElement | null>;
  bottomDivider: RefObject<HTMLDivElement | null>;
};

export function useWindowAutoSize(editor: Editor, refs: AutoSizeRefs) {
  const shouldStopAutoResizeRef = useRef<boolean>(getIsManuallyResized());
  // Size of the last programmatic resize, in physical pixels. Resize
  // events arriving at this size are echoes of our own setSize;
  // anything else is the user dragging an edge.
  const expectedSizeRef = useRef<PhysicalSize | null>(null);
  // The native resize animation emits a stream of intermediate sizes;
  // manual-resize detection pauses until it has settled.
  const suppressResizeUntilRef = useRef(0);
  // The monitor the window is on, valid until the window moves.
  const monitorRef = useRef<Monitor | null>(null);

  useOnWindowResize(async () => {
    if (shouldStopAutoResizeRef.current) {
      return;
    }

    if (Date.now() < suppressResizeUntilRef.current) {
      return;
    }

    const size = await getCurrentWindow().outerSize();
    const expected = expectedSizeRef.current;
    if (
      expected !== null &&
      Math.abs(size.width - expected.width) <= 1 &&
      Math.abs(size.height - expected.height) <= 1
    ) {
      return;
    }

    const editorContent = refs.editorContent.current;
    if (!editorContent) {
      return;
    }

    editorContent.classList.add('overflow-y-scroll');
    shouldStopAutoResizeRef.current = true;
    setIsManuallyResized(true);
    editor.commands.focus();
  });

  useEffect(() => {
    const unlisten = getCurrentWindow().onMoved(() => {
      monitorRef.current = null;
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Resizes the window to fit the note's content, capped at 75% of the
  // monitor's work area. Returns 'unchanged' when the window already
  // fits, and undefined when the layout wasn't measurable.
  const fitToContent = useCallback(
    async (options?: { animate?: boolean }) => {
      const header = refs.header.current;
      const menuBar = refs.menuBar.current;
      const editorContent = refs.editorContent.current;
      const topDivider = refs.topDivider.current;
      const bottomDivider = refs.bottomDivider.current;
      if (
        !header ||
        !menuBar ||
        !editorContent ||
        !topDivider ||
        !bottomDivider
      ) {
        return undefined;
      }

      const totalHeight =
        editor.view.dom.getBoundingClientRect().height +
        menuBar.getBoundingClientRect().height +
        header.getBoundingClientRect().height +
        topDivider.getBoundingClientRect().height +
        bottomDivider.getBoundingClientRect().height;

      let monitor = monitorRef.current;
      if (!monitor) {
        monitor = await currentMonitor();
        monitorRef.current = monitor;
      }
      if (!monitor) {
        return undefined;
      }

      const scaleFactor = monitor.scaleFactor;
      const maxHeight = Math.floor(monitor.workArea.size.height * 0.75);
      const minHeight = MIN_WINDOW_HEIGHT * scaleFactor;

      const calculatedHeight = Math.max(minHeight, totalHeight * scaleFactor);
      const newHeight = Math.ceil(Math.min(maxHeight, calculatedHeight));

      editorContent.classList.toggle(
        'overflow-y-scroll',
        calculatedHeight >= maxHeight
      );
      bottomDivider.style.opacity = '0';
      topDivider.style.opacity = '0';

      const currentWindow = getCurrentWindow();
      const currentSize = await currentWindow.outerSize();
      // Within rounding of the target already; skip the resize so no
      // resize event is emitted that would need explaining away.
      if (Math.abs(currentSize.height - newHeight) <= 2) {
        return 'unchanged' as const;
      }

      const newSize = new PhysicalSize(currentSize.width, newHeight);
      expectedSizeRef.current = newSize;
      if (options?.animate) {
        suppressResizeUntilRef.current = Date.now() + 600;
        await invoke('cmd_animate_window_height', {
          height: newHeight / scaleFactor,
        });
      } else {
        await currentWindow.setSize(newSize);
      }
      return 'resized' as const;
    },
    [editor]
  );

  // The window tracks the content's height through a ResizeObserver on
  // the editor's DOM: unlike listening to editor transactions, it also
  // catches async growth like code blocks receiving their highlighting.
  useEffect(() => {
    if (!editor) {
      return;
    }

    // The observer reports once on observe; the window shouldn't jump
    // on mount.
    let isInitialReport = true;
    const observer = new ResizeObserver(() => {
      if (isInitialReport) {
        isInitialReport = false;
        return;
      }

      if (shouldStopAutoResizeRef.current) {
        return;
      }

      fitToContent();
    });

    observer.observe(editor.view.dom);
    return () => observer.disconnect();
  }, [editor, fitToContent]);

  const fitWindow = useCallback(async () => {
    shouldStopAutoResizeRef.current = false;
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
    if (shouldStopAutoResizeRef.current) {
      fitWindow();
      return;
    }

    shouldStopAutoResizeRef.current = true;
    setIsManuallyResized(true);
    refs.editorContent.current?.classList.add('overflow-y-scroll');
  }, [fitWindow]);

  const isAutoSizing = useCallback(() => !shouldStopAutoResizeRef.current, []);

  return { fitWindow, fitOrSnapWindow, toggleAutoSize, isAutoSizing };
}
