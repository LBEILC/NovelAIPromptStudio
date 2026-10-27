import { useEffect, useSyncExternalStore } from 'react';
import type { CommandTab } from '../shared/commands';
import type { ImageRecord } from '../shared/types';
import { invokeUI } from '../lib/commands';
import { VersionListStore } from './versionListStore';

export const versionLists = new VersionListStore((tabId) => invokeUI('version.list', { tabId }));
let connected = false;
const images = new Map<string, Promise<ImageRecord>>();
export function readVersionImage(id: string) {
  connect();
  let image = images.get(id);
  if (!image) {
    image = invokeUI('library.get', { id }).then((r) => r.project);
    images.set(id, image);
    image.catch(() => {
      if (images.get(id) === image) images.delete(id);
    });
    if (images.size > 256) images.delete(images.keys().next().value!);
  }
  return image;
}
function connect() {
  if (connected || !window.studio) return;
  connected = true;
  window.studio.onCommandEvent((event) => {
    // Generation adds images; other library mutations can change existing records.
    if (event.type === 'workbench' && event.libraryChanged && !event.tabId) images.clear();
    versionLists.receive(event);
  });
}
export function readVersions(tabId: string) {
  connect();
  return versionLists.read(tabId);
}
export function useVersionList(
  tab: CommandTab | null,
  enabled = true,
  before?: () => Promise<void>,
) {
  const id = enabled ? tab?.id || '' : '';
  const data = useSyncExternalStore(
    (listener) => {
      connect();
      return id ? versionLists.subscribe(id, listener) : () => {};
    },
    () => (id ? versionLists.snapshot(id) : null),
  );
  useEffect(() => {
    if (!id || !tab) return;
    let live = true;
    versionLists.observe(tab);
    void Promise.resolve(before?.())
      .then(() => {
        if (!live) return;
        return readVersions(id);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, tab?.revision, tab?.versionId]);
  return data;
}
export function useVersionCounts(tabs: CommandTab[], enabled: boolean) {
  const counts = useSyncExternalStore((listener) => {
    connect();
    return versionLists.subscribeCounts(listener);
  }, versionLists.countSnapshot);
  const key = tabs.map((t) => `${t.id}:${t.revision}:${t.versionId}`).join('|');
  useEffect(() => {
    if (!enabled) return;
    for (const tab of tabs) {
      versionLists.observe(tab);
      void readVersions(tab.id).catch(() => {});
    }
  }, [key, enabled]);
  return counts;
}
