import { LayersIcon, Loader2Icon } from 'lucide-react';
import { Button } from './ui/button';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  ScrollableDialogContent,
} from './ui/dialog';
import { Input } from './ui/input';
import { Text } from './ui/text';
import { useQuery } from '@tanstack/react-query';
import { listNotesOptions } from '~/queries/notes';
import type { JSONContent } from '@tiptap/react';
import { DateTime } from 'luxon';
import { useCallback, useMemo, useState } from 'react';
import type { Note } from '@sticky/models';

export type BrowseDialogProps = {
  onNoteClick?: (note: Note) => void;
  onOpenChange?: (open: boolean) => void;
};

export function BrowseDialog(props: BrowseDialogProps) {
  const { onNoteClick, onOpenChange } = props;

  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const { data: notes, isLoading: isLoadingNotes } = useQuery({
    ...listNotesOptions(),
    select: (data) => {
      return data.map((note) => {
        const doc = JSON.parse(note.content) as JSONContent;
        const title = getTitle(doc) || 'Untitled';
        return { ...note, title };
      });
    },
  });

  const filteredNotes = useMemo(() => {
    return notes
      ?.filter((note) => {
        return note.title.toLowerCase().includes(search?.toLowerCase());
      })
      .slice(0, 5);
  }, [notes, search]);

  const handleOnOpenChange = useCallback(async (open: boolean) => {
    setSearch('');
    setIsOpen(open);
    onOpenChange?.(open);
  }, []);

  const handleNoteClick = useCallback((note: Note) => {
    onNoteClick?.(note);
  }, []);

  return (
    <Dialog open={isOpen} onOpenChange={handleOnOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 text-zinc-300 transition-colors duration-150 hover:text-zinc-600"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <LayersIcon className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <ScrollableDialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
        }}
        showCloseButton={false}
        overlayClassName="px-5 bg-white/40 pt-14 overflow-y-hidden"
        className="flex h-fit w-full flex-col gap-0 overflow-y-hidden rounded-lg border border-zinc-200 p-0 shadow-2xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Browse Notes</DialogTitle>
          <DialogDescription>
            Browse your notes and find the one you need.
          </DialogDescription>
        </DialogHeader>

        <div className="flex h-fit items-center border-b border-zinc-200">
          <Input
            type="text"
            placeholder="Search notes..."
            className="py-4.5 border-none p-4 text-sm placeholder:text-zinc-400 focus-visible:ring-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            inputMode="search"
          />
        </div>

        <div className="flex grow flex-col pb-2 pt-3">
          <div className="flex items-center justify-between gap-2 px-4 pb-2 text-zinc-400">
            <Text size="2">Notes</Text>
            <Text size="2">{notes?.length} Notes</Text>
          </div>

          <div>
            {isLoadingNotes && (
              <div className="flex items-center justify-center p-4">
                <Loader2Icon className="h-4 w-4 animate-spin" />
              </div>
            )}

            {!isLoadingNotes && (
              <div className="flex flex-col px-2">
                {filteredNotes?.map((note) => {
                  const doc = JSON.parse(note.content) as JSONContent;
                  const title = getTitle(doc) || 'Untitled';

                  const relativeTime = DateTime.fromISO(
                    note.updatedAt
                  ).toRelative();

                  return (
                    <button
                      key={note.id}
                      className="flex w-full items-center justify-between gap-2 rounded-md p-2 text-left text-zinc-600 transition-colors duration-150 hover:bg-zinc-100 hover:text-zinc-900"
                      onClick={() => {
                        handleNoteClick(note);
                        setIsOpen(false);
                      }}
                    >
                      <div className="flex flex-col gap-1">
                        <Text size="2" className="w-full truncate font-medium">
                          {title}
                        </Text>
                        <Text className="text-[13px] text-zinc-400">
                          Updated {relativeTime}
                        </Text>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </ScrollableDialogContent>
    </Dialog>
  );
}

function getTitle(content: JSONContent) {
  let title = '';
  const children = content.content ?? [];
  for (const node of children) {
    if (node.type === 'text') {
      title = node.text ?? '';
      break;
    }

    if (node.content) {
      title = getTitle(node);
      break;
    }
  }

  return title;
}
