import { getCurrentWindow } from '@tauri-apps/api/window';
import { PlusIcon, SettingsIcon } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '~/lib/classname';
import { BrowseDialog, type BrowseDialogProps } from './browse-dialog';
import { Button } from './ui/button';

export const HEADER_ID = 'main-header';

const currentWindow = getCurrentWindow();

type HeaderProps = {
  activeNoteId?: string;
  onNewWindow: () => void;
  onOpenSettings: () => void;
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
    onOpenSettings,
    onDoubleClick,
    onNoteClick,
    onOpenChange,
    onNoteDelete,
    ...rest
  } = props;

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
        className="flex h-full items-center justify-between pr-1"
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          // if the button is not the left mouse button, return
          // because we only want to handle left mouse button double click
          if (e.buttons !== 1) {
            return;
          }

          if (e.detail === 2) {
            onDoubleClick(e);
            return;
          }

          currentWindow.startDragging();
        }}
        id={HEADER_ID}
      >
        <div className="pointer-events-none flex items-center gap-2 pl-3.5">
          <TrafficButton />
          <TrafficButton />
          <TrafficButton />
        </div>

        <div className="flex items-center gap-2">
          <BrowseDialog
            activeNoteId={activeNoteId}
            onNoteClick={onNoteClick}
            onOpenChange={onOpenChange}
            onNoteDelete={onNoteDelete}
          />
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onOpenSettings();
            }}
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-zinc-300 transition-colors duration-150 hover:text-zinc-600"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
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
      </div>
    </header>
  );
});

Header.displayName = 'Header';

type TrafficButtonProps = {};

function TrafficButton(_: TrafficButtonProps) {
  return <div className="h-3 w-3 rounded-full bg-gray-300" />;
}
