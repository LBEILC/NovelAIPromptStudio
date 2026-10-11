import { useEffect, useState } from 'react';
import type { StorageDetails } from '../shared/ipc';
import type { LibraryStorageProgress } from '../shared/types';
export function useStorage(onLibraryChange: () => Promise<unknown>) {
  const [details, setDetails] = useState<StorageDetails | null>(null);
  const [progress, setProgress] = useState<LibraryStorageProgress | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const studio = window.studio;
    if (!studio) return;
    let active = true;
    studio
      .getLibraryStorage()
      .then((result) => {
        if (!active) return;
        if (result.ok) setDetails(result);
        else setError(result.error);
      })
      .catch((e: Error) => setError(e.message));
    studio.onLibraryStorageProgress((next) => {
      if (active) setProgress(next);
    });
    return () => {
      active = false;
      studio.offLibraryStorageProgress();
    };
  }, []);
  const change = async () => {
    if (!window.studio || busy) return;
    setBusy(true);
    setProgress(null);
    setError('');
    try {
      const result = await window.studio.changeLibraryStorage();
      if (!result.ok) throw new Error(result.error);
      if ('canceled' in result) return;
      setDetails(result);
      setError(result.cleanupWarning);
      await onLibraryChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const reveal = async () => {
    try {
      const result = await window.studio?.revealLibraryStorage();
      if (result && !result.ok) throw new Error(result.error);
    } catch (e) {
      setError(String(e));
    }
  };
  return { details, progress, busy, error, change, reveal };
}
