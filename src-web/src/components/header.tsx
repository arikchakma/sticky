import { invoke } from '@tauri-apps/api/core';
import { LayersIcon, PlusIcon } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '~/lib/classname';
import { Button } from './ui/button';

export const HEADER_ID = 'main-header';

type HeaderProps = {
  onNewWindow: () => void;
  onBrowse: () => void;
  onDoubleClick: (e: React.MouseEvent<HTMLDivElement>) => void;
};

export const Header = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & HeaderProps
>((props, ref) => {
  const { className, onNewWindow, onBrowse, onDoubleClick, ...rest } = props;

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
          e.preventDefault();
          // if the button is not the left mouse button, return
          // because we only want to handle left mouse button double click
          if (e.buttons !== 1) {
            return;
          }

          // WebKit's click count (e.detail) resets once the first
          // press's native drag session swallows the mouseup, so the
          // double click is detected on the native side instead. A
          // single press starts the window drag.
          const isDoubleClick = await invoke<boolean>(
            'cmd_header_mouse_down',
            { position: [e.screenX, e.screenY] }
          );
          if (isDoubleClick) {
            onDoubleClick(e);
          }
        }}
        id={HEADER_ID}
      >
        <div className="pointer-events-none w-[70px] shrink-0" />

        <div className="window-chrome flex items-center gap-2">
          <Button
            onClick={(e) => {
              e.stopPropagation();
              onBrowse();
            }}
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 text-zinc-300 transition-colors duration-150 hover:text-zinc-600"
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
