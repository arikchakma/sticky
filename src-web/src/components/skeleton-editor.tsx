import { useHotkey } from '@tanstack/react-hotkeys';
import { useQueryClient } from '@tanstack/react-query';
import { EditorContent, useEditor } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Divider } from '~/components/divider';
import { FindBar } from '~/components/find-bar';
import { Header } from '~/components/header';
import { MenuBar } from '~/components/menu-bar/menu-bar';
import { useNoteActions } from '~/hooks/use-note-actions';
import { useNoteAutosave } from '~/hooks/use-note-autosave';
import { useNoteSync } from '~/hooks/use-note-sync';
import { useNoteTitle } from '~/hooks/use-note-title';
import { useOnFocusChanged } from '~/hooks/use-on-focus-changed';
import { useWindowAutoSize } from '~/hooks/use-window-autosize';
import { useWindowReveal } from '~/hooks/use-window-reveal';
import { editorExtensions } from '~/lib/extensions/extensions';
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
          'focus:outline-none cursor-text! border-none px-[var(--editor-inset-x)] pb-2 pt-2 editor-content',
      },
    },
    onUpdate: () => {
      isDirtyRef.current = true;
    },
  });

  const { fitWindow, fitOrSnapWindow, toggleAutoSize, isAutoSizing } =
    useWindowAutoSize(editor, currentNoteId, editorContentRef);

  const { flush } = useNoteAutosave(editor, currentNoteId, isDirtyRef);

  const [isFindOpen, setIsFindOpen] = useState(false);
  const openFind = useCallback(() => setIsFindOpen(true), []);
  const closeFind = useCallback(() => setIsFindOpen(false), []);

  // The bar itself handles Mod+F while it is already open, by
  // refocusing its input.
  useHotkey('Mod+F', openFind);

  const { createNote, browseNotes } = useNoteActions({
    editor,
    noteId: currentNoteId,
    isDirtyRef,
    flush,
    fitWindow,
    toggleAutoSize,
    isAutoSizing,
    openFind,
  });

  const title = useNoteTitle(editor);

  const queryClient = useQueryClient();
  useOnFocusChanged(() => {
    queryClient.invalidateQueries(listNotesOptions());
  });

  useNoteSync(editor, currentNoteId, isDirtyRef);
  useWindowReveal(editor);

  // The dividers hint at content scrolled out above or below the
  // viewport, fading in over the first few pixels of overflow.
  const updateDividers = useCallback((element: HTMLElement) => {
    const bottomDivider = bottomDividerRef.current;
    const topDivider = topDividerRef.current;
    if (!bottomDivider || !topDivider) {
      return;
    }

    // A clipped viewport (auto-fit) has nothing scrolled out of view;
    // any overflow it measures is a transient the window is about to
    // absorb.
    if (!element.classList.contains('overflow-y-scroll')) {
      bottomDivider.style.opacity = '0';
      topDivider.style.opacity = '0';
      return;
    }

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;
    bottomDivider.style.opacity = String(clamp(distance / 17, [0, 1]));
    topDivider.style.opacity = String(clamp(element.scrollTop / 15, [0, 1]));
  }, []);

  // Overflow also comes and goes without scrolling — the window
  // resizing, or the content growing under it.
  useEffect(() => {
    const viewport = editorContentRef.current;
    if (!viewport) {
      return;
    }

    const observer = new ResizeObserver(() => updateDividers(viewport));
    observer.observe(viewport);
    observer.observe(editor.view.dom);
    return () => observer.disconnect();
  }, [editor, updateDividers]);

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
        title={title}
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
          className="cursor-text! min-h-0 grow flex-col overflow-y-scroll overscroll-contain"
          onScroll={(e) => updateDividers(e.currentTarget)}
          onClick={handleContentClick}
        />
        <Divider
          ref={bottomDividerRef}
          className="mt-auto shrink-0 opacity-0 transition-opacity"
        />
        {isFindOpen ? (
          <FindBar editor={editor} onClose={closeFind} />
        ) : (
          <MenuBar editor={editor} />
        )}
      </div>
    </main>
  );
}
