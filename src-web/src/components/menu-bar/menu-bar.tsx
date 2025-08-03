import { useEditorState, type Editor } from '@tiptap/react';
import { TypeIcon, XCircleIcon } from 'lucide-react';
import { forwardRef, useEffect, useState } from 'react';
import { cn } from '~/lib/classname';
import { getShowWordCount, listenShowWordCount } from '~/lib/settings';
import { Button } from '../ui/button';
import { MenuBarItems } from './menu-bar-items';

type MenuBarProps = {
  editor: Editor;
};

export const MenuBar = forwardRef<HTMLDivElement, MenuBarProps>(
  (props, ref) => {
    const { editor } = props;
    const [showMenuBarItems, setShowMenuBarItems] = useState(false);
    const [countType, setCountType] = useState<'characters' | 'words'>(
      'characters'
    );
    const [showCount, setShowCount] = useState(true);

    useEffect(() => {
      getShowWordCount().then(setShowCount);
      const unlisten = listenShowWordCount(setShowCount);
      return () => {
        unlisten.then((fn) => fn());
      };
    }, []);

    const { characterCount, wordCount } = useEditorState({
      editor,
      selector: (ctx) => ({
        characterCount: ctx.editor.storage.characterCount.characters(),
        wordCount: ctx.editor.storage.characterCount.words(),
      }),
    });

    return (
      <div
        ref={ref}
        className="h-9.5 z-99 relative flex shrink-0 items-center p-1"
      >
        <div
          className={cn(
            'flex grow items-center justify-center',
            showMenuBarItems && 'justify-start'
          )}
        >
          {showMenuBarItems && <MenuBarItems editor={editor} />}
          {!showMenuBarItems && showCount && (
            <button
              className="text-sm font-medium text-zinc-300 transition-colors duration-150 hover:text-zinc-400 focus:outline-none"
              onClick={() =>
                setCountType(
                  countType === 'characters' ? 'words' : 'characters'
                )
              }
            >
              {countType === 'characters'
                ? `${characterCount} characters`
                : `${wordCount} words`}
            </button>
          )}
        </div>

        <div className="absolute right-1 top-1">
          <Button
            onClick={() => setShowMenuBarItems(!showMenuBarItems)}
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-zinc-300 transition-colors duration-150 hover:text-zinc-600"
          >
            {showMenuBarItems ? (
              <XCircleIcon className="h-4 w-4 [&_circle]:fill-current [&_path]:stroke-white" />
            ) : (
              <TypeIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    );
  }
);
