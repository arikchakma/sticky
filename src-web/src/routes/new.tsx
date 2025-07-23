import { createFileRoute, redirect } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import { SkeletonEditor } from '~/components/skeleton-editor';
import defaultNoteContent from '~/lib/default-note-content.json';
import type { Note } from '@sticky/models';

export const Route = createFileRoute('/new')({
  component: RouteComponent,
  beforeLoad: async () => {
    const note = await invoke<Note>('cmd_upsert_note', {
      note: {
        model: 'note',
        content: JSON.stringify(defaultNoteContent),
      },
    });

    if (!note) {
      return;
    }

    return redirect({
      to: '/$noteId',
      params: {
        noteId: note.id,
      },
    });
  },
});

function RouteComponent() {
  return <SkeletonEditor />;
}
