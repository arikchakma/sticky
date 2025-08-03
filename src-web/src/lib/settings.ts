import { invoke } from '@tauri-apps/api/core';
import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event';

export const SHOW_COUNT_KEY = 'showWordCount';
export const SHOW_COUNT_EVENT = 'settings:showWordCount';

export async function getShowWordCount(): Promise<boolean> {
  const value = await invoke<string | null>('cmd_get_setting', {
    key: SHOW_COUNT_KEY,
  }).catch(() => null);
  return value !== 'false';
}

export async function setShowWordCount(value: boolean): Promise<void> {
  await invoke('cmd_set_setting', {
    key: SHOW_COUNT_KEY,
    value: String(value),
  });
  await emit(SHOW_COUNT_EVENT, { value });
}

export function listenShowWordCount(
  callback: (value: boolean) => void
): Promise<UnlistenFn> {
  return listen<{ value: boolean }>(SHOW_COUNT_EVENT, (e) =>
    callback(e.payload.value)
  );
}
