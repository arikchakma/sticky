import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { useWindowHover } from '~/hooks/use-window-hover';
import { queryClient } from '~/lib/query-client';

function RootComponent() {
  useWindowHover();

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}

export const Route = createRootRoute({
  component: RootComponent,
});
