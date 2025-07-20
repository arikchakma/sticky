import { forwardRef, useState } from 'react';
import { MenuBarItems } from './menu-bar-items';
import { useEditorState, type Editor } from '@tiptap/react';
import { Button } from '../ui/button';
import { TypeIcon, XCircleIcon } from 'lucide-react';
import { cn } from '~/utils/classname';

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

    const { characterCount, wordCount } = useEditorState({
      editor,
      selector: (ctx) => ({
        characterCount: ctx.editor.storage.characterCount.characters(),
        wordCount: ctx.editor.storage.characterCount.words(),
      }),
    });

    return (
      <div ref={ref} className="flex items-center p-1 h-9.5 relative shrink-0">
        <div
          className={cn(
            'flex items-center justify-center grow',
            showMenuBarItems && 'justify-start'
          )}
        >
          {showMenuBarItems && <MenuBarItems editor={editor} />}
          {!showMenuBarItems && (
            <button
              className="text-sm text-zinc-300 font-medium focus:outline-none hover:text-zinc-400 transition-colors duration-150"
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
            className="size-7 text-zinc-300 hover:text-zinc-600 transition-colors duration-150 shrink-0"
          >
            {showMenuBarItems ? (
              <XCircleIcon className="w-4 h-4 [&_circle]:fill-current [&_path]:stroke-white" />
            ) : (
              <TypeIcon className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>
    );
  }
);
