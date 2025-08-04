import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isMacOS } from '~/lib/detect-browser';
import { getShowWordCount, setShowWordCount } from '~/lib/settings';

interface Shortcut {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
}

interface Command {
  label: string;
  action: () => void | Promise<void>;
  shortcut?: Shortcut;
}

interface CommandPaletteProps {
  onNewWindow: () => void | Promise<void>;
}

export function CommandPalette({ onNewWindow }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const isMac = useMemo(isMacOS, []);

  const formatShortcut = (s?: Shortcut): string | undefined => {
    if (!s) return;
    const parts: string[] = [];

    if (isMac) {
      if (s.meta) parts.push('⌘');
      if (s.ctrl) parts.push('⌃');
      if (s.shift) parts.push('⇧');
    } else {
      if (s.ctrl || s.meta) parts.push('Ctrl');
      if (s.shift) parts.push('Shift');
    }

    parts.push(s.key.toUpperCase());
    return isMac ? parts.join('') : parts.join('+');
  };

  const toggleWordCount = useCallback(async () => {
    const current = await getShowWordCount();
    await setShowWordCount(!current);
  }, []);

  const commands = useMemo<Command[]>(
    () => [
      {
        label: 'Create New Note',
        shortcut: { key: 'n', meta: true },
        action: onNewWindow,
      },
      {
        label: 'Toggle Word/Character Count',
        shortcut: { key: 'w', meta: true },
        action: toggleWordCount,
      },
    ],
    [onNewWindow, toggleWordCount]
  );

  const filtered = useMemo(
    () =>
      commands.filter((cmd) =>
        cmd.label.toLowerCase().includes(query.toLowerCase())
      ),
    [commands, query]
  );

  useEffect(() => {
    const matchShortcut = (e: KeyboardEvent, s: Shortcut) =>
      e.key.toLowerCase() === s.key.toLowerCase() &&
      (!s.meta || e.metaKey) &&
      (!s.ctrl || e.ctrlKey) &&
      (!s.shift || e.shiftKey);

    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();

      if ((e.metaKey || e.ctrlKey) && key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }

      for (const cmd of commands) {
        if (cmd.shortcut && matchShortcut(e, cmd.shortcut)) {
          e.preventDefault();
          cmd.action();
          setOpen(false);
          return;
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commands]);

  useEffect(() => {
    if (!open) {
      return;
    }
    inputRef.current?.focus();
    setQuery('');
    setSelected(0);
  }, [open]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((s) => (filtered.length ? (s + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((s) =>
        filtered.length ? (s - 1 + filtered.length) % filtered.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[selected];
      if (cmd) {
        cmd.action();
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4">
      <div className="mt-6 w-full max-w-sm rounded-md bg-white p-2 shadow-lg">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={handleKey}
          className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none"
          placeholder="Type a command..."
        />
        <ul className="max-h-60 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-2 py-1 text-sm italic text-gray-500">
              No matching commands
            </li>
          ) : (
            filtered.map((cmd, i) => (
              <li
                key={cmd.label}
                className={`flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm ${
                  i === selected ? 'bg-gray-200' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  cmd.action();
                  setOpen(false);
                }}
              >
                <span>{cmd.label}</span>
                {cmd.shortcut && (
                  <span className="ml-4 text-xs text-gray-500">
                    {formatShortcut(cmd.shortcut)}
                  </span>
                )}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
