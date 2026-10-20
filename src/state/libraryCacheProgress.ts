import { onProgress } from '../lib/commands';
import { useEffect, useRef, useState } from 'react';
import type { LibraryCardCacheProgress } from '../shared/ipc';

export function useLibraryCacheProgress(loading: boolean) {
  const [progress, setProgress] = useState<LibraryCardCacheProgress | null>(null);
  const [show, setShow] = useState(false);
  const active = useRef(loading);
  active.current = loading;
  useEffect(() => {
    const unsubscribe = onProgress('library:cards-progress', (value) => {
      if (active.current) setProgress(value);
    });
    return () => {
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!loading) {
      setProgress(null);
      setShow(false);
      return;
    }
    const timer = setTimeout(() => setShow(true), 300);
    return () => clearTimeout(timer);
  }, [loading]);
  return loading && show ? progress : null;
}
