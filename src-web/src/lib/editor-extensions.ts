import { ListKit } from '@tiptap/extension-list';
import { Underline } from '@tiptap/extension-underline';
import { CharacterCount, Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import { CodeBlock } from './highlighter';

// Notes are stored as markdown files that other tools read too; the
// stock `++text++` underline syntax renders as literal plus signs in
// Obsidian and GitHub, while inline <u> renders everywhere. Parsing
// keeps accepting both: <u> through the schema's parseHTML rules and
// ++text++ through the inherited tokenizer.
const UnderlineAsHtml = Underline.extend({
  renderMarkdown(node, helpers) {
    return `<u>${helpers.renderChildren(node)}</u>`;
  },
});

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
    underline: false,
  }),
  UnderlineAsHtml,
  Markdown,
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
