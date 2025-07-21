import { createFileRoute } from '@tanstack/react-router';
import { CharacterCount } from '@tiptap/extension-character-count';
import { ListKit } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions/placeholder';
import { Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useMemo, useRef } from 'react';
import { Divider } from '~/components/divider';
import { Header } from '~/components/header';
import { MenuBar } from '~/components/menu-bar/menu-bar';
import { CodeBlock } from '~/lib/highlighter';
import { clamp } from '~/utils/number';
import {
  currentMonitor,
  getCurrentWindow,
  PhysicalSize,
} from '@tauri-apps/api/window';
import { getTransactionType } from '~/lib/transaction';
import { useOnWindowResize } from '~/hooks/use-on-window-resize';
import { getIsManuallyResized, setIsManuallyResized } from '~/lib/autosize';

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

    editorContent.classList.add('overflow-y-scroll', 'grow');
    editor?.commands?.focus();
    shouldStopAutoResizeRef.current = true;
    setIsManuallyResized(true);
  });

  const handleResize = useCallback(
    async (editor: Editor, force: boolean = false) => {
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

  const editor = useEditor({
    extensions,
    content,
    autofocus: 'end',
    editorProps: {
      scrollThreshold: 40,
      scrollMargin: 40,
      attributes: {
        class:
          'focus:outline-none border-none px-5 pt-2 pb-0 editor-content grow',
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
  });

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

  return (
    <main>
      <Header ref={headerRef} />

      <div className="mt-[var(--window-menu-height)] flex h-[calc(100vh-var(--window-menu-height))] flex-col">
        <Divider ref={topDividerRef} className="opacity-0 transition-opacity" />

        <EditorContent
          editor={editor}
          ref={editorContentRef}
          className="flex flex-col overflow-y-scroll"
          onScroll={onScroll}
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
