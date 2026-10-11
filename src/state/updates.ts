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
    Promise.all([studio.getUpdateStatus(), studio.getProductivitySettings()])
      .then(([status, settings]) => {
        if (active) {
          setState(status);
          setAutoCheck(settings.autoCheckUpdates);
        }
      })
      .catch((e: Error) => setError(e.message));
    studio.onUpdateState((next) => {
      if (active) setState(next);
    });
    return () => {
      active = false;
      studio.offUpdateState();
    };
  }, []);
  const check = async () => {
    if (!window.studio) return;
    setError('');
    setState((current) => current && { ...current, phase: 'checking' });
    try {
      const result = await window.studio.checkForUpdates();
      if (!result.ok) throw new Error(result.error);
      setState(result);
    } catch (e) {
      setError(String(e));
      setState((current) => current && { ...current, phase: 'error' });
    }
  };
  const changeAutoCheck = async (checked: boolean) => {
    try {
      const saved = await window.studio?.saveProductivitySettings({ autoCheckUpdates: checked });
      if (saved) setAutoCheck(saved.autoCheckUpdates);
    } catch (e) {
      setError(String(e));
    }
  };
  const download = async () => {
    try {
      const result = await window.studio?.downloadUpdate();
      if (result && !result.ok) throw new Error(result.error);
    } catch (e) {
      setError(String(e));
    }
  };
  return { state, autoCheck, changeAutoCheck, check, download, error };
}
