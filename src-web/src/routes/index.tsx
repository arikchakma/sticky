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
import { CodeBlock } from '~/lib/highlighter';

export const Route = createFileRoute('/')({
  component: IndexPage,
});

const content = `
<h1>Welcome to Notes</h1>
<p>Thank you for checking out Notes, a handy small scratchpad for your new ideas, meeting notes, and things you want to jot down quickly.</p>
<pre><code class="language-rust">fn main() {
  println!("Hello, world!");
}</code></pre>
<hr>
<p>Notes is a <a href="https://arikk.dev">note-taking app</a> that allows you to take notes with a focus on simplicity and ease of use.</p>
<pre><code class="language-typescript">// This is a comment explaining constants and functions
const PI = 3.14159;
const URL = "https://example.com";

function calculateArea(radius) {
  const area = PI * radius * radius; // constant and property usage
  return \`Area is \${area}\`; // string expression
}

const obj = {
  prop: "value", // property
  num: 42 // number
};

let keywordExample = null; // keyword
let parameterExample = (param1, param2) => {
  // parameters
  return param1 + param2;
};

console.log(calculateArea(5));
console.log("Visit site:", URL); // link-like string

// Diff simulation
// - Removed line (simulated diff deleted)
// + Added line (simulated diff inserted)</code></pre>
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
        codeBlock: false,
      }),
      ListKit,
      CharacterCount,
      Placeholder.configure({
        placeholder: 'Start typing...',
      }),
      CodeBlock,
    ],
    []
  );

  const editor = useEditor({
    extensions,
    content,
    autofocus: 'end',
    editorProps: {
      scrollThreshold: 80,
      scrollMargin: 80,
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
