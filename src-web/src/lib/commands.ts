import {
  ChevronsDownUpIcon,
  ClipboardCopyIcon,
  ClipboardTypeIcon,
  CopyPlusIcon,
  FolderIcon,
  FolderOpenIcon,
  LayersIcon,
  PlusIcon,
  SquareDashedIcon,
  Trash2Icon,
  type LucideIcon,
} from 'lucide-react';

export type CommandContext = {
  noteId?: string;
  autoSize: boolean;
};

export type Command = {
  id: string;
  label: string | ((context: CommandContext) => string);
  icon: LucideIcon;
  // Display only: the note window handles the actual keystrokes.
  shortcut?: string[];
  isAvailable?: (context: CommandContext) => boolean;
};

export type CommandGroup = {
  id: string;
  title: string;
  children: Command[];
};

const requiresNote = (context: CommandContext) => Boolean(context.noteId);

// Selections travel back to the note window as `command:action`
// events; the handlers live in `useNoteActions`.
export const commandGroups: CommandGroup[] = [
  {
    id: 'note',
    title: 'Note',
    children: [
      {
        id: 'new-note',
        label: 'New Note',
        icon: PlusIcon,
        shortcut: ['⌘', 'N'],
      },
      {
        id: 'duplicate-note',
        label: 'Duplicate Note',
        icon: CopyPlusIcon,
        isAvailable: requiresNote,
      },
      {
        id: 'browse-notes',
        label: 'Browse Notes',
        icon: LayersIcon,
        shortcut: ['⌘', 'P'],
      },
    ],
  },
  {
    id: 'file',
    title: 'File',
    children: [
      {
        id: 'copy-markdown',
        label: 'Copy as Markdown',
        icon: ClipboardTypeIcon,
        isAvailable: requiresNote,
      },
      {
        id: 'copy-path',
        label: 'Copy File Path',
        icon: ClipboardCopyIcon,
        isAvailable: requiresNote,
      },
      {
        id: 'reveal-note',
        label: 'Reveal in Finder',
        icon: FolderOpenIcon,
        isAvailable: requiresNote,
      },
      {
        id: 'open-notes-folder',
        label: 'Open Notes Folder',
        icon: FolderIcon,
      },
    ],
  },
  {
    id: 'window',
    title: 'Window',
    children: [
      {
        id: 'fit-window',
        label: 'Fit Window to Content',
        icon: ChevronsDownUpIcon,
      },
      {
        id: 'toggle-auto-size',
        label: (context) =>
          context.autoSize
            ? 'Disable Window Auto-Sizing'
            : 'Enable Window Auto-Sizing',
        icon: SquareDashedIcon,
      },
    ],
  },
  {
    id: 'danger',
    title: 'Danger',
    children: [
      {
        id: 'delete-note',
        label: 'Delete Note',
        icon: Trash2Icon,
        isAvailable: requiresNote,
      },
    ],
  },
];

export function commandLabel(command: Command, context: CommandContext) {
  return typeof command.label === 'string'
    ? command.label
    : command.label(context);
}

export function filterCommandGroups(
  context: CommandContext,
  search: string
): CommandGroup[] {
  return commandGroups
    .map((group) => ({
      ...group,
      children: group.children.filter((command) => {
        if (!(command.isAvailable?.(context) ?? true)) {
          return false;
        }

        const label = commandLabel(command, context);
        return label.toLowerCase().includes(search.toLowerCase());
      }),
    }))
    .filter((group) => group.children.length > 0);
}
