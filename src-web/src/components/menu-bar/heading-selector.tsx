import {
  ChevronUpIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  HeadingIcon,
} from 'lucide-react';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { cn } from '~/utils/classname';

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
            'h-7 text-zinc-500 gap-0 data-[state=open]:text-black hover:text-zinc-500',
            isActive && 'text-black'
          )}
        >
          <HeadingIcon className="w-4 h-4" />
          <ChevronUpIcon className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="gap-0.5 flex flex-col">
        <DropdownMenuItem
          onClick={() => onSelect(1)}
          className={cn(currentLevel === 1 && 'bg-zinc-100')}
        >
          <Heading1Icon className="w-4 h-4" />
          <span>Heading 1</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelect(2)}
          className={cn(currentLevel === 2 && 'bg-zinc-100')}
        >
          <Heading2Icon className="w-4 h-4" />
          <span>Heading 2</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => onSelect(3)}
          className={cn(currentLevel === 3 && 'bg-zinc-100')}
        >
          <Heading3Icon className="w-4 h-4" />
          <span>Heading 3</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
