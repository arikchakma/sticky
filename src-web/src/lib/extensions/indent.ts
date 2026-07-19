import { Extension } from '@tiptap/react';
import { findListItemAtSelection } from './find-item';
import { sinkListItemIntoListBefore } from './sink';

export const ListIndentKeymapExtension = Extension.create({
  name: 'listIndentKeymap',
  priority: 1000,
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        const listItem = findListItemAtSelection(editor.state);

        if (!listItem) {
          return false;
        }

        if (!editor.commands.sinkListItem(listItem.node.type.name)) {
          sinkListItemIntoListBefore(editor, listItem.depth);
        }

        // a failed indent must not move focus out of the editor
        return true;
      },
      'Shift-Tab': ({ editor }) => {
        const listItem = findListItemAtSelection(editor.state);

        if (!listItem) {
          return false;
        }

        editor.commands.liftListItem(listItem.node.type.name);

        return true;
      },
    };
  },
});
