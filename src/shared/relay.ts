export const RELAY_URL_INVALID = '中转站地址无效，要以 https:// 开头，不能带 ? 或 #';

export type RelayEndpoints = {
  address: string;
  generate: string;
  stream: boolean;
  upscale: string;
  encodeVibe: string;
  models: string[];
};

export function resolveRelayEndpoints(value: string): RelayEndpoints {
  try {
    const input = String(value).trim();
    const url = new URL(input);
    if (
      input.includes('?') ||
      input.includes('#') ||
      url.username ||
      url.password ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
    )
      throw new Error(RELAY_URL_INVALID);
    const path = url.pathname.replace(/\/+$/, '');
    const endpoint = path.endsWith('/ai/generate-image-stream')
      ? '/ai/generate-image-stream'
      : path.endsWith('/ai/generate-image')
        ? '/ai/generate-image'
        : '';
    const prefix = endpoint
      ? path.slice(0, -endpoint.length)
      : path.replace(/\/v1$/, '').replace(/\/+$/, '');
    const base = url.origin + prefix;
    const address = endpoint ? url.origin + path : base;
    return {
      address,
      generate: endpoint ? address : base + '/ai/generate-image-stream',
      stream: endpoint !== '/ai/generate-image',
      upscale: base + '/ai/upscale',
      encodeVibe: base + '/ai/encode-vibe',
      models: prefix.endsWith('/v1')
        ? [base + '/models', base + '/v1/models']
        : [base + '/v1/models'],
    };
  } catch {
    throw new Error(RELAY_URL_INVALID);
  }
}
