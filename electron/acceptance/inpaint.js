import sharp from 'sharp';
import { isDeepStrictEqual } from 'node:util';

export async function inpaintChecks({ h, database }) {
  const call = (name, input = {}) =>
    h.evaluate(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
    );
  await call('account.connection.save', { connection: 'official' });
  await call('account.save', { token: 'acceptance-token' });
  const source = (await database.loadLibraryCards()).find(
    (p) => p.metadata.width >= 512 && p.metadata.height >= 512 && !p.deleted_at,
  );
  if (!source) throw new Error('Missing synthetic inpaint source');
  const opened = await call('workbench.open', { libraryId: source.id });
  const tabId = opened.tab.id;
  await call('params.set', {
    tabId,
    patch: { model: 'nai-diffusion-5-full' },
    dropReferences: true,
  });
  const versionsBefore = (await call('version.list', { tabId })).versions;
  const parent =
    database.versions.forImage(source.id, opened.tab.workId) ||
    versionsBefore.find((v) => !v.parentId && v.project.id === source.id);
  const rect = { x: 0, y: 0, width: 512, height: 512 };
  const mask = (
    await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect x="192" y="192" width="128" height="128" fill="white"/></svg>',
      ),
    )
      .png()
      .toBuffer()
  ).toString('base64');
  const estimate = await call('generate.estimate-inpaint', { tabId, imageId: source.id, rect });
  await h.check(
    '局部重绘按区域估价并返回实际模型',
    () =>
      !estimate.unavailable &&
      estimate.width === 1024 &&
      estimate.height === 1024 &&
      estimate.model === 'nai-diffusion-5-full-inpainting',
  );
  const job = await call('generate.inpaint', {
    tabId,
    imageId: source.id,
    rect,
    mask,
    strength: 1,
  });
  await h.until(
    async () =>
      ['completed', 'failed'].includes(
        (await call('generate.status', { id: job.id })).jobs[0].state,
      ),
    '局部重绘任务结束',
  );
  const finished = (await call('generate.status', { id: job.id })).jobs[0];
  await h.check(
    '局部重绘完成并新增来源图片的子版本',
    () =>
      finished.state === 'completed' &&
      finished.images.length === 1 &&
      database.versions.get(finished.versionId)?.parentId === parent.id &&
      database.versions.get(finished.versionId)?.operation.kind === 'inpaint',
  );
  const output = database.loadProject(finished.images[0]);
  const original = await sharp(database.loadProject(source.id).image_path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const painted = await sharp(output.image_path)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  await h.check(
    '重绘输出保持源图完整尺寸且选区内发生变化',
    () =>
      painted.info.width === original.info.width &&
      painted.info.height === original.info.height &&
      !painted.data.equals(original.data),
  );
  await h.check('重绘蒙版和羽化范围外像素逐字节保留', () => {
    for (let y = 0; y < original.info.height; y++)
      for (let x = 0; x < original.info.width; x++) {
        if (x >= 150 && x < 362 && y >= 150 && y < 362) continue;
        const offset = (y * original.info.width + x) * 4;
        if (
          !original.data
            .subarray(offset, offset + 4)
            .equals(painted.data.subarray(offset, offset + 4))
        )
          return false;
      }
    return true;
  });
  await h.check('重绘版本保留父版本提示词和参数快照', () => {
    const actual = database.versions.get(finished.versionId).project.metadata;
    const expected = parent.project.metadata;
    // Queue storage may normalize JSON whitespace while resolving image payloads.
    const normalized = (value) => {
      if (typeof value === 'string' && /^[\[{]/.test(value)) {
        try {
          return normalized(JSON.parse(value));
        } catch {
          return value;
        }
      }
      if (Array.isArray(value)) return value.map(normalized);
      if (value && typeof value === 'object')
        return Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, normalized(item)]),
        );
      return value;
    };
    return isDeepStrictEqual(normalized(actual), normalized(expected));
  });
}
