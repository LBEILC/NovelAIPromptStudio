import { useEffect, useSyncExternalStore } from 'react';
import type { GenerationStatus } from '../shared/generation';
import { invokeUI } from '../lib/commands';
let state: GenerationStatus = {
  jobs: [],
  settings: {
    hasToken: false,
    continuous: false,
    agentMode: 'confirm',
    limitEnabled: false,
    dailyLimit: 100,
  },
  subscription: null,
  balance: 0,
  accountError: '',
};
const listeners = new Set<() => void>();
let connected = false;
function publish(value: GenerationStatus) {
  state = value;
  for (const fn of listeners) fn();
}
export function useGeneration() {
  useEffect(() => {
    if (connected || !window.studio) return;
    connected = true;
    window.studio.onCommandEvent((event) => {
      if (event.type === 'generation') publish(event.data);
    });
    void invokeUI('account.get', {})
      .then(publish)
      .catch(() => {});
  }, []);
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
  );
}
