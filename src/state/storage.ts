import { invokeUI, onProgress } from '../lib/commands';
import { useEffect, useState } from 'react';
import type { StorageDetails, DatabaseStorageLocation, DatabaseBackup } from '../shared/ipc';
import type { LibraryStorageProgress } from '../shared/types';
export function useStorage(onLibraryChange: () => Promise<unknown>) {
  const [details, setDetails] = useState<StorageDetails | null>(null);
  const [database, setDatabase] = useState<DatabaseStorageLocation | null>(null);
  const [backups, setBackups] = useState<DatabaseBackup[] | null>(null);
  const [databaseError, setDatabaseError] = useState('');
  const [progress, setProgress] = useState<LibraryStorageProgress | null>(null);
  const [moved, setMoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const studio = window.studio;
    if (!studio) return;
    let active = true;
    void Promise.all([invokeUI('storage.database', {}), invokeUI('storage.backups', {})])
      .then(([location, listing]) => {
        if (!active) return;
        if (location.ok) setDatabase(location);
        if (listing.ok) setBackups(listing.backups);
        if (!location.ok) setDatabaseError(location.error);
        else if (!listing.ok) setDatabaseError(listing.error);
      })
      .catch((e: Error) => {
        if (active) setDatabaseError(e.message);
      });
    invokeUI('storage.get', {})
      .then((result) => {
        if (!active) return;
        if (result.ok) setDetails(result);
        else setError(result.error);
      })
      .catch((e: Error) => setError(e.message));
    const unsubscribe = onProgress('library:storage-progress', (next) => {
      if (active) setProgress(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const change = async () => {
    if (!window.studio || busy) return;
    setBusy(true);
    setMoved(false);
    setProgress(null);
    setError('');
    try {
      const result = await invokeUI('storage.change', {});
      if (!result.ok) throw new Error(result.error);
      if ('canceled' in result) return;
      setDetails(result);
      setMoved(!result.cleanupWarning);
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
      const result = await invokeUI('storage.reveal', {});
      if (result && !result.ok) throw new Error(result.error);
    } catch (e) {
      setError(String(e));
    }
  };
  const revealDatabase = async (fileName: string) => {
    setDatabaseError('');
    try {
      const result = await invokeUI('storage.reveal-backup', { fileName: fileName });
      if (result && !result.ok) throw new Error(result.error);
    } catch (e) {
      setDatabaseError(e instanceof Error ? e.message : String(e));
    }
  };
  return {
    details,
    moved,
    progress,
    busy,
    error,
    change,
    reveal,
    database,
    backups,
    databaseError,
    revealDatabase,
  };
}
