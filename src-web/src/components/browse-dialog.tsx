import type { Note } from '@sticky/models';
import { useQuery } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { LayersIcon, Loader2Icon, StickyNoteIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getTitleFromContent } from '~/lib/content';
import { listNotesOptions } from '~/queries/notes';
import { NoteItem } from './note-item';
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

export type BrowseDialogProps = {
  activeNoteId?: string;
  onNoteClick?: (note: Note) => void;
  onOpenChange?: (open: boolean) => void;
  onNoteDelete?: () => void;
};

export function BrowseDialog(props: BrowseDialogProps) {
  const { activeNoteId, onNoteClick, onOpenChange, onNoteDelete } = props;

  const [search, setSearch] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(0);

  const { data: notes, isLoading: isLoadingNotes } = useQuery({
    ...listNotesOptions(),
    select: (data) => {
      return data
        .map((note) => {
          const doc = JSON.parse(note.content) as JSONContent;
          const title = getTitleFromContent(doc) || 'Untitled';
          return { ...note, title };
        })
        .sort((a, b) => {
          if (a.id === activeNoteId) {
            return -1;
          }

          if (b.id === activeNoteId) {
            return 1;
          }

          return 0;
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
    setFocusedIndex(0);
    setIsOpen(open);
    onOpenChange?.(open);
  }, []);

  const handleNoteClick = useCallback((note: Note) => {
    onNoteClick?.(note);
    setIsOpen(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const key = e.key;
      const allowedKeys = ['ArrowDown', 'ArrowUp', 'Enter'];
      if (!allowedKeys.includes(key)) {
        return;
      }

      e.preventDefault();

      const maxIndex = filteredNotes?.length ?? 0;
      if (key === 'ArrowDown') {
        setFocusedIndex((prev) => {
          return prev === maxIndex - 1 ? 0 : prev + 1;
        });
      } else if (key === 'ArrowUp') {
        setFocusedIndex((prev) => {
          return prev === 0 ? maxIndex - 1 : prev - 1;
        });
      } else if (key === 'Enter') {
        const note = filteredNotes?.[focusedIndex];
        if (!note) {
          return;
        }

        handleNoteClick(note);
        setIsOpen(false);
      }
    },
    [filteredNotes, focusedIndex, handleNoteClick, setIsOpen]
  );

  useEffect(() => {
    setFocusedIndex(0);
  }, [filteredNotes]);

  const isFilteredNotesEmpty = useMemo(() => {
    return filteredNotes?.length === 0;
  }, [filteredNotes]);

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
            className="py-4.5 h-10 border-none p-4 text-sm placeholder:text-zinc-400 focus-visible:ring-0"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            inputMode="search"
            onKeyDown={handleKeyDown}
          />
        </div>

        {isFilteredNotesEmpty && (
          <div className="flex flex-col items-center justify-center gap-2 p-4 py-8">
            <StickyNoteIcon className="h-10 w-10 text-zinc-300" />
            <Text size="3" className="text-zinc-400">
              No notes found
            </Text>
          </div>
        )}

        {!isFilteredNotesEmpty && (
          <div className="flex grow flex-col pb-2 pt-3">
            <div className="flex items-center justify-between gap-2 px-4 pb-2 text-zinc-400">
              <Text size="2">Notes</Text>
              <Text size="2">
                {notes?.length} Note
                {notes?.length && notes?.length > 1 ? 's' : ''}
              </Text>
            </div>

            <div>
              {isLoadingNotes && (
                <div className="flex items-center justify-center p-4">
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                </div>
              )}

              {!isLoadingNotes && (
                <div className="flex flex-col px-2">
                  {filteredNotes?.map((note, index) => {
                    const isActive = note.id === activeNoteId;
                    const isFocused = index === focusedIndex;

                    return (
                      <NoteItem
                        currentNoteId={activeNoteId}
                        key={note.id}
                        note={note}
                        isFocused={isFocused}
                        isActive={isActive}
                        onClick={() => handleNoteClick(note)}
                        onMouseEnter={() => setFocusedIndex(index)}
                        onDelete={() => {
                          setIsOpen(false);
                          onNoteDelete?.();
                        }}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </ScrollableDialogContent>
    </Dialog>
  );
}
