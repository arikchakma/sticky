import { MAX_TITLE_LEN } from '@sticky/models';
import type { Editor } from '@tiptap/react';
import { useEffect, useState } from 'react';

const UNTITLED = 'Untitled';

export function useNoteTitle(editor: Editor) {
  const [title, setTitle] = useState('');

  useEffect(() => {
    const readTitle = () => {
      let text = '';
      editor.state.doc.descendants((node) => {
        if (text) {
          return false;
        }
        if (node.isTextblock) {
          const content = node.textContent.trim();
          if (content) {
            text = content;
          }
          return false;
        }
        return true;
      });
      setTitle(text.slice(0, MAX_TITLE_LEN) || UNTITLED);
    };

    readTitle();
    editor.on('update', readTitle);
    return () => {
      editor.off('update', readTitle);
    };
  }, [editor]);

  return title;
}
