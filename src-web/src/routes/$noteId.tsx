import { createFileRoute } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import { SkeletonEditor } from '~/components/skeleton-editor';
import type { Note } from '@sticky/models';

export const Route = createFileRoute('/$noteId')({
  component: RouteComponent,
  loader: async ({ params }) => {
    const note = await invoke<Note>('cmd_get_note', {
      id: params.noteId,
    });

    return { note };
  },
});

function RouteComponent() {
  const { noteId } = Route.useParams();
  const { note } = Route.useLoaderData();

  return <SkeletonEditor noteId={noteId} content={JSON.parse(note.content)} />;
}
