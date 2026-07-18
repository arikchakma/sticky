import { Autocomplete } from '@base-ui/react/autocomplete';
import type { Note } from '@sticky/models';
import { Trash2Icon } from 'lucide-react';
import { getRelativeTime } from '~/lib/date';
import { Button } from './ui/button';
import { Text } from './ui/text';

export type SearchNote = Note & { title: string };

export type SearchNoteItemProps = {
  note: SearchNote;
  isActive: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
};

export function SearchNoteItem(props: SearchNoteItemProps) {
  const { note, isActive, isDeleting, onSelect, onDelete } = props;

  return (
    <Autocomplete.Item
      value={note}
      onClick={onSelect}
      className="group relative flex w-full items-center justify-between gap-2 rounded-md p-2 text-left text-zinc-600 data-[highlighted]:bg-zinc-100 data-[highlighted]:text-zinc-900"
    >
      <div className="flex flex-col gap-1">
        <Text size="2" className="w-full truncate font-medium">
          {note.title}
        </Text>

        <div className="flex items-center gap-2">
          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-red-500" />}

          <Text className="text-[13px] text-zinc-400">
            Updated {getRelativeTime(note.updatedAt)}
          </Text>
        </div>
      </div>

      <div className="absolute bottom-0 right-2 top-0 hidden items-center justify-center group-data-[highlighted]:flex">
        <Button
          size="icon"
          variant="ghost"
          className="size-6 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-50"
          disabled={isDeleting}
          // A native confirm dialog would blur the panel and hide it
          // mid-prompt, so deletes apply immediately.
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onDelete();
          }}
        >
          <Trash2Icon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </Autocomplete.Item>
  );
}
