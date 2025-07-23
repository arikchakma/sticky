import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect } from 'react';

export function useOnFocusChanged(cb: () => void) {
  useEffect(() => {
    const unlisten = getCurrentWindow().onFocusChanged(cb);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [cb]);
}
