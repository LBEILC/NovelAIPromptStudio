import { invokeUI } from '../lib/commands';
import { useEffect, useState } from 'react';
import type { UpdateState } from '../shared/types';
export function useUpdates() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [autoCheck, setAutoCheck] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const studio = window.studio;
    if (!studio) return;
    let active = true;
    Promise.all([invokeUI('updates.status', {}), invokeUI('settings.productivity.get', {})])
      .then(([status, settings]) => {
        if (active) {
          setState(status);
          setAutoCheck(settings.autoCheckUpdates);
        }
      })
      .catch((e: Error) => setError(e.message));
    const unsubscribe = studio.onCommandEvent((event) => {
      if (event.type !== 'updates') return;
      const next = event.data;
      if (active) setState(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const check = async () => {
    if (!window.studio) return;
    setError('');
    setState((current) => current && { ...current, phase: 'checking' });
    try {
      const result = await invokeUI('updates.check', {});
      if (!result.ok) throw new Error(result.error);
      setState(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState((current) => current && { ...current, phase: 'error', hasUpdate: false });
    }
  };
  const changeAutoCheck = async (checked: boolean) => {
    try {
      const saved = await invokeUI('settings.productivity.save', {
        settings: { autoCheckUpdates: checked },
      });
      if (saved) setAutoCheck(saved.autoCheckUpdates);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const download = async () => {
    try {
      const result = await invokeUI('updates.download', {});
      if (result && !result.ok) throw new Error(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return { state, autoCheck, changeAutoCheck, check, download, error };
}
