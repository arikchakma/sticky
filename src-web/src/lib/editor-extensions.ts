import { ListKit } from '@tiptap/extension-list';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';
import { CodeBlock } from './highlighter';

export const editorExtensions = [
  StarterKit.configure({
    heading: {
      levels: [1, 2, 3],
    },
    listItem: false,
    bulletList: false,
    orderedList: false,
    listKeymap: false,
    codeBlock: false,
    trailingNode: false,
  }),
  ListKit.configure({
    taskItem: {
      nested: true,
    },
  }),
  CharacterCount,
  Placeholder.configure({
    placeholder: (props) => {
      const { editor } = props;
      if (editor.isEmpty) {
        return 'Start typing...';
      }

      return 'Write something...';
    },
  }),
  CodeBlock,
];
