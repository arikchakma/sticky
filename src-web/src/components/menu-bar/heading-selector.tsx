import {
  ChevronUpIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  HeadingIcon,
} from 'lucide-react';
import { cn } from '~/lib/classname';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

type HeadingSelectorProps = {
  isActive: boolean;
  currentLevel: 1 | 2 | 3 | null;
  onSelect: (level: 1 | 2 | 3) => void;
};

export function HeadingSelector(props: HeadingSelectorProps) {
  const { isActive, currentLevel, onSelect } = props;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'h-7 w-auto gap-0 text-zinc-500 hover:text-zinc-500 data-[state=open]:text-black',
            isActive && 'text-black'
          )}
        >
          <HeadingIcon className="h-4 w-4" />
          <ChevronUpIcon className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="flex flex-col gap-0.5">
        <DropdownMenuItem
          onClick={() => onSelect(1)}
          className={cn(currentLevel === 1 && 'bg-zinc-100')}
        >
          <Heading1Icon className="h-4 w-4" />
          <span>Heading 1</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelect(2)}
          className={cn(currentLevel === 2 && 'bg-zinc-100')}
        >
          <Heading2Icon className="h-4 w-4" />
          <span>Heading 2</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelect(3)}
          className={cn(currentLevel === 3 && 'bg-zinc-100')}
        >
          <Heading3Icon className="h-4 w-4" />
          <span>Heading 3</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
