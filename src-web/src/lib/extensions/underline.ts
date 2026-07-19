import { Underline } from '@tiptap/extension-underline';

// `++text++` renders as literal plus signs in Obsidian and GitHub,
// inline <u> renders everywhere; parsing still accepts both.
export const UnderlineExtension = Underline.extend({
  renderMarkdown(node, helpers) {
    return `<u>${helpers.renderChildren(node)}</u>`;
  },
});
