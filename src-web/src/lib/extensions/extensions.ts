import { Typography } from '@tiptap/extension-typography';
import { CharacterCount } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { CodeBlockExtension } from './code-block';
import { FindExtension } from './find';
import { ListKeymapExtension } from './keymap';
import { ListKitExtension } from './list-kit';
import { PlaceholderExtension } from './placeholder';
import { StarterKitExtension } from './starter-kit';
import { UnderlineExtension } from './underline';

export const editorExtensions = [
  ListKeymapExtension,
  StarterKitExtension,
  UnderlineExtension,
  Markdown,
  ListKitExtension,
  CharacterCount,
  PlaceholderExtension,
  CodeBlockExtension,
  FindExtension,
  Typography,
];
