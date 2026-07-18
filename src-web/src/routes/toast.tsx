import { createFileRoute } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Text } from '~/components/ui/text';

const MAX_TOAST_WIDTH = 360;
const TOAST_PADDING_X = 15;

type SearchParams = {
  parent: string;
  message?: string;
};

export const Route = createFileRoute('/toast')({
  component: ToastPage,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    parent: typeof search.parent === 'string' ? search.parent : '',
    message: typeof search.message === 'string' ? search.message : undefined,
  }),
});

function ToastPage() {
  const { parent, message: initialMessage } = Route.useSearch();

  // The count makes repeats of the same message re-present the toast,
  // extending its lifetime.
  const [toast, setToast] = useState({
    message: initialMessage ?? '',
    count: 0,
  });

  const textRef = useRef<HTMLSpanElement>(null);

  // The panel outlives its uses; every later toast arrives as an event.
  useEffect(() => {
    const unlisten = getCurrentWindow().listen<string>(
      'toast:show',
      (event) => {
        setToast((toast) => ({
          message: event.payload,
          count: toast.count + 1,
        }));
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Size the window to fit the message, then let the native side anchor
  // it over the parent, reveal it, and hide it again after a delay.
  useLayoutEffect(() => {
    const text = textRef.current;
    if (!toast.message || !text) {
      return;
    }

    const width = Math.min(
      Math.ceil(text.getBoundingClientRect().width) + TOAST_PADDING_X * 2,
      MAX_TOAST_WIDTH
    );

    const fitAndPresent = async () => {
      await getCurrentWindow().setSize(
        new LogicalSize(width, window.innerHeight)
      );
      await invoke('cmd_present_toast', { parent });
    };

    fitAndPresent();
  }, [toast, parent]);

  return (
    <main className="flex h-screen items-center justify-center overflow-hidden bg-zinc-800">
      <span ref={textRef} className="whitespace-nowrap">
        <Text size="2" className="text-zinc-300">
          {toast.message}
        </Text>
      </span>
    </main>
  );
}
