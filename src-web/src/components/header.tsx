import { invoke } from '@tauri-apps/api/core';
import { LayersIcon, PlusIcon } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '~/lib/classname';
import { Button } from './ui/button';

export const HEADER_ID = 'main-header';

type HeaderProps = {
  title: string;
  onNewWindow: () => void;
  onBrowse: () => void;
  onDoubleClick: () => void;
};

export const Header = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & HeaderProps
>((props, ref) => {
  const { className, title, onNewWindow, onBrowse, onDoubleClick, ...rest } =
    props;

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
        onMouseDown={async (e) => {
          e.stopPropagation();
          // Keeps focus in the editor even when the press lands on
          // one of the header's buttons.
          e.preventDefault();

          // Presses on the buttons are theirs alone: they neither
          // drag the window nor count towards a double click. Only
          // left presses on the bare header surface do.
          if (e.buttons !== 1 || e.target !== e.currentTarget) {
            return;
          }

          // WebKit's click count (e.detail) resets once the first
          // press's native drag session swallows the mouseup, so the
          // native side reads AppKit's counter instead. A single press
          // starts the window drag.
          const isDoubleClick = await invoke<boolean>(
            'cmd_header_mouse_down'
          );
          if (isDoubleClick) {
            onDoubleClick();
          }
        }}
        id={HEADER_ID}
      >
        <div className="pointer-events-none w-[70px] shrink-0" />

        <span className="window-title text-muted-foreground pointer-events-none absolute left-1/2 top-1/2 max-w-[60%] -translate-x-1/2 -translate-y-1/2 truncate text-sm font-medium">
          {title}
        </span>

        <div className="window-chrome flex items-center gap-2">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onBrowse();
            }}
            variant="ghost"
            size="icon"
            className="text-faint hover:text-muted-foreground size-7 shrink-0 transition-colors duration-150"
          >
            <LayersIcon className="h-4 w-4" />
          </Button>
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onNewWindow();
            }}
            variant="ghost"
            size="icon"
            className="text-faint hover:text-muted-foreground size-7 shrink-0 transition-colors duration-150"
          >
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
});

Header.displayName = 'Header';
