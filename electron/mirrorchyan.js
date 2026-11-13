import providerModule from 'electron-updater/out/providers/Provider.js';
import { compareVersions } from './updates.js';
import { validateReleaseNotes } from '../src/lib/releaseNotes.js';

export const MIRRORCHYAN_MAC_ZIP_RID = '';
export const MIRRORCHYAN_SITE = 'https://mirrorchyan.com/zh/get-start?source=NovelAIPromptStudio';
const RELEASES = 'https://github.com/LBEILC/NovelAIPromptStudio/releases';
const CDK_ERRORS = {
  7001: 'CDK 已过期，请续费或更换',
  7002: 'CDK 不正确，请检查后重新填写',
  7003: '今天的下载次数已用完，请明天再试',
  7004: '这个 CDK 不适用于本软件',
  7005: 'CDK 已被封禁，请联系 Mirror酱 客服',
  8009: '这是测试用 CDK，不能下载',
};

export function mirrorFailure(code = -1) {
  // TODO(design): Confirm the generic request failure copy (download refresh only).
  return {
    mirrorCode: code,
    mirrorFallback: !Object.hasOwn(CDK_ERRORS, code),
    error: CDK_ERRORS[code] || '【文案待定：Mirror酱 更新请求失败】',
  };
}

export function sanitizeUpdateText(value, secrets = []) {
  let text = String(value instanceof Error ? value.message : (value ?? ''));
  text = text.replace(/https?:\/\/[^\s"'<>\\]+/gi, (url) => url.split(/[?#]/)[0]);
  for (const secret of secrets.filter(Boolean)) {
    for (const spelling of new Set([secret, encodeURIComponent(secret)]))
      text = text.split(spelling).join('[redacted]');
  }
  return text;
}

export function createUpdateLogger(logger, secrets = () => []) {
  const clean = (value, seen = new WeakSet()) => {
    if (value instanceof Error) return sanitizeUpdateText(value.stack || value.message, secrets());
    if (typeof value === 'string') return sanitizeUpdateText(value, secrets());
    if (!value || typeof value !== 'object') return value;
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.map((item) => clean(item, seen));
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item, seen)]));
  };
  return Object.fromEntries(
    ['info', 'warn', 'error', 'debug'].map((level) => [
      level,
      (...args) => logger?.[level]?.(...args.map((value) => clean(value))),
    ]),
  );
}

// Private download metadata never enters UpdateState or a renderer event.
export function parseMirrorResponse(
  payload,
  { currentVersion, cdk = '', platform = process.platform, macZipRid = MIRRORCHYAN_MAC_ZIP_RID },
) {
  if (!Number.isInteger(payload?.code)) return { failure: mirrorFailure() };
  if (payload.code !== 0) return { failure: mirrorFailure(payload.code) };
  const data = payload.data;
  const version =
    typeof data?.version_name === 'string' ? data.version_name.replace(/^v/i, '') : '';
  if (!/^\d+\.\d+\.\d+$/.test(version)) return { failure: mirrorFailure() };
  let url;
  try {
    const candidate = new URL(data.url);
    if (candidate.protocol === 'https:' && !candidate.username && !candidate.password)
      url = candidate.href;
  } catch {
    /* Metadata without a CDK has no download URL. */
  }
  const useMirror = Boolean(
    cdk && url && (platform === 'win32' || (platform === 'darwin' && macZipRid)),
  );
  const timestamp = Number(data.cdk_expired_time);
  const expiry = new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
  const cdkExpiresAt =
    data.cdk_expired_time != null && Number.isFinite(timestamp) && !Number.isNaN(expiry.getTime())
      ? expiry.toISOString()
      : undefined;
  return {
    state: {
      source: 'mirrorchyan',
      downloadSource: useMirror ? 'mirrorchyan' : 'github',
      mirrorCode: undefined,
      mirrorFallback: undefined,
      cdkExpiresAt,
      currentVersion,
      latestVersion: version,
      hasUpdate: compareVersions(version, currentVersion) > 0,
      checkedAt: new Date().toISOString(),
      publishedAt: '',
      notes: sanitizeUpdateText(String(data.release_note || '').slice(0, 4000), [cdk]),
      releaseUrl: `${RELEASES}/tag/v${version}`,
      structuredNotes: null,
    },
    download: useMirror ? { version, url, sha256: data.sha256, filesize: data.filesize } : null,
  };
}

export async function requestMirrorUpdate(fetcher, options) {
  const {
    cdk = '',
    platform = process.platform,
    arch = process.arch,
    macZipRid = MIRRORCHYAN_MAC_ZIP_RID,
  } = options;
  const rid = platform === 'darwin' && macZipRid ? macZipRid : 'NovelAIPromptStudio';
  const url = new URL(`https://mirrorchyan.com/api/resources/${encodeURIComponent(rid)}/latest`);
  url.search = new URLSearchParams({
    os: platform === 'win32' ? 'win' : platform === 'darwin' ? 'macos' : 'linux',
    arch: platform === 'win32' ? 'x64' : arch,
    channel: 'stable',
    user_agent: 'NovelAIPromptStudio',
    ...(cdk ? { cdk } : {}),
  }).toString();
  try {
    const response = await fetcher(url.href, { signal: AbortSignal.timeout(10_000) });
    // Business errors are JSON even on non-2xx responses. Never forward msg or a transport error.
    return parseMirrorResponse(await response.json(), options);
  } catch {
    return { failure: mirrorFailure() };
  }
}

export async function mirrorReleaseNotes(fetcher, version) {
  try {
    const response = await fetcher(`${RELEASES}/download/v${version}/release-notes.json`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      return null;
    }
    const notes = validateReleaseNotes(await response.json());
    return notes.version === version ? notes : null;
  } catch {
    return null;
  }
}

export class MirrorChyanProvider extends providerModule.Provider {
  constructor(options, _updater, runtimeOptions) {
    super(runtimeOptions);
    const { version, url, sha256, filesize } = options.mirrorDownload;
    if (!/^[a-f\d]{64}$/i.test(sha256 || '') || !Number.isSafeInteger(filesize) || filesize <= 0)
      // TODO(design): Confirm the invalid download metadata copy.
      throw new Error('【文案待定：Mirror酱 更新文件校验信息无效】');
    this.info = {
      version,
      files: [{ url, sha2: sha256, size: filesize }],
      path: url,
      releaseDate: new Date().toISOString(),
    };
  }
  async getLatestVersion() {
    return this.info;
  }
  resolveFiles(info) {
    return info.files.map((file) => ({ url: new URL(file.url), info: file }));
  }
}
