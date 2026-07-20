import {
  BulletList,
  ListItem,
  OrderedList,
  TaskItem,
  TaskList,
  listHelpers,
} from '@tiptap/extension-list';
import { Extension, type Editor } from '@tiptap/react';
import { findListItemAtSelection, indentListItem } from '../list';

const LIST_TYPES = [
  {
    itemName: ListItem.name,
    wrapperNames: [BulletList.name, OrderedList.name],
  },
  {
    itemName: TaskItem.name,
    wrapperNames: [TaskList.name],
  },
];

const onBackspace = (editor: Editor) => {
  const listItem = findListItemAtSelection(editor.state);
  if (!listItem) {
    return LIST_TYPES.some(({ itemName, wrapperNames }) =>
      listHelpers.handleBackspace(editor, itemName, wrapperNames)
    );
  }

  // handleBackspace would lift the whole item; merge like plain paragraphs
  if (editor.state.selection.$from.index(listItem.depth) !== 0) {
    return false;
  }

  const listType = LIST_TYPES.find(
    ({ itemName }) => itemName === listItem.node.type.name
  )!;

  return listHelpers.handleBackspace(
    editor,
    listType.itemName,
    listType.wrapperNames
  );
};

const onDelete = (editor: Editor) => {
  const listItem = findListItemAtSelection(editor.state);
  if (!listItem) {
    return false;
  }

  return listHelpers.handleDelete(editor, listItem.node.type.name);
};

const onTab = (editor: Editor) => {
  const listItem = findListItemAtSelection(editor.state);
  if (!listItem) {
    return false;
  }

  if (!editor.commands.sinkListItem(listItem.node.type.name)) {
    indentListItem(editor, listItem.depth);
  }

  // Tab must never move focus out of the editor
  return true;
};

const onShiftTab = (editor: Editor) => {
  const listItem = findListItemAtSelection(editor.state);
  if (!listItem) {
    return false;
  }

  editor.commands.liftListItem(listItem.node.type.name);
  return true;
};

export const ListKeymapExtension = Extension.create({
  name: 'listKeymap',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => onTab(editor),
      'Shift-Tab': ({ editor }) => onShiftTab(editor),
      Backspace: ({ editor }) => onBackspace(editor),
      'Mod-Backspace': ({ editor }) => onBackspace(editor),
      Delete: ({ editor }) => onDelete(editor),
      'Mod-Delete': ({ editor }) => onDelete(editor),
    };
  },
});
