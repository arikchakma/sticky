import { ListKit } from '@tiptap/extension-list';

export const ListKitExtension = ListKit.configure({
  taskItem: {
    nested: true,
  },
});
