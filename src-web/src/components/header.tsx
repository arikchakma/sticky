import { invoke } from '@tauri-apps/api/core';
import { PlusIcon } from 'lucide-react';
import { forwardRef } from 'react';
import { Button } from './ui/button';
import { cn } from '~/utils/classname';

export const Header = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const { className, ...rest } = props;

  return (
    <header
      {...rest}
      ref={ref}
      className={cn(
        'fixed left-0 top-0 h-[var(--window-menu-height)] w-full bg-white',
        className
      )}
    >
      <div
        className="flex h-full items-center justify-between pr-1"
        data-tauri-drag-region
      >
        <div />

        <div className="flex items-center gap-2">
          <Button
            onClick={async () => {
              invoke('cmd_new_main_window', {
                url: '/',
              });
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
