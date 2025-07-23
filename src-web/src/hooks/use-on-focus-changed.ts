import { useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

export function useOnFocusChanged(cb: () => void) {
  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(cb);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [cb]);
}
