import { MIN_WINDOW_HEIGHT, MIN_WINDOW_WIDTH, type Note } from '@sticky/models';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Editor } from '@tiptap/react';
import { useCallback, useEffect, type RefObject } from 'react';
import { useCommandPalette } from '~/hooks/use-command-palette';
import { listNotesOptions } from '~/queries/notes';

type NoteActionsOptions = {
  editor: Editor;
  noteId: string | undefined;
  isDirtyRef: RefObject<boolean>;
  flush: () => Promise<void>;
  fitWindow: () => Promise<unknown>;
  toggleAutoSize: () => void;
  isAutoSizing: () => boolean;
  openFind: () => void;
};

export function useNoteActions(options: NoteActionsOptions) {
  const {
    editor,
    noteId,
    isDirtyRef,
    flush,
    fitWindow,
    toggleAutoSize,
    isAutoSizing,
    openFind,
  } = options;

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const openNewNote = useCallback(async (content: string) => {
    const newNote = await invoke<Note>('cmd_upsert_note', {
      note: {
        model: 'note',
        content,
      },
    });

    queryClient.invalidateQueries(listNotesOptions());
    await invoke('cmd_new_main_window', {
      url: `/${newNote.id}`,
      size: [MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT],
    });
  }, []);

  const createNote = useCallback(async () => {
    if (editor.isEmpty) {
      await invoke('cmd_show_toast', {
        message: 'You already have an empty note',
      });
      return;
    }

    await openNewNote('');
  }, [editor, openNewNote]);

  const browseNotes = useCallback(async () => {
    await invoke('cmd_open_search_window', {
      activeNoteId: noteId,
    });
  }, [noteId]);

  const copyToClipboard = useCallback(
    async (text: () => string | Promise<string>, message: string) => {
      try {
        await navigator.clipboard.writeText(await text());
        await invoke('cmd_show_toast', { message });
      } catch {
        await invoke('cmd_show_toast', { message: 'Failed to copy' });
      }
    },
    []
  );

  const deleteNote = useCallback(async () => {
    if (!noteId) {
      return;
    }

    // A pending autosave tick firing after the delete would write the
    // file right back; drop the dirty flag first.
    isDirtyRef.current = false;
    await invoke('cmd_delete_note', { noteId });
    navigate({ to: '/new', replace: true });
  }, [noteId, navigate, isDirtyRef]);

  useCommandPalette(
    () => ({
      noteId,
      autoSize: isAutoSizing(),
    }),
    {
      'new-note': createNote,
      'duplicate-note': () => openNewNote(editor.getMarkdown()),
      'browse-notes': browseNotes,
      'find-in-note': openFind,
      'fit-window': () => {
        fitWindow();
      },
      'toggle-auto-size': toggleAutoSize,
      'copy-markdown': () =>
        copyToClipboard(() => editor.getMarkdown(), 'Copied as Markdown'),
      'copy-path': () => {
        if (noteId) {
          copyToClipboard(
            () => invoke<string>('cmd_note_path', { noteId }),
            'Copied file path'
          );
        }
      },
      'reveal-note': () => {
        if (noteId) {
          invoke('cmd_reveal_note', { noteId });
        }
      },
      'open-notes-folder': () => invoke('cmd_open_notes_dir'),
      'delete-note': deleteNote,
    }
  );

  useEffect(() => {
    const currentWindow = getCurrentWindow();

    const unlistenSelected = currentWindow.listen<string>(
      'search:note-selected',
      async (event) => {
        // Unsaved edits must reach disk before the route swaps the
        // editor out, or they die with it.
        await flush();

        navigate({
          to: '/$noteId',
          params: {
            noteId: event.payload,
          },
        });
      }
    );

    const unlistenDeleted = currentWindow.listen(
      'search:active-note-deleted',
      () => {
        navigate({ to: '/new', replace: true });
      }
    );

    return () => {
      unlistenSelected.then((fn) => fn());
      unlistenDeleted.then((fn) => fn());
    };
  }, [navigate, flush]);

  return { createNote, browseNotes };
}
