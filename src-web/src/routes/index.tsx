import type { Note } from '@sticky/models';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import { SkeletonEditor } from '~/components/skeleton-editor';
import welcomeNoteContent from '~/lib/welcome-note-content.json';

export const Route = createFileRoute('/')({
  component: IndexPage,
  beforeLoad: async () => {
    const notes = await invoke<Note[]>('cmd_list_notes');
    if (!notes) {
      return;
    }

    const firstNote = notes?.[0];
    let noteId = firstNote?.id;
    if (!noteId) {
      const note = await invoke<Note>('cmd_upsert_note', {
        note: {
          model: 'note',
          content: JSON.stringify(welcomeNoteContent),
        },
      });

      if (!note) {
        return;
      }

      noteId = note.id;
    }

    return redirect({
      to: '/$noteId',
      params: {
        noteId,
      },
    });
  },
});

function IndexPage() {
  return <SkeletonEditor />;
}
