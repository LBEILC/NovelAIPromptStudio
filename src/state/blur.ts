import { useSyncExternalStore } from 'react';
import { invokeUI } from '../lib/commands';
import type { BlurSettings, BlurSettingsInput, NsfwState } from '../shared/types';

let settings: BlurSettings | null = null;
let loading: Promise<void> | null = null;
let connected = false;
let revision = 0;
const states = new Map<string, NsfwState>();
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};
function connect() {
  if (connected || !window.studio) return;
  connected = true;
  window.studio.onCommandEvent((event) => {
    if (event.type === 'blur') {
      revision++;
      settings = event.settings;
      notify();
    }
    if (event.type === 'nsfw-changed') {
      for (const [id, state] of Object.entries(event.states)) states.set(id, state);
      notify();
    }
  });
}
function subscribe(listener: () => void) {
  connect();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function load() {
  connect();
  if (settings || loading) return;
  const started = revision;
  loading = invokeUI('settings.blur.get', {})
    .then((value) => {
      if (started === revision) {
        settings = value;
        notify();
      }
    })
    .catch(() => {
      /* A subsequent subscription may retry when the bridge is ready. */
    })
    .finally(() => {
      loading = null;
    });
}
export function useBlurSettings(): BlurSettings | null {
  return useSyncExternalStore(
    (listener) => {
      const off = subscribe(listener);
      load();
      return off;
    },
    () => settings,
  );
}
export function useNsfwState(
  image: { id: string; nsfw?: NsfwState } | null | undefined,
): NsfwState | null {
  return useSyncExternalStore(subscribe, () =>
    image ? states.get(image.id) || image.nsfw || null : null,
  );
}
export async function saveBlurSettings(patch: Partial<BlurSettingsInput>): Promise<BlurSettings> {
  connect();
  const value = await invokeUI('settings.blur.save', { settings: patch });
  revision++;
  settings = value;
  notify();
  return value;
}
export async function markNsfw(ids: string[], value: 'nsfw' | 'safe' | 'auto'): Promise<void> {
  connect();
  const result = await invokeUI('library.nsfw.mark', { ids, value });
  for (const [id, state] of Object.entries(result.states)) states.set(id, state);
  notify();
}
