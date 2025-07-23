import type { Note } from '@sticky/models';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import {
  currentMonitor,
  getCurrentWindow,
  PhysicalPosition,
  PhysicalSize,
} from '@tauri-apps/api/window';
import { CharacterCount } from '@tiptap/extension-character-count';
import { ListKit } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions/placeholder';
import {
  EditorContent,
  Editor as TiptapEditor,
  useEditor,
  type JSONContent,
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import { Divider } from '~/components/divider';
import { Header, HEADER_ID } from '~/components/header';
import { MenuBar } from '~/components/menu-bar/menu-bar';
import { useInterval } from '~/hooks/use-interval';
import { useOnWindowResize } from '~/hooks/use-on-window-resize';
import { getIsManuallyResized, setIsManuallyResized } from '~/lib/autosize';
import { CodeBlock } from '~/lib/highlighter';
import { clamp } from '~/lib/number';
import { getTransactionType } from '~/lib/transaction';
import { listNotesOptions } from '~/queries/notes';
import defaultNoteContent from '~/components/default-note-content.json';
import { useOnFocusChanged } from '~/hooks/use-on-focus-changed';

const EDITOR_CONTENT_ID = 'editor-content';

type SkeletonEditorProps = {
  noteId?: string;
  content?: JSONContent;
};

export function SkeletonEditor(props: SkeletonEditorProps) {
  const { noteId: currentNoteId, content: defaultContent } = props;

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
        listItem: false,
        bulletList: false,
        orderedList: false,
        listKeymap: false,
        codeBlock: false,
        trailingNode: false,
      }),
      ListKit,
      CharacterCount,
      Placeholder.configure({
        placeholder: (props) => {
          const { editor } = props;
          if (editor.isEmpty) {
            return 'Start typing...';
          }

          return 'Write something...';
        },
      }),
      CodeBlock,
    ],
    []
  );

  const navigate = useNavigate();
  const prevWindowSizeRef = useRef<PhysicalSize | null>(null);
  const shouldStopAutoResizeRef = useRef<boolean>(getIsManuallyResized());
  const editorContentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const isProgrammaticResizeRef = useRef<boolean>(false);

  useOnWindowResize(() => {
    if (isProgrammaticResizeRef.current) {
      isProgrammaticResizeRef.current = false;
      return;
    }

    const editorContent = editorContentRef.current;
    const isDisabled = shouldStopAutoResizeRef.current;
    if (!editorContent || isDisabled) {
      return;
    }

    editorContent.classList.add('overflow-y-scroll');
    shouldStopAutoResizeRef.current = true;
    setIsManuallyResized(true);
    editor?.commands?.focus();
  });

  const handleResize = useCallback(
    async (editor: TiptapEditor, force: boolean = false) => {
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
        return;
      }

      const shouldStop = shouldStopAutoResizeRef.current;
      if (shouldStop && !force) {
        return;
      }

      shouldStopAutoResizeRef.current = false;

      const rect = editor.view.dom.getBoundingClientRect();
      const editorHeight = rect.height;
      const menuBarHeight = menuBar.getBoundingClientRect().height;
      const headerHeight = header.getBoundingClientRect().height;
      const topDividerHeight = topDivider.getBoundingClientRect().height;
      const bottomDividerHeight = bottomDivider.getBoundingClientRect().height;

      const totalHeight =
        editorHeight +
        menuBarHeight +
        headerHeight +
        topDividerHeight +
        bottomDividerHeight;

      const monitor = await currentMonitor();
      if (!monitor) {
        return;
      }
      const scaleFactor = monitor.scaleFactor;
      const screenHeight = monitor.workArea.size.height;

      const currentWindow = getCurrentWindow();
      const currentSize = await currentWindow.outerSize();

      const MAX_HEIGHT = Math.floor(screenHeight * 0.75);
      const MIN_HEIGHT = 115 * scaleFactor;

      const calculatedHeight = Math.max(MIN_HEIGHT, totalHeight * scaleFactor);
      const newHeight = Math.ceil(Math.min(MAX_HEIGHT, calculatedHeight));

      const hasCrossedMaxHeight = calculatedHeight >= MAX_HEIGHT;
      editorContent.classList.toggle('overflow-y-scroll', hasCrossedMaxHeight);
      bottomDivider.style.opacity = '0';
      topDivider.style.opacity = '0';

      await currentWindow.setSize(
        new PhysicalSize(currentSize.width, newHeight)
      );
    },
    []
  );

  const isDirtyRef = useRef<boolean>(false);
  const editor = useEditor({
    extensions,
    content: defaultContent ?? '',
    autofocus: 'end',
    editorProps: {
      scrollThreshold: 40,
      scrollMargin: 40,
      attributes: {
        class:
          'focus:outline-none cursor-text! border-none px-5 pt-2 pb-0 editor-content',
      },
    },
    onTransaction: async ({ transaction, editor }) => {
      const type = getTransactionType(transaction);
      if (!type) {
        return;
      }

      isProgrammaticResizeRef.current = true;
      await handleResize(editor);
    },
    onUpdate: () => {
      isDirtyRef.current = true;
    },
  });

  const queryClient = useQueryClient();
  const { mutate: upsertNote, isPending: isUpsertingNote } = useMutation({
    mutationFn: (content: JSONContent) => {
      if (!currentNoteId) {
        return Promise.resolve();
      }

      const details = {
        id: currentNoteId,
        content: JSON.stringify(content),
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

    const content = editor.getJSON();
    upsertNote(content, {
      onSettled: () => {
        isDirtyRef.current = false;
      },
    });
  }, 1000);

  const bottomDividerRef = useRef<HTMLDivElement>(null);
  const topDividerRef = useRef<HTMLDivElement>(null);

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
      toast.warning('You already have an empty note');
      return;
    }

    const newNote = await invoke<Note>('cmd_upsert_note', {
      note: {
        model: 'note',
        content: JSON.stringify(defaultNoteContent),
      },
    });

    queryClient.invalidateQueries(listNotesOptions());
    await invoke('cmd_new_main_window', {
      url: `/${newNote.id}`,
    });
  }, [editor]);

  const handleDoubleClick = useCallback(
    async (e: React.MouseEvent<HTMLDivElement>) => {
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.id !== HEADER_ID) {
        return;
      }

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
        !bottomDivider ||
        !editor
      ) {
        return;
      }

      const rect = editor.view.dom.getBoundingClientRect();
      const editorHeight = rect.height;
      const menuBarHeight = menuBar.getBoundingClientRect().height;
      const headerHeight = header.getBoundingClientRect().height;
      const topDividerHeight = topDivider.getBoundingClientRect().height;
      const bottomDividerHeight = bottomDivider.getBoundingClientRect().height;

      const totalHeight =
        editorHeight +
        menuBarHeight +
        headerHeight +
        topDividerHeight +
        bottomDividerHeight;

      const monitor = await currentMonitor();
      if (!monitor) {
        return;
      }

      const scaleFactor = monitor.scaleFactor;
      const screenHeight = monitor.workArea.size.height;

      const currentWindow = getCurrentWindow();
      const currentSize = await currentWindow.outerSize();

      const MAX_HEIGHT = Math.floor(screenHeight * 0.75);
      const MIN_HEIGHT = 115 * scaleFactor;

      const calculatedHeight = Math.max(MIN_HEIGHT, totalHeight * scaleFactor);
      const newHeight = Math.ceil(Math.min(MAX_HEIGHT, calculatedHeight));

      shouldStopAutoResizeRef.current = false;
      setIsManuallyResized(false);

      const shouldReposition = currentSize.height === newHeight;
      if (shouldReposition) {
        const x =
          monitor.position.x +
          (monitor.size.width - currentSize.width - 40 * scaleFactor);
        const y = monitor.position.y + 100 * scaleFactor;

        await currentWindow.setPosition(new PhysicalPosition(x, y));
        editor.commands.focus();
        return;
      }

      const hasCrossedMaxHeight = calculatedHeight >= MAX_HEIGHT;
      editorContent.classList.toggle('overflow-y-scroll', hasCrossedMaxHeight);
      bottomDivider.style.opacity = '0';
      topDivider.style.opacity = '0';

      await currentWindow.setSize(
        new PhysicalSize(currentSize.width, newHeight)
      );
      editor.commands.focus();
      isProgrammaticResizeRef.current = true;
    },
    [editor]
  );

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

  const restoreWindowSize = useCallback(async () => {
    const prevWindowSize = prevWindowSizeRef.current;
    if (!prevWindowSize) {
      return;
    }

    const currentWindow = getCurrentWindow();
    await currentWindow.setSize(prevWindowSize);
  }, []);

  const handleDeleteNote = useCallback(async () => {
    await restoreWindowSize();
    navigate({ to: '/new', replace: true });
  }, [navigate, restoreWindowSize]);

  const handleNoteClick = useCallback(
    async (note: Note) => {
      await restoreWindowSize();
      navigate({
        to: '/$noteId',
        params: {
          noteId: note.id,
        },
      });
    },
    [navigate, restoreWindowSize]
  );

  const handleOpenChange = useCallback(async (open: boolean) => {
    const prevWindowSize = prevWindowSizeRef.current;

    const monitor = await currentMonitor();
    if (!monitor) {
      return;
    }

    const scaleFactor = monitor.scaleFactor;
    const currentWindow = getCurrentWindow();
    const currentSize = await currentWindow.outerSize();
    prevWindowSizeRef.current = currentSize;

    const OPEN_HEIGHT = 500 * scaleFactor;

    if (!open) {
      if (!prevWindowSize) {
        return;
      }

      await currentWindow.setSize(prevWindowSize);
      isProgrammaticResizeRef.current = true;
      editor.commands.focus();
      return;
    }

    const isLessThan500 = currentSize.height < OPEN_HEIGHT;
    if (!isLessThan500) {
      return;
    }

    await currentWindow.setSize(
      new PhysicalSize(currentSize.width, OPEN_HEIGHT)
    );
    isProgrammaticResizeRef.current = true;
  }, []);

  useOnFocusChanged(() => {
    queryClient.invalidateQueries(listNotesOptions());
  });

  return (
    <main>
      <Header
        ref={headerRef}
        activeNoteId={currentNoteId}
        onNewWindow={handleNewWindow}
        onDoubleClick={handleDoubleClick}
        onNoteClick={handleNoteClick}
        onOpenChange={handleOpenChange}
        onNoteDelete={handleDeleteNote}
      />

      <div className="mt-[var(--window-menu-height)] flex h-[calc(100vh-var(--window-menu-height))] flex-col">
        <Divider ref={topDividerRef} className="opacity-0 transition-opacity" />

        <EditorContent
          id={EDITOR_CONTENT_ID}
          editor={editor}
          ref={editorContentRef}
          className="cursor-text! flex grow flex-col overflow-y-scroll"
          onScroll={onScroll}
          onClick={handleContentClick}
        />
        <Divider
          ref={bottomDividerRef}
          className="mt-auto opacity-0 transition-opacity"
        />
        <MenuBar ref={menuBarRef} editor={editor} />
      </div>
    </main>
  );
}
