import { getCurrentWindow } from '@tauri-apps/api/window';
import { useEffect, useRef } from 'react';

export function useOnWindowResize(cb: () => void) {
  // The listener is registered once; the ref keeps it pointed at the
  // latest callback without re-subscribing on every render.
  const cbRef = useRef(cb);
  cbRef.current = cb;

  useEffect(() => {
    const unlisten = getCurrentWindow().onResized(() => cbRef.current());
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);
}
