import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isMacOS } from '~/lib/detect-browser';
import { getShowWordCount, setShowWordCount } from '~/lib/settings';
import { Input } from './ui/input';
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ScrollableDialogContent,
} from './ui/dialog';

type Shortcut = {
  key: string;
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
};

type Command = {
  id: string;
  label: string;
  action: () => void | Promise<void>;
  shortcut?: Shortcut;
};

export type CommandPaletteProps = {
  onNewWindow: () => void | Promise<void>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CommandPalette({
  onNewWindow,
  open: openProp,
  onOpenChange,
}: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const open = openProp ?? isOpen;
  const setOpen = useCallback(
    (v: boolean) => {
      if (openProp === undefined) setIsOpen(v);
      onOpenChange?.(v);
    },
    [openProp, onOpenChange]
  );

  const [query, setQuery] = useState('');
  const [focusedIdx, setFocusedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<Array<HTMLLIElement | null>>([]);
  const isMac = isMacOS();

  const shortcutParts = (s?: Shortcut): string[] => {
    if (!s) return [];
    const parts: string[] = [];
    if (isMac) {
      if (s.meta) parts.push('⌘');
      if (s.ctrl) parts.push('⌃');
      if (s.shift) parts.push('⇧');
      parts.push(s.key.toUpperCase());
    } else {
      if (s.ctrl || s.meta) parts.push('Ctrl');
      if (s.shift) parts.push('Shift');
      parts.push(s.key.toUpperCase());
    }
    return parts;
  };

  const toggleWordCount = useCallback(async () => {
    const current = await getShowWordCount();
    await setShowWordCount(!current);
  }, []);

  const commands = useMemo<Command[]>(
    () => [
      {
        id: 'new-note',
        label: 'Create New Note',
        shortcut: { key: 'n', meta: true },
        action: onNewWindow,
      },
      {
        id: 'toggle-counters',
        label: 'Toggle Word/Character Count',
        shortcut: { key: 'c', meta: true, shift: true },
        action: toggleWordCount,
      },
    ],
    [onNewWindow, toggleWordCount]
  );

  const norm = (s: string) =>
    s
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();

  const filtered = useMemo(() => {
    const q = norm(query);
    return q ? commands.filter((c) => norm(c.label).includes(q)) : commands;
  }, [commands, query]);

  const isEmpty = filtered.length === 0;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, setOpen]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setFocusedIdx(0);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    const el = itemRefs.current[focusedIdx];
    el?.scrollIntoView({ block: 'nearest' });
  }, [focusedIdx]);

  const matchShortcut = (e: KeyboardEvent | React.KeyboardEvent, s: Shortcut) =>
    e.key.toLowerCase() === s.key.toLowerCase() &&
    (!s.meta || ('metaKey' in e && e.metaKey)) &&
    (!s.ctrl || ('ctrlKey' in e && e.ctrlKey)) &&
    (!s.shift || ('shiftKey' in e && e.shiftKey));

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const hotkeyCmd = filtered.find(
      (c) => c.shortcut && matchShortcut(e, c.shortcut)
    );
    if (hotkeyCmd) {
      e.preventDefault();
      void hotkeyCmd.action();
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIdx((i) => (filtered.length ? (i + 1) % filtered.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIdx((i) =>
        filtered.length ? (i - 1 + filtered.length) % filtered.length : 0
      );
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[focusedIdx];
      if (cmd) {
        void cmd.action();
        setOpen(false);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  useEffect(() => {
    if (open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      for (const c of commands) {
        if (c.shortcut && matchShortcut(e, c.shortcut)) {
          e.preventDefault();
          c.action();
          return;
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, commands]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <ScrollableDialogContent
        onCloseAutoFocus={(e) => e.preventDefault()}
        showCloseButton={false}
        overlayClassName="px-5 bg-white/40 pt-14 overflow-y-hidden"
        className="flex h-fit w-full max-w-sm flex-col overflow-y-hidden rounded-lg border border-zinc-200 p-0 shadow-2xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription>Run actions quickly</DialogDescription>
        </DialogHeader>
        <div className="border-b border-zinc-200">
          <Input
            ref={inputRef}
            type="text"
            placeholder="Search for actions…"
            className="h-10 w-full border-none p-4 text-sm placeholder:text-zinc-400 focus-visible:ring-0"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            onKeyDown={onInputKeyDown}
          />
        </div>
        <div className="max-h-60 overflow-y-auto py-2">
          <ul
            id="command-listbox"
            role="listbox"
            aria-activedescendant={filtered[focusedIdx]?.id ?? undefined}
            className="flex flex-col px-2"
          >
            {isEmpty ? (
              <li className="px-2 py-2 text-sm italic text-zinc-400">
                No matching commands
              </li>
            ) : (
              filtered.map((cmd, i) => {
                const focused = i === focusedIdx;
                return (
                  <li
                    ref={(el) => (itemRefs.current[i] = el)}
                    id={cmd.id}
                    key={cmd.id}
                    className={`flex cursor-pointer items-center justify-between rounded px-2 py-2 text-sm ${
                      focused ? 'bg-zinc-100' : ''
                    }`}
                    onMouseEnter={() => setFocusedIdx(i)}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      void cmd.action();
                      setOpen(false);
                    }}
                  >
                    <span>{cmd.label}</span>
                    {cmd.shortcut && (
                      <div className="ml-4 flex gap-1">
                        {shortcutParts(cmd.shortcut).map((part, idx) => (
                          <kbd
                            key={idx}
                            className="inline-flex h-5 min-w-[20px] items-center justify-center rounded border border-zinc-300 bg-zinc-100 px-1.5 text-xs font-medium text-zinc-700"
                          >
                            {part}
                          </kbd>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </ScrollableDialogContent>
    </Dialog>
  );
}
