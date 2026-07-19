import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, type Note } from '@sticky/models';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import {
  currentMonitor,
  getCurrentWindow,
  PhysicalSize,
  type Monitor,
} from '@tauri-apps/api/window';
import {
  EditorContent,
  Editor as TiptapEditor,
  useEditor,
} from '@tiptap/react';
import { useCallback, useEffect, useRef } from 'react';
import { Divider } from '~/components/divider';
import { Header } from '~/components/header';
import { MenuBar } from '~/components/menu-bar/menu-bar';
import { useInterval } from '~/hooks/use-interval';
import { useNoteSync } from '~/hooks/use-note-sync';
import { useOnFocusChanged } from '~/hooks/use-on-focus-changed';
import { useOnWindowResize } from '~/hooks/use-on-window-resize';
import { getIsManuallyResized, setIsManuallyResized } from '~/lib/autosize';
import { editorExtensions } from '~/lib/editor-extensions';
import { clamp } from '~/lib/number';
import { listNotesOptions } from '~/queries/notes';

const EDITOR_CONTENT_ID = 'editor-content';

type SkeletonEditorProps = {
  noteId?: string;
  content?: string;
};

export function SkeletonEditor(props: SkeletonEditorProps) {
  const { noteId: currentNoteId, content: defaultContent } = props;

  const navigate = useNavigate();

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

  const editorContentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const bottomDividerRef = useRef<HTMLDivElement>(null);
  const topDividerRef = useRef<HTMLDivElement>(null);

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

    const editorContent = editorContentRef.current;
    if (!editorContent) {
      return;
    }

    editorContent.classList.add('overflow-y-scroll');
    shouldStopAutoResizeRef.current = true;
    setIsManuallyResized(true);
    editor?.commands?.focus();
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
  const fitWindowToContent = useCallback(
    async (currentEditor: TiptapEditor, options?: { animate?: boolean }) => {
      const header = headerRef.current;
      const menuBar = menuBarRef.current;
      const editorContent = editorContentRef.current;
      const topDivider = topDividerRef.current;
      const bottomDivider = bottomDividerRef.current;
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
        currentEditor.view.dom.getBoundingClientRect().height +
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
    []
  );

  const isDirtyRef = useRef<boolean>(false);
  const editor = useEditor({
    extensions: editorExtensions,
    content: defaultContent ?? '',
    contentType: 'markdown',
    autofocus: 'end',
    editorProps: {
      scrollThreshold: 40,
      scrollMargin: 40,
      attributes: {
        class:
          'focus:outline-none cursor-text! border-none px-5 pb-0 pt-2 editor-content',
      },
    },
    onUpdate: () => {
      isDirtyRef.current = true;
    },
  });

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

      fitWindowToContent(editor);
    });

    observer.observe(editor.view.dom);
    return () => observer.disconnect();
  }, [editor, fitWindowToContent]);

  const queryClient = useQueryClient();
  const {
    mutate: upsertNote,
    mutateAsync: upsertNoteAsync,
    isPending: isUpsertingNote,
  } = useMutation({
    mutationFn: (content: string) => {
      if (!currentNoteId) {
        return Promise.resolve();
      }

      const details = {
        id: currentNoteId,
        content,
      };

      return invoke('cmd_upsert_note', {
        note: details,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(listNotesOptions());
    },
  });

  useInterval(() => {
    if (!isDirtyRef.current || isUpsertingNote) {
      return;
    }

    // The flag clears at snapshot time, not when the save settles:
    // edits landing while the save is in flight re-mark it and the
    // next tick picks them up. Clearing afterwards swallowed those
    // edits — and the `notes:changed` reload then reverted the
    // "clean" editor to the stale disk content.
    isDirtyRef.current = false;
    upsertNote(editor.getMarkdown(), {
      onError: () => {
        isDirtyRef.current = true;
      },
    });
  }, 250);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const bottomDivider = bottomDividerRef.current;
    const topDivider = topDividerRef.current;
    if (!bottomDivider || !topDivider) {
      return;
    }

    const element = e.currentTarget;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    const scrollBottom = scrollTop + clientHeight;

    const distance = scrollHeight - scrollBottom;
    const bottomOpacity = clamp(distance / 17, [0, 1]);
    bottomDivider.style.opacity = String(bottomOpacity);

    const topDistance = scrollTop;
    const topOpacity = clamp(topDistance / 15, [0, 1]);
    topDivider.style.opacity = String(topOpacity);
  };

  const handleNewWindow = useCallback(async () => {
    const isEmpty = editor?.isEmpty ?? false;
    if (isEmpty) {
      await invoke('cmd_show_toast', {
        message: 'You already have an empty note',
      });
      return;
    }

    const newNote = await invoke<Note>('cmd_upsert_note', {
      note: {
        model: 'note',
        content: '',
      },
    });

    queryClient.invalidateQueries(listNotesOptions());
    await invoke('cmd_new_main_window', {
      url: `/${newNote.id}`,
      size: [MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT],
    });
  }, [editor]);

  // Fits the window to its content; when it already fits, snaps the
  // window to the monitor's top-right corner instead.
  const handleDoubleClick = useCallback(async () => {
    // The double click is also the gesture that re-enables auto-sizing
    // after a manual resize.
    shouldStopAutoResizeRef.current = false;
    setIsManuallyResized(false);

    const result = await fitWindowToContent(editor, { animate: true });
    if (result === undefined) {
      return;
    }

    if (result === 'unchanged') {
      // Already fitted: tuck the window into the screen's top-right
      // corner instead.
      await invoke('cmd_snap_window_to_corner');
    }

    editor.commands.focus();
  }, [editor, fitWindowToContent]);

  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (!target || target.id !== EDITOR_CONTENT_ID) {
        return;
      }

      editor.commands.focus();
    },
    [editor]
  );

  // Notes are browsed in a floating native search panel (see the /search
  // route); it reports selections back through window-targeted events.
  const handleBrowse = useCallback(async () => {
    await invoke('cmd_open_search_window', {
      activeNoteId: currentNoteId,
    });
  }, [currentNoteId]);

  useEffect(() => {
    const currentWindow = getCurrentWindow();

    const unlistenSelected = currentWindow.listen<string>(
      'search:note-selected',
      async (event) => {
        // Unsaved edits must reach disk before the route swaps the
        // editor out, or they die with it — the autosave interval
        // won't get another tick.
        if (isDirtyRef.current) {
          isDirtyRef.current = false;
          await upsertNoteAsync(editor.getMarkdown()).catch(() => {
            isDirtyRef.current = true;
          });
        }

        navigate({
          to: '/$noteId',
          params: {
            noteId: event.payload,
          },
        });
      }
    );

    const unlistenDeleted = currentWindow.listen(
      'search:active-note-deleted',
      () => {
        navigate({ to: '/new', replace: true });
      }
    );

    return () => {
      unlistenSelected.then((fn) => fn());
      unlistenDeleted.then((fn) => fn());
    };
  }, [navigate, editor, upsertNoteAsync]);

  useOnFocusChanged(() => {
    queryClient.invalidateQueries(listNotesOptions());
  });

  useNoteSync(editor, currentNoteId, isDirtyRef);

  return (
    <main>
      <Header
        ref={headerRef}
        onNewWindow={handleNewWindow}
        onDoubleClick={handleDoubleClick}
        onBrowse={handleBrowse}
      />

      <div className="mt-[var(--window-menu-height)] flex h-[calc(100vh-var(--window-menu-height))] flex-col">
        <Divider
          ref={topDividerRef}
          className="shrink-0 opacity-0 transition-opacity"
        />

        <EditorContent
          id={EDITOR_CONTENT_ID}
          editor={editor}
          ref={editorContentRef}
          className="cursor-text! grow flex-col overflow-y-scroll overscroll-contain"
          onScroll={onScroll}
          onClick={handleContentClick}
        />
        <Divider
          ref={bottomDividerRef}
          className="mt-auto shrink-0 opacity-0 transition-opacity"
        />
        <MenuBar ref={menuBarRef} editor={editor} />
      </div>
    </main>
  );
}
