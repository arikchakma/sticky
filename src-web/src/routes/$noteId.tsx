import type { Note } from '@sticky/models';
import { createFileRoute } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import { SkeletonEditor } from '~/components/skeleton-editor';

export const Route = createFileRoute('/$noteId')({
  component: RouteComponent,
  gcTime: 0,
  staleTime: 0,
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

  return <SkeletonEditor key={noteId} noteId={noteId} content={note.content} />;
}
