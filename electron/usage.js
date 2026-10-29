import crypto from 'node:crypto';

export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function usageRange(range, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  else if (range === 'month') start.setDate(1);
  else if (range !== 'today') throw new Error('用量时间范围无效');
  return start;
}

export function createUsageStore(connection) {
  connection.exec(`CREATE TABLE IF NOT EXISTS generation_usage (
    id TEXT PRIMARY KEY, created_at TEXT NOT NULL, job_id TEXT NOT NULL,
    version_id TEXT, record_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_generation_usage_time ON generation_usage(created_at);
  CREATE INDEX IF NOT EXISTS idx_generation_usage_job ON generation_usage(job_id);`);
  const insert = connection.prepare('INSERT INTO generation_usage VALUES (?, ?, ?, ?, ?)');
  const update = connection.prepare('UPDATE generation_usage SET record_json=? WHERE id=?');
  const read = connection.prepare('SELECT * FROM generation_usage WHERE id=?');
  const decode = (row) => ({ ...JSON.parse(row.record_json), versionId: row.version_id });
  const rows = (start, end) =>
    connection
      .prepare(
        'SELECT * FROM generation_usage WHERE created_at >= ? AND created_at <= ? ORDER BY created_at, rowid',
      )
      .all(start.toISOString(), end.toISOString())
      .map(decode);
  const totals = (records, connectionMode, baseUrl) => {
    const selected = connectionMode
      ? records.filter(
          (r) =>
            r.connection === connectionMode &&
            (connectionMode !== 'relay' || baseUrl === undefined || r.relayBaseUrl === baseUrl),
        )
      : records;
    const sum = (list) => ({
      images: list.reduce((n, r) => n + r.images, 0),
      requests: list.length,
      quota: list.some((r) => Number.isFinite(r.quota))
        ? list.reduce((n, r) => n + (r.quota ?? 0), 0)
        : null,
      anlas:
        connectionMode === 'relay'
          ? null
          : list.reduce((n, r) => n + (r.connection === 'official' ? r.anlas || 0 : 0), 0),
      estimated: list.some((r) => r.estimated),
    });
    const grouped = (key) =>
      Object.fromEntries(
        [...new Set(selected.map((r) => r[key]))].map((value) => [
          value,
          sum(selected.filter((r) => r[key] === value)),
        ]),
      );
    return {
      ...sum(selected),
      byOperation: grouped('operation'),
      byModel: grouped('model'),
      agent: sum(selected.filter((r) => r.source === 'agent')),
    };
  };
  return {
    add(record) {
      const value = {
        ...record,
        id: crypto.randomUUID(),
        createdAt: record.createdAt || new Date().toISOString(),
      };
      insert.run(
        value.id,
        value.createdAt,
        value.jobId,
        value.versionId || null,
        JSON.stringify(value),
      );
      return value.id;
    },
    settle(id, changes) {
      const row = read.get(id);
      if (!row) throw new Error('用量记录不存在');
      update.run(JSON.stringify({ ...decode(row), ...changes }), id);
    },
    attachVersion(jobId, versionId) {
      connection
        .prepare('UPDATE generation_usage SET version_id=? WHERE job_id=? AND version_id IS NULL')
        .run(versionId, jobId);
    },
    list: (start = new Date(0), end = new Date()) => rows(start, end),
    summary(range = 'today', connectionMode, now = new Date(), baseUrl) {
      const start = usageRange(range, now);
      return {
        range,
        from: localDay(start),
        to: localDay(now),
        connection: connectionMode || 'all',
        ...totals(rows(start, now), connectionMode, baseUrl),
      };
    },
    daily(days = 30, connectionMode, now = new Date(), baseUrl) {
      if (!Number.isSafeInteger(days) || days < 1 || days > 366)
        throw new Error('天数必须在 1 到 366 之间');
      const start = usageRange('today', now);
      start.setDate(start.getDate() - days + 1);
      const records = rows(start, now);
      return {
        days,
        connection: connectionMode || 'all',
        items: Array.from({ length: days }, (_, i) => {
          const day = new Date(start);
          day.setDate(day.getDate() + i);
          const date = localDay(day);
          return {
            date,
            ...totals(
              records.filter((r) => localDay(new Date(r.createdAt)) === date),
              connectionMode,
              baseUrl,
            ),
          };
        }),
      };
    },
  };
}

// The row is durable before sending. If the process exits during a request,
// the estimate remains visible instead of silently losing the possible charge.
export async function recordUsageRequest({
  usage,
  job,
  request,
  connection,
  price,
  balance,
  send,
  relayBaseUrl,
  settleQuota,
  onQuota,
}) {
  const before = connection === 'official' ? await balance().catch(() => NaN) : NaN;
  const id = usage.add({
    jobId: job.id,
    workId: job.workId,
    versionId: job.versionId || null,
    operation: job.operation || 'generate',
    model: request.model || 'director',
    ...(request.req_type ? { tool: request.req_type } : {}),
    width: request.width ?? request.parameters.width,
    height: request.height ?? request.parameters.height,
    requestedImages: request.req_type === 'bg-removal' ? 3 : 1,
    images: 0,
    source: job.source,
    connection,
    ...(connection === 'relay' ? { relayBaseUrl, quota: null } : {}),
    free: connection === 'official' && price.free,
    anlas: connection === 'official' ? price.anlas : null,
    estimated: connection === 'official',
    status: 'sending',
  });
  let succeeded = false,
    images = 0;
  try {
    const result = await send();
    images = Array.isArray(result) ? result.length : 1;
    succeeded = true;
    return result;
  } finally {
    const after = connection === 'official' ? await balance().catch(() => NaN) : NaN;
    const known = Number.isFinite(before) && Number.isFinite(after);
    const anlas = connection === 'relay' ? null : known ? Math.max(0, before - after) : price.anlas;
    job.spent += anlas || 0;
    if (connection === 'official' && !known) job.spentKnown = false;
    usage.settle(id, {
      images: succeeded ? images : 0,
      status: succeeded ? 'completed' : 'failed',
      anlas,
      estimated: connection === 'official' && !known,
    });
    if (succeeded && connection === 'relay' && settleQuota)
      void settleQuota()
        .then((quota) => {
          usage.settle(id, { quota });
          onQuota?.();
        })
        .catch(() => {});
  }
}
