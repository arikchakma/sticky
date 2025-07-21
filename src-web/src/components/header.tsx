import { PlusIcon } from 'lucide-react';
import { forwardRef } from 'react';
import { Button } from './ui/button';
import { cn } from '~/utils/classname';
import { getCurrentWindow } from '@tauri-apps/api/window';

const currentWindow = getCurrentWindow();

type HeaderProps = {
  onNewWindow: () => void;
  onDoubleClick: () => void;
};

export const Header = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & HeaderProps
>((props, ref) => {
  const { className, onNewWindow, onDoubleClick, ...rest } = props;

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
        onMouseDown={() => {
          currentWindow.startDragging();
        }}
        onDoubleClick={onDoubleClick}
      >
        <div className="pointer-events-none flex items-center gap-2 pl-3.5">
          <TrafficButton />
          <TrafficButton />
          <TrafficButton />
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={onNewWindow}
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
