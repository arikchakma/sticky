import { getCurrentWindow } from '@tauri-apps/api/window';
import type { Editor } from '@tiptap/react';
import { useEffect } from 'react';

const MAIN_WINDOW_PREFIX = 'main_';

export function useWindowReveal(editor: Editor) {
  useEffect(() => {
    const currentWindow = getCurrentWindow();
    if (!currentWindow.label.startsWith(MAIN_WINDOW_PREFIX)) {
      return;
    }

    let cancelled = false;
    const reveal = async () => {
      if ((await currentWindow.isVisible()) || cancelled) {
        return;
      }

      await currentWindow.show();
      await currentWindow.setFocus();
      // The editor's autofocus fired while the window was still
      // hidden, which WebKit ignores; focus for real now.
      editor.commands.focus('end');
    };

    reveal();

    return () => {
      cancelled = true;
    };
  }, [editor]);
}
