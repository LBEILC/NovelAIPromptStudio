export function normalizeRelayUrl(value) {
  const invalid = () => {
    throw new Error('地址要写成 https://example.com 这样，不带路径');
  };
  try {
    const url = new URL(String(value).trim());
    const pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
    if (
      pathname ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      !(
        url.protocol === 'https:' ||
        (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
      )
    )
      invalid();
    return url.origin;
  } catch {
    return invalid();
  }
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
