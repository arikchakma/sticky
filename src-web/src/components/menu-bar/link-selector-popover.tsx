import { ArrowRightIcon, LinkIcon, XIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '~/utils/classname';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

type LinkSelectorPopoverProps = {
  defaultValue: string;
  isActive: boolean;
  onSelect: (url: string) => void;
  onRemove: () => void;
};

export function LinkSelectorPopover(props: LinkSelectorPopoverProps) {
  const { defaultValue, isActive, onSelect, onRemove } = props;
  const [isOpen, setIsOpen] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input) {
      return;
    }

    const url = input.value;
    if (!url) {
      return;
    }

    onSelect(url);
    setIsOpen(false);
  };

  const handleRemove = () => {
    onRemove();
    setIsOpen(false);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'size-7 text-zinc-500 hover:text-zinc-500 data-[state=open]:text-black',
            isActive && 'text-black'
          )}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        className="w-64 overflow-hidden rounded-xl p-0 caret-red-500"
      >
        <form className="relative" onSubmit={handleSubmit}>
          <Input
            type="url"
            ref={inputRef}
            autoFocus
            className="rounded-none border-none pr-9 shadow-none focus-visible:ring-0"
            placeholder="https://arikko.dev"
            defaultValue={defaultValue}
          />
          <div className="absolute bottom-0 right-1 top-0 flex items-center">
            {defaultValue && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-zinc-500 hover:text-black"
                onClick={handleRemove}
              >
                <XIcon className="h-4 w-4" />
              </Button>
            )}

            {!defaultValue && (
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="size-7 text-zinc-500 hover:text-black"
              >
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
