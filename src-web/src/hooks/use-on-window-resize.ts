import { getCurrentWindow } from '@tauri-apps/api/window';
import { useCallback, useEffect } from 'react';

export function useOnWindowResize(cb: () => void) {
  const checkMonitor = useCallback(cb, [cb]);
  useEffect(() => {
    const unlisten = getCurrentWindow().onResized(checkMonitor);
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [checkMonitor]);
}
