import { useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useRef } from 'react';
import { Divider } from '~/components/divider';
import { Header } from '~/components/header';
import { MenuBar } from '~/components/menu-bar/menu-bar';
import { useNoteActions } from '~/hooks/use-note-actions';
import { useNoteAutosave } from '~/hooks/use-note-autosave';
import { useNoteSync } from '~/hooks/use-note-sync';
import { useOnFocusChanged } from '~/hooks/use-on-focus-changed';
import { useWindowAutoSize } from '~/hooks/use-window-autosize';
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

  const editorContentRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const bottomDividerRef = useRef<HTMLDivElement>(null);
  const topDividerRef = useRef<HTMLDivElement>(null);

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

  const { fitWindow, fitOrSnapWindow, toggleAutoSize, isAutoSizing } =
    useWindowAutoSize(editor, {
      header: headerRef,
      menuBar: menuBarRef,
      editorContent: editorContentRef,
      topDivider: topDividerRef,
      bottomDivider: bottomDividerRef,
    });

  const { flush } = useNoteAutosave(editor, currentNoteId, isDirtyRef);

  const { createNote, browseNotes } = useNoteActions({
    editor,
    noteId: currentNoteId,
    isDirtyRef,
    flush,
    fitWindow,
    toggleAutoSize,
    isAutoSizing,
  });

  const queryClient = useQueryClient();
  useOnFocusChanged(() => {
    queryClient.invalidateQueries(listNotesOptions());
  });

  useNoteSync(editor, currentNoteId, isDirtyRef);

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

  return (
    <main>
      <Header
        ref={headerRef}
        onNewWindow={createNote}
        onDoubleClick={fitOrSnapWindow}
        onBrowse={browseNotes}
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
