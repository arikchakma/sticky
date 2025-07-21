import { createFileRoute } from '@tanstack/react-router';
import { SkeletonEditor } from '~/components/skeleton-editor';

export const Route = createFileRoute('/$noteId')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <SkeletonEditor
      content={{
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Hello, world!',
              },
            ],
          },
        ],
      }}
    />
  );
}
