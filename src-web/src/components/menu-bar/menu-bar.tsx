import { useEditorState, type Editor } from '@tiptap/react';
import { TypeIcon, XCircleIcon } from 'lucide-react';
import { forwardRef, useState } from 'react';
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
        <div className="flex grow items-center justify-center">
          {showMenuBarItems && <MenuBarItems editor={editor} />}
          {!showMenuBarItems && (
            <button
              className="text-faint hover:text-muted-foreground text-sm font-medium transition-colors duration-150 focus:outline-none"
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

        <div className="window-chrome absolute right-1 top-1">
          <Button
            onClick={() => setShowMenuBarItems(!showMenuBarItems)}
            variant="ghost"
            size="icon"
            className="text-faint hover:text-muted-foreground size-7 shrink-0 transition-colors duration-150"
          >
            {showMenuBarItems ? (
              <XCircleIcon className="[&_path]:stroke-background h-4 w-4 [&_circle]:fill-current" />
            ) : (
              <TypeIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    );
  }
);
