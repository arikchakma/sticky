import type { Note } from '@sticky/models';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import { SkeletonEditor } from '~/components/skeleton-editor';

export const Route = createFileRoute('/')({
  component: IndexPage,
  beforeLoad: async () => {
    const notes = await invoke<Note[]>('cmd_list_notes');
    if (!notes) {
      return;
    }

    const firstNote = notes?.[0];
    if (!firstNote) {
      return redirect({
        to: '/new',
      });
    }

    return redirect({
      to: '/$noteId',
      params: {
        noteId: firstNote.id,
      },
    });
  },
});

function IndexPage() {
  return <SkeletonEditor />;
}
