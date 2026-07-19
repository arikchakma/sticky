import type { Note } from '@sticky/models';
import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Editor } from '@tiptap/react';
import { useEffect, type RefObject } from 'react';
import { listNotesOptions } from '~/queries/notes';

export function useNoteSync(
  editor: Editor,
  noteId: string | undefined,
  isDirtyRef: RefObject<boolean>
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    const unlisten = listen<string | null>('notes:changed', async (event) => {
      queryClient.invalidateQueries(listNotesOptions());

      if (!editor || !noteId || isDirtyRef.current) {
        return;
      }

      if (event.payload && event.payload !== noteId) {
        return;
      }

      const note = await invoke<Note>('cmd_get_note', {
        id: noteId,
      }).catch(() => null);
      if (!note || isDirtyRef.current) {
        return;
      }

      if (note.content.trimEnd() !== editor.getMarkdown().trimEnd()) {
        // Not a user edit: reloading must not re-trigger the autosave.
        editor.commands.setContent(note.content, {
          contentType: 'markdown',
          emitUpdate: false,
        });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [editor, noteId, queryClient, isDirtyRef]);
}
