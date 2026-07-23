import { useHotkey } from '@tanstack/react-hotkeys';
import { useEditorState, type Editor } from '@tiptap/react';
import {
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
  XIcon,
} from 'lucide-react';
import { useCallback, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Text } from './ui/text';

type FindBarProps = {
  editor: Editor;
  onClose: () => void;
};

function scrollToActiveMatch(editor: Editor) {
  editor.view.dom
    .querySelector('.find-match-active')
    ?.scrollIntoView({ block: 'center' });
}

export function FindBar(props: FindBarProps) {
  const { editor, onClose } = props;

  const inputRef = useRef<HTMLInputElement>(null);

  const { query, matchCount, activeIndex } = useEditorState({
    editor,
    selector: (ctx) => ({
      query: ctx.editor.storage.find.query,
      matchCount: ctx.editor.storage.find.matches.length,
      activeIndex: ctx.editor.storage.find.activeIndex,
    }),
  });

  useEffect(() => {
    const { state } = editor;
    const selection = state.doc.textBetween(
      state.selection.from,
      state.selection.to,
      ' '
    );

    if (selection && selection.length <= 64) {
      editor.commands.setFindQuery(selection);
      scrollToActiveMatch(editor);
    }

    const input = inputRef.current;
    input?.focus();
    input?.select();

    return () => {
      if (!editor.isDestroyed) {
        editor.commands.clearFind();
      }
    };
  }, [editor]);

  const close = useCallback(() => {
    const { matches, activeIndex } = editor.storage.find;
    const active = matches[activeIndex];
    if (active) {
      editor.chain().focus().setTextSelection(active.from).run();
    } else {
      editor.commands.focus();
    }

    onClose();
  }, [editor, onClose]);

  const step = useCallback(
    (direction: 1 | -1) => {
      if (direction === 1) {
        editor.commands.findNext();
      } else {
        editor.commands.findPrevious();
      }

      scrollToActiveMatch(editor);
    },
    [editor]
  );

  useHotkey('Escape', close);
  useHotkey('Mod+G', () => step(1));
  useHotkey('Mod+Shift+G', () => step(-1));

  useHotkey(
    'Mod+F',
    () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    },
    { conflictBehavior: 'allow' }
  );

  useHotkey('Enter', () => step(1), { target: inputRef, ignoreInputs: false });
  useHotkey('Shift+Enter', () => step(-1), {
    target: inputRef,
    ignoreInputs: false,
  });

  return (
    <div className="border-border h-9.5 flex shrink-0 items-center gap-1 border-t pr-3">
      <label className="flex h-full grow items-center gap-2 pl-[var(--editor-inset-x)]">
        <SearchIcon className="text-faint size-3.5 shrink-0" />

        <Input
          ref={inputRef}
          value={query}
          placeholder="Find in note…"
          className="h-full grow rounded-none border-none bg-transparent p-0 text-sm focus:border-none"
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          onChange={(e) => {
            editor.commands.setFindQuery(e.target.value);
            scrollToActiveMatch(editor);
          }}
        />
      </label>

      {query && (
        <Text
          size="1"
          className="text-faint shrink-0 whitespace-nowrap tabular-nums"
        >
          {matchCount === 0 ? '0/0' : `${activeIndex + 1}/${matchCount}`}
        </Text>
      )}

      <span className="bg-border mx-0.5 h-4 w-px shrink-0" />

      <Button
        size="icon"
        variant="ghost"
        className="text-muted-foreground hover:text-foreground size-6"
        disabled={matchCount === 0}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => step(-1)}
      >
        <ChevronUpIcon className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="text-muted-foreground hover:text-foreground size-6"
        disabled={matchCount === 0}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => step(1)}
      >
        <ChevronDownIcon className="h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="text-muted-foreground hover:text-foreground size-6"
        onMouseDown={(e) => e.preventDefault()}
        onClick={close}
      >
        <XIcon className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
