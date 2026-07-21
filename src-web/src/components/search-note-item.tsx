import { Autocomplete } from '@base-ui/react/autocomplete';
import type { NoteSearchHit } from '@sticky/models';
import { Trash2Icon } from 'lucide-react';
import { getRelativeTime } from '~/lib/date';
import { escapeRegExp } from '~/lib/string';
import { Button } from './ui/button';
import { Text } from './ui/text';

export type SearchNoteItemProps = {
  hit: NoteSearchHit;
  // The whitespace-separated query terms, for highlighting.
  terms: string[];
  isActive: boolean;
  isDeleting: boolean;
  onSelect: () => void;
  onDelete: () => void;
};

// Wraps every occurrence of the query terms in a highlight.
function Highlighted(props: { text: string; terms: string[] }) {
  const { text, terms } = props;
  if (terms.length === 0) {
    return text;
  }

  // A capture group makes split() keep the matches at odd indices.
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join('|')})`, 'gi');

  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="text-accent bg-transparent font-semibold">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function SearchNoteItem(props: SearchNoteItemProps) {
  const { hit, terms, isActive, isDeleting, onSelect, onDelete } = props;

  return (
    <Autocomplete.Item
      value={hit}
      onClick={onSelect}
      className="text-muted-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground group relative flex w-full items-center justify-between gap-2 rounded-md p-2 text-left"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <Text size="2" className="w-full truncate font-medium">
          <Highlighted text={hit.title} terms={terms} />
        </Text>

        {hit.snippet && (
          <Text className="text-faint w-full truncate text-[13px]">
            <Highlighted text={hit.snippet} terms={terms} />
          </Text>
        )}

        <div className="flex items-center gap-2">
          {isActive && <span className="bg-accent h-1.5 w-1.5 rounded-full" />}

          <Text className="text-faint text-[13px]">
            Updated {getRelativeTime(hit.note.updatedAt)}
          </Text>
        </div>
      </div>

      <div className="absolute bottom-0 right-2 top-0 hidden items-center justify-center group-data-[highlighted]:flex">
        <Button
          size="icon"
          variant="ghost"
          className="text-muted-foreground hover:bg-border hover:text-foreground size-6 disabled:opacity-50"
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
