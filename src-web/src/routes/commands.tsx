import { Autocomplete } from '@base-ui/react/autocomplete';
import { COMMAND_WINDOW_HEIGHT } from '@sticky/models';
import { useHotkey } from '@tanstack/react-hotkeys';
import { createFileRoute } from '@tanstack/react-router';
import { emitTo } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { SearchXIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Input } from '~/components/ui/input';
import { Text } from '~/components/ui/text';
import {
  commandLabel,
  filterCommandGroups,
  type Command,
  type CommandContext,
  type CommandGroup,
} from '~/lib/commands';

// A group shaped for Base UI, which recognizes grouped items by an
// `items` key on each entry.
type CommandGroupItems = CommandGroup & { items: Command[] };

type SearchParams = CommandContext & {
  parent: string;
  // The panel was built ahead of its first use; the native side
  // reveals it when it is first presented.
  prewarm?: boolean;
};

export const Route = createFileRoute('/commands')({
  component: CommandsPage,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    parent: typeof search.parent === 'string' ? search.parent : '',
    noteId: typeof search.noteId === 'string' ? search.noteId : undefined,
    autoSize: search.autoSize !== false && search.autoSize !== 'false',
    prewarm: search.prewarm === true,
  }),
});

function CommandsPage() {
  const { parent, noteId, autoSize, prewarm } = Route.useSearch();

  const [search, setSearch] = useState('');
  // The panel outlives its parent's navigations and state changes, so
  // the context follows the `command:reset` event sent on every reopen.
  const [context, setContext] = useState<CommandContext>({
    noteId,
    autoSize,
  });

  const commandGroups = useMemo<CommandGroupItems[]>(() => {
    return filterCommandGroups(context, search).map((group) => ({
      ...group,
      items: group.children,
    }));
  }, [context, search]);

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

  const runCommand = useCallback(
    async (command: Command) => {
      // Dismiss first: the parent needs focus back before it acts.
      await dismiss();
      await emitTo(parent, 'command:action', command.id);
    },
    [parent, dismiss]
  );

  const inputRef = useRef<HTMLInputElement>(null);
  const inputRowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isShownRef = useRef(false);

  // Sent by the native side when it re-presents the hidden panel.
  useEffect(() => {
    const unlisten = getCurrentWindow().listen<CommandContext>(
      'command:reset',
      (event) => {
        setSearch('');
        setContext(event.payload);
        inputRef.current?.focus();
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useHotkey('Escape', dismiss);
  useHotkey('Mod+K', dismiss);

  // The window shrinks to fit the list, capped at COMMAND_WINDOW_HEIGHT.
  // Resizing keeps the top-left corner, so the panel stays anchored to
  // its parent. It is created invisible and shown here on first
  // measure, already at the right size — unless it was pre-warmed,
  // where revealing is left to the native side.
  useLayoutEffect(() => {
    const inputRow = inputRowRef.current;
    const content = contentRef.current;
    if (!inputRow || !content) {
      return;
    }

    const contentHeight = Math.ceil(
      inputRow.getBoundingClientRect().height +
        content.getBoundingClientRect().height
    );
    const height = Math.min(contentHeight, COMMAND_WINDOW_HEIGHT);

    const fitAndReveal = async () => {
      const currentWindow = getCurrentWindow();
      await currentWindow.setSize(new LogicalSize(window.innerWidth, height));

      if (isShownRef.current || prewarm) {
        return;
      }

      isShownRef.current = true;
      await currentWindow.show();
      await currentWindow.setFocus();
      // The autofocus attribute fired while the window was still
      // hidden, which WebKit ignores; focus for real now.
      inputRef.current?.focus();
    };

    fitAndReveal();
  }, [commandGroups]);

  // Workaround for https://github.com/mui/base-ui/issues/4002: WebKit
  // synthesizes mousemove events when the list scrolls under a
  // stationary cursor, which steals the highlight from keyboard
  // navigation. Swallow mousemoves whose coordinates haven't changed
  // before they reach the items' hover handlers. Remove once fixed
  // upstream.
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const swallowSyntheticMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const last = lastPointerRef.current;
    lastPointerRef.current = { x: e.clientX, y: e.clientY };
    if (last && last.x === e.clientX && last.y === e.clientY) {
      e.stopPropagation();
    }
  };

  const isFilteredCommandsEmpty = commandGroups.length === 0;

  return (
    <main className="bg-background flex h-screen flex-col">
      <Autocomplete.Root
        open
        inline
        mode="none"
        filter={null}
        items={commandGroups}
        autoHighlight="always"
        keepHighlight
        value={search}
        onValueChange={(value) => setSearch(value)}
      >
        <div
          ref={inputRowRef}
          className="border-border flex shrink-0 items-center border-b"
        >
          <Autocomplete.Input
            render={
              <Input
                ref={inputRef}
                placeholder="Search for actions..."
                className="h-11 rounded-none border-none p-4 text-sm focus:border-none"
                spellCheck={false}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                autoFocus
              />
            }
          />
        </div>

        <div
          className="grow scroll-py-2 overflow-y-auto"
          // Keep the input focused, so keyboard navigation stays alive
          // after clicking inside the list.
          onMouseDown={(e) => e.preventDefault()}
          onMouseMoveCapture={swallowSyntheticMouseMove}
        >
          <div ref={contentRef}>
            {isFilteredCommandsEmpty && (
              <div className="flex flex-col items-center justify-center gap-2 p-4 py-8">
                <SearchXIcon className="text-faint h-10 w-10" />
                <Text size="3" className="text-muted-foreground">
                  No actions found
                </Text>
              </div>
            )}

            {!isFilteredCommandsEmpty && (
              <Autocomplete.List className="flex flex-col p-2">
                {(group: CommandGroupItems) => (
                  <Autocomplete.Group
                    key={group.id}
                    items={group.items}
                    className="border-muted flex flex-col border-t pb-1 pt-1 first:border-t-0 first:pt-0 last:pb-0"
                  >
                    <Autocomplete.GroupLabel className="px-2 pb-1 pt-1.5">
                      <Text size="1" className="text-muted-foreground">
                        {group.title}
                      </Text>
                    </Autocomplete.GroupLabel>

                    <Autocomplete.Collection>
                      {(command: Command) => (
                        <CommandItem
                          key={command.id}
                          command={command}
                          context={context}
                          onSelect={() => runCommand(command)}
                        />
                      )}
                    </Autocomplete.Collection>
                  </Autocomplete.Group>
                )}
              </Autocomplete.List>
            )}
          </div>
        </div>
      </Autocomplete.Root>
    </main>
  );
}

type CommandItemProps = {
  command: Command;
  context: CommandContext;
  onSelect: () => void;
};

function CommandItem(props: CommandItemProps) {
  const { command, context, onSelect } = props;

  return (
    <Autocomplete.Item
      value={command}
      onClick={onSelect}
      className="text-muted-foreground data-[highlighted]:bg-muted data-[highlighted]:text-foreground flex w-full items-center gap-2.5 rounded-md p-2 text-left"
    >
      <command.icon className="text-muted-foreground h-4 w-4 shrink-0" />

      <Text size="2" className="w-full truncate font-medium">
        {commandLabel(command, context)}
      </Text>

      {command.shortcut && (
        <div className="flex shrink-0 items-center gap-1">
          {command.shortcut.map((key) => (
            <kbd
              key={key}
              className="border-border bg-muted text-muted-foreground flex h-5 min-w-5 items-center justify-center rounded border px-1 font-sans text-xs"
            >
              {key}
            </kbd>
          ))}
        </div>
      )}
    </Autocomplete.Item>
  );
}
