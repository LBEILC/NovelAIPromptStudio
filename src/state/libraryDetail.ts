import { invokeUI } from '../lib/commands';
import { useEffect, useState } from 'react';
import type { ImageRecord } from '../shared/types';

/** Keep the previous record painted until the newest request resolves. */
export function useLibraryDetail(id: string, revision: unknown) {
  const [detail, setDetail] = useState<ImageRecord | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    let active = true;
    setError('');
    invokeUI('library.get', { id: id })
      .then((result) => result.project)
      .then((record) => {
        if (active) setDetail(record);
      })
      .catch((reason: unknown) => {
        if (active) setError(String(reason));
      });
    return () => {
      active = false;
    };
  }, [id, revision]);
  return { detail, error };
}
