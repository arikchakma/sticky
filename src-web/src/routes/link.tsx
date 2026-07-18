import { createFileRoute } from '@tanstack/react-router';
import { emitTo } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { ArrowRightIcon, XIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '~/components/ui/button';
import { Input } from '~/components/ui/input';

type SearchParams = {
  parent: string;
  url?: string;
};

export const Route = createFileRoute('/link')({
  component: LinkPage,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    parent: typeof search.parent === 'string' ? search.parent : '',
    url: typeof search.url === 'string' ? search.url : undefined,
  }),
});

function LinkPage() {
  const { parent, url: initialUrl } = Route.useSearch();

  const [value, setValue] = useState(initialUrl ?? '');
  // The panel outlives its uses, so the link under the cursor follows
  // the `link:reset` event sent on every reopen. It decides between the
  // submit arrow and the remove button.
  const [currentUrl, setCurrentUrl] = useState(initialUrl ?? '');

  const inputRef = useRef<HTMLInputElement>(null);
  const isShownRef = useRef(false);

  // Closing is unified with focus: giving the parent window focus back
  // makes the panel lose it, and the native side hides it on blur.
  const dismiss = useCallback(async () => {
    const parentWindow = await WebviewWindow.getByLabel(parent);
    if (parentWindow) {
      await parentWindow.setFocus();
    } else {
      await getCurrentWindow().close();
    }
  }, [parent]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!value) {
      return;
    }

    await emitTo(parent, 'link:set', value);
    await dismiss();
  };

  const handleRemove = async () => {
    await emitTo(parent, 'link:remove', null);
    await dismiss();
  };

  // The native side re-presents the hidden panel and sends this event
  // with the link under the cursor, if any.
  useEffect(() => {
    const unlisten = getCurrentWindow().listen<string | null>(
      'link:reset',
      (event) => {
        setValue(event.payload ?? '');
        setCurrentUrl(event.payload ?? '');
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dismiss]);

  // The panel is created invisible and revealed here, already anchored.
  useLayoutEffect(() => {
    if (isShownRef.current) {
      return;
    }

    isShownRef.current = true;
    const reveal = async () => {
      const currentWindow = getCurrentWindow();
      await currentWindow.show();
      await currentWindow.setFocus();
      // The autofocus attribute fired while the window was still
      // hidden, which WebKit ignores; focus for real now.
      inputRef.current?.focus();
      inputRef.current?.select();
    };

    reveal();
  }, []);

  return (
    <main className="h-screen bg-white caret-red-500">
      <form className="relative h-full" onSubmit={handleSubmit}>
        <Input
          type="url"
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          className="h-full rounded-none border-none pl-4 pr-9 shadow-none focus-visible:ring-0"
          placeholder="https://arikko.dev"
        />
        <div className="absolute bottom-0 right-1 top-0 flex items-center">
          {currentUrl && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-500 hover:text-black"
              onClick={handleRemove}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          )}

          {!currentUrl && (
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              className="size-7 text-zinc-500 hover:text-black"
            >
              <ArrowRightIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </form>
    </main>
  );
}
