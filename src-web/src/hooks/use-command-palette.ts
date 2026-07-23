import { useHotkey } from '@tanstack/react-hotkeys';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef } from 'react';
import type { CommandContext } from '~/lib/commands';

type CommandActions = Record<string, () => void | Promise<void>>;

export function useCommandPalette(
  getContext: () => CommandContext,
  actions: CommandActions
) {
  useHotkey('Mod+K', () => {
    const context = getContext();
    invoke('cmd_open_command_window', {
      noteId: context.noteId ?? null,
      autoSize: context.autoSize,
    });
  });

  useHotkey('Mod+N', () => {
    actions['new-note']?.();
  });

  useHotkey('Mod+Shift+N', () => {
    actions['new-note-here']?.();
  });

  useHotkey('Mod+P', () => {
    actions['browse-notes']?.();
  });

  // The listener is registered once; the ref keeps it pointed at the
  // latest handlers without re-subscribing on every render.
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => {
    const unlisten = getCurrentWindow().listen<string>(
      'command:action',
      (event) => {
        actionsRef.current[event.payload]?.();
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
