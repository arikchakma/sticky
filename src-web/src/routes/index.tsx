import { createFileRoute } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import { SkeletonEditor } from '~/components/skeleton-editor';

export const Route = createFileRoute('/')({
  component: IndexPage,
  beforeLoad: async (ctx) => {
    const notes = await invoke('cmd_list_notes');

    console.log(notes);
    console.log(ctx);
  },
});

function IndexPage() {
  return <SkeletonEditor />;
}
