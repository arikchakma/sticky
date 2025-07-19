import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { queryClient } from '~/lib/query-client';

export const Route = createRootRoute({
  component: () => (
    <>
      <QueryClientProvider client={queryClient}>
        <Outlet />
        <Toaster position="bottom-center" richColors />
      </QueryClientProvider>
    </>
  ),
});
