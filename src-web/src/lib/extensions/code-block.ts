import { CodeBlock } from '@tiptap/extension-code-block';
import { createHighlightPlugin } from 'prosemirror-highlight';
import { lazyParser } from '../highlighter';

export const CodeBlockExtension = CodeBlock.extend({
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      createHighlightPlugin({ parser: lazyParser }),
    ];
  },
});
