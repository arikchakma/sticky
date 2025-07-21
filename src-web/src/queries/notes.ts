import { queryOptions } from '@tanstack/react-query';
import { invoke } from '@tauri-apps/api/core';
import type { Note } from '@sticky/models';

export function listNotesOptions() {
  return queryOptions({
    queryKey: ['notes'],
    queryFn: () => {
      return invoke<Note[]>('cmd_list_notes', {});
    },
  });
}
