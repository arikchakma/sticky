import { CharacterCount } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { CodeBlockExtension } from './code-block';
import { ListIndentKeymapExtension } from './indent';
import { ListKitExtension } from './list-kit';
import { PlaceholderExtension } from './placeholder';
import { StarterKitExtension } from './starter-kit';
import { UnderlineExtension } from './underline';

export const editorExtensions = [
  ListIndentKeymapExtension,
  StarterKitExtension,
  UnderlineExtension,
  Markdown,
  ListKitExtension,
  CharacterCount,
  PlaceholderExtension,
  CodeBlockExtension,
];
