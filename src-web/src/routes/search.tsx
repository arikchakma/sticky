import { Autocomplete } from '@base-ui/react/autocomplete';
import {
  SEARCH_WINDOW_HEIGHT,
  type Note,
  type NoteSearchHit,
} from '@sticky/models';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import { emitTo, listen } from '@tauri-apps/api/event';
import { WebviewWindow } from '@tauri-apps/api/webviewWindow';
import { getCurrentWindow, LogicalSize } from '@tauri-apps/api/window';
import { StickyNoteIcon } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { SearchNoteItem } from '~/components/search-note-item';
import { Input } from '~/components/ui/input';
import { Text } from '~/components/ui/text';
import { searchNotesOptions } from '~/queries/notes';

type SearchParams = {
  parent: string;
  noteId?: string;
  // The panel was built ahead of its first use; the native side
  // reveals it when it is first presented.
  prewarm?: boolean;
};

export const Route = createFileRoute('/search')({
  component: SearchPage,
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    parent: typeof search.parent === 'string' ? search.parent : '',
    noteId: typeof search.noteId === 'string' ? search.noteId : undefined,
    prewarm: search.prewarm === true,
  }),
});

function SearchPage() {
  const { parent, noteId: initialNoteId, prewarm } = Route.useSearch();

  const [search, setSearch] = useState('');
  // The panel outlives navigations in the parent window, so the active
  // note follows the `search:reset` event sent on every reopen.
  const [activeNoteId, setActiveNoteId] = useState(initialNoteId);

  const queryClient = useQueryClient();

  // Matching and ranking happen in the backend, over titles and note
  // bodies; an empty query lists every note, newest first.
  const { data: hits, isLoading: isLoadingNotes } = useQuery(
    searchNotesOptions(search)
  );

  const terms = useMemo(() => {
    return search.split(/\s+/).filter(Boolean);
  }, [search]);

  // Search results keep the backend's ranking; the plain list floats
  // the active note to the top.
  const orderedHits = useMemo(() => {
    if (!hits || terms.length > 0) {
      return hits;
    }

    return [...hits].sort((a, b) => {
      if (a.note.id === activeNoteId) {
        return -1;
      }

      if (b.note.id === activeNoteId) {
        return 1;
      }

      return 0;
    });
  }, [hits, terms, activeNoteId]);

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

  const selectNote = useCallback(
    async (note: Note) => {
      await emitTo(parent, 'search:note-selected', note.id);
      await dismiss();
    },
    [parent, dismiss]
  );

  const { mutate: deleteNote, isPending: isDeleting } = useMutation({
    mutationFn: (noteId: string) => {
      return invoke('cmd_delete_note', {
        noteId,
      });
    },
    onSettled: () => {
      // Prefix-matches every ['notes', ...] key, searches included.
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
    onMutate: async (noteId) => {
      const queryKey = searchNotesOptions(search).queryKey;
      await queryClient.cancelQueries({ queryKey });

      const previousHits = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old: NoteSearchHit[] | undefined) => {
        return old?.filter((hit) => hit.note.id !== noteId);
      });

      if (noteId === activeNoteId) {
        await emitTo(parent, 'search:active-note-deleted', null);
        await dismiss();
      }

      return { previousHits, queryKey };
    },
    onError: (err, _, context) => {
      if (context) {
        queryClient.setQueryData(context.queryKey, context.previousHits);
      }

      invoke('cmd_show_toast', {
        message: err?.message || 'Failed to delete note',
      });
    },
  });

  const inputRef = useRef<HTMLInputElement>(null);
  const inputRowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isShownRef = useRef(false);

  // The native side re-presents the hidden panel and sends this event;
  // start from a clean slate with a fresh notes list.
  useEffect(() => {
    const unlisten = getCurrentWindow().listen<string | null>(
      'search:reset',
      (event) => {
        setSearch('');
        setActiveNoteId(event.payload ?? undefined);
        queryClient.invalidateQueries({ queryKey: ['notes'] });
        inputRef.current?.focus();
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queryClient]);

  // Saves in other windows and external file edits both surface as
  // `notes:changed`; keep the list fresh while the panel is open.
  useEffect(() => {
    const unlisten = listen('notes:changed', () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [queryClient]);

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

  // The window shrinks to fit the list, capped at SEARCH_WINDOW_HEIGHT.
  // Resizing keeps the top-left corner, so the panel stays anchored to
  // its parent. It is created invisible and shown here on first
  // measure, already at the right size — unless it was pre-warmed,
  // where revealing is left to the native side.
  useLayoutEffect(() => {
    if (isLoadingNotes) {
      return;
    }

    const inputRow = inputRowRef.current;
    const content = contentRef.current;
    if (!inputRow || !content) {
      return;
    }

    const contentHeight = Math.ceil(
      inputRow.getBoundingClientRect().height +
        content.getBoundingClientRect().height
    );
    const height = Math.min(contentHeight, SEARCH_WINDOW_HEIGHT);

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
  }, [orderedHits, isLoadingNotes]);

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

  const isEmpty = orderedHits?.length === 0;
  const hitCount = orderedHits?.length ?? 0;

  return (
    <main className="bg-background flex h-screen flex-col">
      <Autocomplete.Root
        open
        inline
        mode="none"
        filter={null}
        items={orderedHits ?? []}
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
                placeholder="Search notes..."
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
          className="grow scroll-py-3 overflow-y-auto"
          // Keep the input focused, so keyboard navigation stays alive
          // after clicking inside the list.
          onMouseDown={(e) => e.preventDefault()}
          onMouseMoveCapture={swallowSyntheticMouseMove}
        >
          <div ref={contentRef}>
            {isEmpty && (
              <div className="flex flex-col items-center justify-center gap-2 p-4 py-8">
                <StickyNoteIcon className="text-faint h-10 w-10" />
                <Text size="3" className="text-muted-foreground">
                  No notes found
                </Text>
              </div>
            )}

            {!isEmpty && (
              <div className="flex flex-col pb-2 pt-3">
                <div className="text-muted-foreground flex shrink-0 items-center justify-between gap-2 px-4 pb-2">
                  <Text size="2">Notes</Text>
                  <Text size="2">
                    {hitCount} Note
                    {hitCount > 1 ? 's' : ''}
                  </Text>
                </div>

                <Autocomplete.List className="flex flex-col px-2">
                  {(hit: NoteSearchHit) => (
                    <SearchNoteItem
                      key={hit.note.id}
                      hit={hit}
                      terms={terms}
                      isActive={hit.note.id === activeNoteId}
                      isDeleting={isDeleting}
                      onSelect={() => selectNote(hit.note)}
                      onDelete={() => deleteNote(hit.note.id)}
                    />
                  )}
                </Autocomplete.List>
              </div>
            )}
          </div>
        </div>
      </Autocomplete.Root>
    </main>
  );
}
