import { QueryClientProvider } from '@tanstack/react-query';
import { Outlet, createRootRoute } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { CommandPalette } from '~/components/command-palette';
import { queryClient } from '~/lib/query-client';

export const Route = createRootRoute({
  component: () => (
    <>
      <QueryClientProvider client={queryClient}>
        <CommandPalette />
        <Outlet />
        <Toaster
          position="bottom-center"
          richColors
          className="flex w-full items-center justify-center rounded-lg bg-zinc-800 px-5 py-2 text-zinc-200 shadow-lg"
          offset={{
            top: 15,
          }}
          visibleToasts={1}
          toastOptions={{
            className: '!w-fit !bg-zinc-800 !text-zinc-300 !border-zinc-900',
            style: {
              width: 'fit-content',
              maxWidth: 'fit-content',
              padding: '8px 15px',
            },
          }}
        />
      </QueryClientProvider>
    </>
  ),
});
