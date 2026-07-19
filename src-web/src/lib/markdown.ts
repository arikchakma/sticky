import { Editor, type JSONContent } from '@tiptap/react';
import { editorExtensions } from './editor-extensions';

// One long-lived hidden editor parses markdown for callers that only
// need the resulting document, like the search panel deriving titles;
// re-filling it beats constructing an editor per note.
let parser: Editor | null = null;

export function markdownToTiptapJson(markdown: string): JSONContent {
  parser ??= new Editor({ extensions: editorExtensions });
  parser.commands.setContent(markdown, { contentType: 'markdown' });
  return parser.getJSON();
}
