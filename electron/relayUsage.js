// New API accounting is optional and never blocks image delivery.
export function createRelayUsage({
  fetchImpl = fetch,
  wait = (ms) =>
    new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      timer.unref?.();
    }),
} = {}) {
  const units = new Map();
  async function json(origin, route, key) {
    const response = await fetchImpl(`${origin}${route}`, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
    });
    if (!response.ok) throw new Error('Accounting unavailable');
    const body = await response.json();
    if (body?.success === false) throw new Error('Accounting unavailable');
    return body?.data;
  }
  async function unit(origin) {
    if (!units.has(origin)) {
      const value = (await json(origin, '/api/status'))?.quota_per_unit;
      if (!Number.isFinite(value) || value <= 0) return null;
      units.set(origin, value);
    }
    return units.get(origin);
  }
  const valid = (value) => Number.isFinite(value) && value >= 0;
  return {
    async usage(baseUrl, key) {
      try {
        const origin = new URL(baseUrl).origin;
        const [scale, data] = await Promise.all([
          unit(origin),
          json(origin, '/api/usage/token/', key),
        ]);
        if (
          !scale ||
          !valid(data?.total_used) ||
          typeof data?.unlimited_quota !== 'boolean' ||
          (!data.unlimited_quota && !valid(data.total_available))
        )
          throw new Error('Invalid accounting');
        return {
          ok: true,
          used: data.total_used / scale,
          available: data.unlimited_quota ? null : data.total_available / scale,
        };
      } catch {
        return { ok: true, used: null, available: null };
      }
    },
    async requestQuota(baseUrl, key, requestId) {
      if (!requestId) return null;
      try {
        const origin = new URL(baseUrl).origin;
        const scale = await unit(origin);
        if (!scale) return null;
        for (const delay of [0, 3000, 12000]) {
          if (delay) await wait(delay);
          const data = await json(origin, '/api/log/token', key);
          const rows = Array.isArray(data) ? data : data?.items;
          if (!Array.isArray(rows)) return null;
          const row = rows.find((item) => item.request_id === requestId);
          if (row && valid(row.quota)) return row.quota / scale;
        }
      } catch {
        /* Optional endpoint, including unsupported relays. */
      }
      return null;
    },
  };
}
