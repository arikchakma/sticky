import { createFileRoute } from '@tanstack/react-router';
import { CharacterCount } from '@tiptap/extension-character-count';
import { ListKit } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions/placeholder';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useMemo, useRef } from 'react';
import { Divider } from '~/components/divider';
import { Header } from '~/components/header';
import { MenuBar } from '~/components/menu-bar/menu-bar';
import { CodeBlock } from '~/lib/highlighter';
import { clamp } from '~/utils/number';

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

  const bottomDividerRef = useRef<HTMLDivElement>(null);
  const topDividerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <main>
      <Header />

      <div
        className="mt-[var(--window-menu-height)] flex h-[calc(100vh-var(--window-menu-height))] flex-col"
        ref={containerRef}
      >
        <Divider ref={topDividerRef} className="opacity-0" />

        <EditorContent
          editor={editor}
          className="flex grow flex-col overflow-y-auto"
          onScroll={onScroll}
        />
        <Divider ref={bottomDividerRef} className="opacity-0" />
        <MenuBar editor={editor} />
      </div>
    </main>
  );
}
