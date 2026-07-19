import { Editor, type JSONContent } from '@tiptap/react';
import { editorExtensions } from './extensions/extensions';

let parser: Editor | null = null;
export function markdownToTiptapJson(markdown: string): JSONContent {
  parser ??= new Editor({ extensions: editorExtensions });
  parser.commands.setContent(markdown, { contentType: 'markdown' });
  return parser.getJSON();
}
