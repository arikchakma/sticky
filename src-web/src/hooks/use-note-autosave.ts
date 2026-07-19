import { useMutation, useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Editor } from '@tiptap/react';
import { useCallback, type RefObject } from 'react';
import { useInterval } from '~/hooks/use-interval';
import { listNotesOptions } from '~/queries/notes';

export function useNoteAutosave(
  editor: Editor,
  noteId: string | undefined,
  isDirtyRef: RefObject<boolean>
) {
  const queryClient = useQueryClient();
  const { mutate, mutateAsync, isPending } = useMutation({
    mutationFn: (content: string) => {
      if (!noteId) {
        return Promise.resolve();
      }

      return invoke('cmd_upsert_note', {
        note: {
          id: noteId,
          content,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(listNotesOptions());
    },
  });

  useInterval(() => {
    if (!isDirtyRef.current || isPending) {
      return;
    }

    // The flag clears at snapshot time, not when the save settles:
    // edits landing while the save is in flight re-mark it and the
    // next tick picks them up. Clearing afterwards swallowed those
    // edits — and the `notes:changed` reload then reverted the
    // "clean" editor to the stale disk content.
    isDirtyRef.current = false;
    mutate(editor.getMarkdown(), {
      onError: () => {
        isDirtyRef.current = true;
      },
    });
  }, 250);

  const flush = useCallback(async () => {
    if (!isDirtyRef.current) {
      return;
    }

    isDirtyRef.current = false;
    await mutateAsync(editor.getMarkdown()).catch(() => {
      isDirtyRef.current = true;
    });
  }, [editor, mutateAsync, isDirtyRef]);

  return { flush };
}
