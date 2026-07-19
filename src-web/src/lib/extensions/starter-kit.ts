import StarterKit from '@tiptap/starter-kit';

export const StarterKitExtension = StarterKit.configure({
  heading: {
    levels: [1, 2, 3],
  },
  listItem: false,
  bulletList: false,
  orderedList: false,
  listKeymap: false,
  codeBlock: false,
  trailingNode: false,
  underline: false,
});
