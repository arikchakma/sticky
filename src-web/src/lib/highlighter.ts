import {
  createOnigurumaEngine,
  getSingletonHighlighter,
  type BuiltinLanguage,
  type Highlighter,
} from 'shiki';

import { invariant } from '@tanstack/react-router';
import { CodeBlock as CodeBlockExtension } from '@tiptap/extension-code-block';
import { createHighlightPlugin } from 'prosemirror-highlight';
import { createParser, type Parser } from 'prosemirror-highlight/shiki';
import { shikiTheme } from './theme';

let highlighter: Highlighter | undefined;
let parser: Parser | undefined;

export async function initHighlighter() {
  if (highlighter) {
    return;
  }

  highlighter = await getSingletonHighlighter({
    themes: [shikiTheme],
    langs: [
      'typescript',
      'javascript',
      'rust',
      'zig',
      'python',
      'go',
      'ruby',
      'perl',
      'php',
      'sql',
      'swift',
    ],
    engine: createOnigurumaEngine(() => import('shiki/wasm')),
  });
}

/**
 * Lazy load highlighter and highlighter languages.
 *
 * When the highlighter or the required language is not loaded, it returns a
 * promise that resolves when the highlighter or the language is loaded.
 * Otherwise, it returns an array of decorations.
 */
const lazyParser: Parser = (options) => {
  invariant(highlighter, 'Highlighter not initialized');

  const language = options.language as BuiltinLanguage;
  if (language && !highlighter.getLoadedLanguages().includes(language)) {
    return highlighter.loadLanguage(language);
  }

  if (!parser) {
    parser = createParser(highlighter);
  }

  return parser(options);
};

export const CodeBlock = CodeBlockExtension.extend({
  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      createHighlightPlugin({ parser: lazyParser }),
    ];
  },
});
