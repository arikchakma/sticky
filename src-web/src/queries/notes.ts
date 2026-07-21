import type { Note, NoteSearchHit } from '@sticky/models';
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';

export function listNotesOptions() {
  return queryOptions({
    queryKey: ['notes'],
    queryFn: () => {
      return invoke<Note[]>('cmd_list_notes', {});
    },
  });
}

// The key starts with 'notes' so the existing list invalidations
// (saves, deletes, external file edits) refresh search results too.
export function searchNotesOptions(query: string) {
  return queryOptions({
    queryKey: ['notes', 'search', query],
    queryFn: () => {
      return invoke<NoteSearchHit[]>('cmd_search_notes', { query });
    },
    // Typing shows the previous results until the new ones land,
    // instead of flashing an empty list on every keystroke.
    placeholderData: keepPreviousData,
  });
}
