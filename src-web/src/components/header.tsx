import { PlusIcon } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '~/lib/classname';
import { BrowseDialog, type BrowseDialogProps } from './browse-dialog';
import { Button } from './ui/button';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { platform } from '@tauri-apps/plugin-os';

export const HEADER_ID = 'main-header';

const currentWindow = getCurrentWebviewWindow();
const isMac = platform() === 'macos';

type HeaderProps = {
  activeNoteId?: string;
  onNewWindow: () => void;
  onDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
} & BrowseDialogProps;

export const Header = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & HeaderProps
>((props, ref) => {
  const {
    className,
    activeNoteId,
    onNewWindow,
    onDoubleClick,
    onNoteClick,
    onOpenChange,
    onNoteDelete,
    ...rest
  } = props;

  const ButtonGroup = () => (
    <div className="pointer-events-auto flex items-center gap-2">
      <BrowseDialog
        activeNoteId={activeNoteId}
        onNoteClick={onNoteClick}
        onOpenChange={onOpenChange}
        onNoteDelete={onNoteDelete}
      />
      <Button
        onClick={(e) => {
          e.stopPropagation();
          onNewWindow();
        }}
        variant="ghost"
        size="icon"
        className="size-7 shrink-0 text-zinc-300 transition-colors duration-150 hover:text-zinc-600"
      >
        <PlusIcon className="h-4 w-4" />
      </Button>
    </div>
  );

  return (
    <header
      {...rest}
      ref={ref}
      className={cn(
        'z-99 fixed left-0 top-0 h-[var(--window-menu-height)] w-full select-none bg-transparent',
        className
      )}
    >
      <div
        className="flex h-full items-center justify-between"
        id={HEADER_ID}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          currentWindow.startDragging();
        }}
        onDoubleClick={onDoubleClick}
      >
        <div className="flex items-center pl-2">
          {isMac ? <div className="w-[70px]" /> : <ButtonGroup />}
        </div>

        <div className="flex items-center">
          {isMac ? <ButtonGroup /> : <WindowControls />}
        </div>
      </div>
    </header>
  );
});

Header.displayName = 'Header';

function WindowControls() {
  return (
    <div className="flex h-full select-none items-center">
      <button
        className="flex h-12 w-12 items-center justify-center rounded-none text-gray-500 transition hover:bg-red-100 hover:text-red-600 focus:outline-none active:bg-red-200"
        onClick={() => currentWindow.close()}
        aria-label="Close"
        tabIndex={0}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="m-0 block p-0"
        >
          <path
            d="M5 5l6 6M11 5l-6 6"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}
