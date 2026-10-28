import { resolveRelayEndpoints } from '../src/shared/relay.ts';

export function normalizeRelayUrl(value) {
  return resolveRelayEndpoints(value).address;
}

export function checkRelayRequest(settings, request, pendingEncodes = 0) {
  if (settings.connection !== 'relay') return;
  if (
    settings.relay.models !== null &&
    !settings.relay.models.includes(request.model.replace(/-medium$/, ''))
  )
    throw new Error('中转站没有这个模型');
  if (pendingEncodes)
    throw new Error('中转站不支持给新的 Vibe 参考编码，换回官方或者去掉新加的参考');
}
