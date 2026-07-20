import { ListKit } from '@tiptap/extension-list';

export const ListKitExtension = ListKit.configure({
  // replaced by ListKeymapExtension, which fixes the stock keymap
  // lifting both the list item and its surrounding task item at once
  listKeymap: false,
  taskItem: {
    nested: true,
  },
});
