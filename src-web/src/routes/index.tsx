import { createFileRoute } from '@tanstack/react-router';
import { CharacterCount } from '@tiptap/extension-character-count';
import { ListKit } from '@tiptap/extension-list';
import { Placeholder } from '@tiptap/extensions/placeholder';
import { Editor, EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { ReplaceAroundStep, ReplaceStep, Step } from '@tiptap/pm/transform';

function isReplaceStep(step: Step) {
  return step instanceof ReplaceStep || step instanceof ReplaceAroundStep;
}

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

export function useMonitorSwitchDetector(
  onMonitorChange: (monitorName: string | null, scaleFactor: number) => void
) {
  const prevMonitorNameRef = useRef<string | null>(null);
  const prevScaleFactorRef = useRef<number | null>(null);

  const checkMonitor = useCallback(async () => {
    console.log('🔄 Checking monitor');

    const monitor = await currentMonitor();
    if (!monitor) return;

    const { name, scaleFactor } = monitor;

    const prevName = prevMonitorNameRef.current;
    const prevScale = prevScaleFactorRef.current;

    const monitorChanged = prevName !== null && name !== prevName;
    const scaleChanged = prevScale !== null && scaleFactor !== prevScale;

    if (monitorChanged || scaleChanged) {
      onMonitorChange(name, scaleFactor);
    }

    prevMonitorNameRef.current = name;
    prevScaleFactorRef.current = scaleFactor;
  }, [onMonitorChange]);

  useEffect(() => {
    (async () => {
      const monitor = await currentMonitor();
      if (monitor) {
        prevMonitorNameRef.current = monitor.name;
        prevScaleFactorRef.current = monitor.scaleFactor;
      }
    })();

    const unlisten = getCurrentWindow().onResized(checkMonitor);

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [checkMonitor]);
}

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

  const shouldStopAutoResizeRef = useRef<boolean>(false);
  useMonitorSwitchDetector(() => {
    autosize(editor);
  });

  const prevEditorHeightRef = useRef<number>(0);
  const isEditorUpdatedRef = useRef<boolean>(false);
  const editorContentRef = useRef<HTMLDivElement>(null);

  const autosize = useCallback((editor: Editor, shouldStop: boolean = true) => {
    const editorContent = editorContentRef.current;
    const topDivider = topDividerRef.current;
    const bottomDivider = bottomDividerRef.current;
    if (!editorContent || !topDivider || !bottomDivider) {
      return;
    }

    editorContent.style.overflowY = 'scroll';
    editorContent.style.flexGrow = '1';
    editor?.commands?.focus();
    shouldStopAutoResizeRef.current = shouldStop;
  }, []);

  const editor = useEditor({
    extensions,
    content: '',
    autofocus: 'end',
    editorProps: {
      scrollThreshold: 20,
      scrollMargin: 20,
      attributes: {
        class:
          'focus:outline-none border-none px-5 pt-2 pb-0 editor-content grow',
      },
    },
    onCreate: ({ editor }) => {
      if (isEditorUpdatedRef.current) {
        return;
      }

      const rect = editor.view.dom.getBoundingClientRect();
      const currentEditorHeight = rect.height;

      if (currentEditorHeight > 115) {
        autosize(editor);
        return;
      }

      prevEditorHeightRef.current = currentEditorHeight;
      isEditorUpdatedRef.current = true;
    },
    onTransaction: async ({ transaction }) => {
      const editorContent = editorContentRef.current;
      const topDivider = topDividerRef.current;
      const bottomDivider = bottomDividerRef.current;
      if (!editorContent || !topDivider || !bottomDivider) {
        return;
      }

      const shouldStop = shouldStopAutoResizeRef.current;
      if (shouldStop) {
        return;
      }

      let type: 'delete' | 'insert' | null = null;
      for (const step of transaction.steps) {
        if (!isReplaceStep(step)) {
          continue;
        }

        const slice = step.slice;
        if (!slice) {
          continue;
        }

        const content = slice.content;
        if (content.size === 0) {
          type = 'delete';
          break;
        } else if (content.size > 0) {
          type = 'insert';
          break;
        }
      }

      if (!type) {
        return;
      }

      const rect = editor.view.dom.getBoundingClientRect();
      const currentEditorHeight = rect.height;
      if (!isEditorUpdatedRef.current) {
        prevEditorHeightRef.current = currentEditorHeight;
        isEditorUpdatedRef.current = true;
        return;
      }

      const prevEditorHeight = prevEditorHeightRef.current;
      prevEditorHeightRef.current = currentEditorHeight;
      const diff =
        type === 'delete'
          ? currentEditorHeight - prevEditorHeight
          : prevEditorHeight - currentEditorHeight;
      if (diff === 0) {
        return;
      }

      const monitor = await currentMonitor();
      if (!monitor) {
        return;
      }
      const scaleFactor = monitor.scaleFactor;
      const screenHeight = monitor.workArea.size.height;

      const currentWindow = getCurrentWindow();
      const currentSize = await currentWindow.outerSize();
      const currentWindowHeight = currentSize.height;

      const maxHeight = Math.floor(screenHeight * 0.75);

      const scaledDiff = diff * scaleFactor;
      let newHeight = Math.min(
        maxHeight,
        currentWindowHeight + (type === 'delete' ? scaledDiff : -scaledDiff)
      );

      if (newHeight >= maxHeight) {
        autosize(editor, true);
        newHeight = maxHeight;
      } else {
        editorContent.style.overflowY = 'hidden';
        bottomDivider.style.opacity = '0';
        topDivider.style.opacity = '0';
      }

      const minHeight = 115 * scaleFactor;
      const isLessThanMinHeight = newHeight < minHeight;
      if (isLessThanMinHeight) {
        newHeight = minHeight;
      }

      await currentWindow.setSize(
        new PhysicalSize(currentSize.width, newHeight)
      );
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
        <Divider ref={topDividerRef} className="opacity-0 transition-opacity" />

        <EditorContent
          editor={editor}
          ref={editorContentRef}
          className="flex flex-col overflow-y-auto"
          onScroll={onScroll}
        />
        <Divider
          ref={bottomDividerRef}
          className="mt-auto opacity-0 transition-opacity"
        />
        <MenuBar editor={editor} />
      </div>
    </main>
  );
}
