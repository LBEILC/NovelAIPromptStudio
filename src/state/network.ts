import { invokeUI } from '../lib/commands';
import type { NetworkSettings, NetworkState } from '../shared/types';

export const readNetwork = () => invokeUI('settings.network.get', {});
export const saveNetwork = (settings: NetworkSettings) =>
  invokeUI('settings.network.save', settings);
export const testNetwork = (settings: NetworkSettings) =>
  invokeUI('settings.network.test', settings);
export function onNetworkChange(callback: (state: NetworkState) => void) {
  return (
    window.studio?.onCommandEvent((event) => {
      if (event.type === 'network') callback(event.data);
    }) || (() => {})
  );
}
