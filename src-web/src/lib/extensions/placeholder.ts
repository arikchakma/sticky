import { Placeholder } from '@tiptap/extensions';

export const PlaceholderExtension = Placeholder.configure({
  placeholder: ({ editor }) => {
    if (editor.isEmpty) {
      return 'Start typing...';
    }

    return 'Write something...';
  },
});
