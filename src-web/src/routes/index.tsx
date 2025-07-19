import { createFileRoute } from '@tanstack/react-router';
import { EditorContent, useEditor } from '@tiptap/react';
import { useMemo, useRef } from 'react';
import StarterKit from '@tiptap/starter-kit';
import { ListKit } from '@tiptap/extension-list';
import { MenuBar } from '~/components/menu-bar/menu-bar';
import { CharacterCount } from '@tiptap/extension-character-count';
import { Divider } from '~/components/divider';
import { clamp } from '~/utils/number';
import { Placeholder } from '@tiptap/extensions/placeholder';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

const content = `
<h1>Welcome to Notes</h1>

<p>Notes is a <a href="https://arikk.dev">note-taking app</a> that allows you to take notes with a focus on simplicity and ease of use.</p>
`;

function IndexPage() {
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
      }),
      ListKit,
      CharacterCount,
      Placeholder.configure({
        placeholder: 'Start typing...',
      }),
    ],
    []
  );

  const editor = useEditor({
    extensions,
    content,
    editorProps: {
      attributes: {
        class:
          'focus:outline-none accent-red-500 border-none p-5 pb-0 caret-red-500 editor-content grow',
      },
    },
  });

  const dividerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const divider = dividerRef.current;
    if (!divider) {
      return;
    }

    const element = e.currentTarget;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;
    const scrollBottom = scrollTop + clientHeight;

    const distance = scrollHeight - scrollBottom;
    const opacity = clamp(distance / 17, [0, 1]);
    divider.style.opacity = String(opacity);
  };

  return (
    <main>
      <div
        className="fixed top-0 left-0 h-[var(--window-menu-height)] w-full border-b border-gray-200 bg-white"
        data-tauri-drag-region
      />

      <div
        className="flex h-[calc(100vh-var(--window-menu-height))] flex-col mt-[var(--window-menu-height)]"
        ref={containerRef}
      >
        <EditorContent
          editor={editor}
          className="grow overflow-y-auto flex flex-col"
          onScroll={onScroll}
        />
        <Divider ref={dividerRef} className="opacity-0" />
        <MenuBar editor={editor} />
      </div>
    </main>
  );
}
