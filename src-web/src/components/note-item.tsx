import type { Note } from '@sticky/models';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '~/lib/classname';
import { getRelativeTime } from '~/lib/date';
import { listNotesOptions } from '~/queries/notes';
import { Button } from './ui/button';
import { Text } from './ui/text';

export type NoteItemProps = {
  currentNoteId?: string;

  note: Note & { title: string };
  isFocused: boolean;
  isActive: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  onDelete: () => void;
};

export function NoteItem(props: NoteItemProps) {
  const {
    note,
    isFocused,
    isActive,
    onClick,
    onMouseEnter,
    currentNoteId,
    onDelete,
  } = props;

  const relativeTime = getRelativeTime(note.updatedAt);

  const queryClient = useQueryClient();

  const { mutate: deleteNote, isPending: isDeleting } = useMutation({
    mutationFn: (noteId: string) => {
      return invoke('cmd_delete_note', {
        noteId,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries(listNotesOptions());
    },
    onMutate: async (noteId) => {
      const queryKey = listNotesOptions().queryKey;
      await queryClient.cancelQueries({ queryKey });

      const previousNotes = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: Note[] | undefined) => {
        return old?.filter((note) => note.id !== noteId);
      });

      const isCurrentNote = noteId === currentNoteId;
      if (isCurrentNote) {
        onDelete?.();
      }

      return { previousNotes };
    },
    onError: (err, _, context) => {
      queryClient.setQueryData(
        listNotesOptions().queryKey,
        context?.previousNotes
      );

      toast.error(err?.message || 'Failed to delete note');
    },
  });

  return (
    <div
      className="group/button relative"
      key={note.id}
      onMouseEnter={onMouseEnter}
    >
      <button
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-md p-2 text-left text-zinc-600',
          isFocused && 'bg-zinc-100 text-zinc-900'
        )}
        onClick={onClick}
      >
        <div className="flex flex-col gap-1">
          <Text size="2" className="w-full truncate font-medium">
            {note.title}
          </Text>

          <div className="flex items-center gap-2">
            {isActive && (
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            )}

            <Text className="text-[13px] text-zinc-400">
              Updated {relativeTime}
            </Text>
          </div>
        </div>
      </button>

      <div
        className="absolute bottom-0 right-2 top-0 hidden items-center justify-center data-[focused=true]:flex"
        data-focused={isFocused}
      >
        <Button
          size="icon"
          variant="ghost"
          className="size-6 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-900 disabled:opacity-50"
          disabled={isDeleting}
          onClick={async (e) => {
            e.stopPropagation();
            e.preventDefault();
            const confirmed = await confirm(
              'Are you sure you want to delete this note?',
              {
                title: 'Delete Note',
                kind: 'warning',
              }
            );
            if (!confirmed) {
              return;
            }

            deleteNote(note.id);
          }}
        >
          <Trash2Icon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
