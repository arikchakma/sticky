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
<h1>Welcome to Raycast Notes</h1><p class="editor-paragraph">Thank you for checking out Raycast Notes, a handy small scratchpad for your new ideas, meeting notes, and things you want to jot down quickly.</p><hr><h2>📑 Browsing Notes</h2><p class="editor-paragraph">You can find your notes with <code>⌘</code> <code>P</code> or via the panel button in the title bar. You can have up to 5 notes on the free plan, and an unlimited amount with <a href="https://www.raycast.com/pro" target="_blank" rel="noopener noreferrer nofollow" id="fa84690f-4465-4b6a-8884-47cd30c464f8">Raycast Pro</a>.</p><h2>📏 Window Resizing</h2><p class="editor-paragraph">Raycast Notes’ height is dynamic by default. You can override this by simply re-sizing it manually.</p><p class="editor-paragraph">To get back to auto-sizing, you can hover around the bottom edge, where you will see an “auto-size” button appear.</p><h2>⚡ Actions</h2><p class="editor-paragraph">You can find some helpful actions from the <code>⌘</code> <code>K</code> menu or the <code>⌘</code> icon in the title bar.</p><h2>🎨 Formatting <code>arik</code> arik</h2><p class="editor-paragraph">You can use markdown to format your text, using <code>#</code> for headings, <code>**bold**</code>, <code>[]</code> for task items and so on. Check out the full list <a href="https://www.raycast.com/help/notes" target="_blank" rel="noopener noreferrer nofollow" id="ab25bd2a-7e57-4972-bb30-9d44eb8e1ac4">here</a>.</p><hr><p class="editor-paragraph">We hope you enjoy using Raycast Notes. Please feel free to leave us feedback in our <a href="http://raycast.com/community" target="_blank" rel="noopener noreferrer nofollow" id="09cfb928-1a41-459c-baa0-fa3ce6a28e61">Slack Community</a> ❤️</p>
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
