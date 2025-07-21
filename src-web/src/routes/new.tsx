import { createFileRoute } from '@tanstack/react-router';
import { SkeletonEditor } from '~/components/skeleton-editor';

export const Route = createFileRoute('/new')({
  component: RouteComponent,
});

function RouteComponent() {
  return <SkeletonEditor />;
}
