import { resolveRelayEndpoints } from '../src/shared/relay.ts';
import { relayPresetFor } from '../src/shared/relayPresets.ts';
import { INPAINT_MODELS } from '../src/shared/inpaint.ts';
import { MODEL_ORDER } from '../src/shared/params.ts';

export function relayRequestModel(connection, baseUrl, request) {
  if (
    connection !== 'relay' ||
    request.action !== 'infill' ||
    !relayPresetFor(baseUrl ?? '')?.inpaintBaseModel
  )
    return request.model;
  const base = request.model.replace(/-inpainting$/, '');
  return MODEL_ORDER.includes(base)
    ? base
    : (Object.keys(INPAINT_MODELS).find((key) => INPAINT_MODELS[key] === request.model) ??
        request.model);
}

export function normalizeRelayUrl(value) {
  return resolveRelayEndpoints(value).address;
}

export function checkRelayRequest(settings, request, pendingEncodes = 0) {
  if (settings.connection !== 'relay') return;
  if (
    settings.relay.models !== null &&
    !settings.relay.models.includes(
      relayRequestModel(settings.connection, settings.relay.baseUrl, request).replace(
        /-medium$/,
        '',
      ),
    )
  )
    throw new Error('中转站没有这个模型');
  if (pendingEncodes)
    throw new Error('中转站不支持给新的 Vibe 参考编码，换回官方或者去掉新加的参考');
}
