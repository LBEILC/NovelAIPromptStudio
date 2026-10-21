import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import sharp from 'sharp';
import { modelKey, fingerprintVibe } from './vibes.js';

export async function referenceImage(source) {
  const input = source.startsWith('data:')
    ? Buffer.from(source.split(',')[1], 'base64')
    : await fs.readFile(source);
  if (input.length > 100 * 1024 * 1024) throw new Error('参考图过大');
  return sharp(input).rotate().removeAlpha().png().toBuffer();
}
export async function preciseImage(source) {
  const image = await referenceImage(source),
    { width, height } = await sharp(image).metadata();
  const [w, h] = [
    [1024, 1536],
    [1536, 1024],
    [1472, 1472],
  ].sort(
    (a, b) => Math.abs(a[0] / a[1] - width / height) - Math.abs(b[0] / b[1] - width / height),
  )[0];
  return (
    await sharp(image)
      .resize(w, h, { fit: 'contain', background: '#000000', kernel: 'lanczos3' })
      .png()
      .toBuffer()
  ).toString('base64');
}
export function createVibeLibrary(connection) {
  // Additive table: historical retired vibe tables and old library records remain untouched.
  connection.exec(
    'CREATE TABLE IF NOT EXISTS reference_vibes (id TEXT PRIMARY KEY, document_json TEXT NOT NULL)',
  );
  const get = (id) => {
    const row = connection.prepare('SELECT document_json FROM reference_vibes WHERE id=?').get(id);
    return row ? JSON.parse(row.document_json) : null;
  };
  const save = (document) =>
    connection
      .prepare('INSERT OR REPLACE INTO reference_vibes VALUES (?,?)')
      .run(document.id, JSON.stringify(document));
  const variant = (doc, model, information) =>
    Object.values(doc?.encodings?.[modelKey(model)] || {}).find(
      (v) => (v.params?.information_extracted ?? null) === information,
    );
  return {
    get,
    save,
    variant,
    refresh(project) {
      if (!project?.references) return project;
      return {
        ...project,
        references: {
          ...project.references,
          vibes: project.references.vibes.map((ref) => {
            const id =
              ref.libraryId ||
              (ref.thumbnail?.startsWith('data:')
                ? fingerprintVibe(ref.thumbnail.split(',')[1])
                : null);
            const doc = id && get(id),
              cached = variant(doc, project.params.model, ref.information);
            return cached
              ? {
                  ...ref,
                  libraryId: doc.id,
                  encode: null,
                  file: `${doc.id}.naiv4vibe`,
                  encoding: cached.encoding,
                  model: project.params.model,
                }
              : ref;
          }),
        },
      };
    },
    list: () =>
      connection
        .prepare('SELECT document_json FROM reference_vibes ORDER BY rowid DESC')
        .all()
        .map((row) => {
          const d = JSON.parse(row.document_json),
            models = Object.keys(d.encodings).map(
              (key) =>
                ({
                  v4full: 'nai-diffusion-4-full',
                  v4curated: 'nai-diffusion-4-curated-preview',
                  'v4-5full': 'nai-diffusion-4-5-full',
                  'v4-5curated': 'nai-diffusion-4-5-curated',
                })[key],
            );
          return {
            id: d.id,
            name: d.name,
            thumbnail: d.thumbnail || null,
            createdAt: d.createdAt,
            models,
            informations: Object.fromEntries(
              models.map((m) => [
                m,
                Object.values(d.encodings[modelKey(m)]).flatMap((v) =>
                  v.params ? [v.params.information_extracted] : [],
                ),
              ]),
            ),
          };
        }),
    async resolve(ref, model, encode) {
      let doc = ref.libraryId ? get(ref.libraryId) : null;
      if (!doc && ref.thumbnail) {
        const image = (await referenceImage(ref.thumbnail)).toString('base64'),
          id = fingerprintVibe(image);
        doc = get(id) || {
          identifier: 'novelai-vibe-transfer',
          version: 1,
          type: 'image',
          id,
          image,
          thumbnail: `data:image/png;base64,${image}`,
          name: ref.name,
          createdAt: new Date().toISOString(),
          encodings: {},
          source: { type: 'image', referenceId: ref.id },
          importInfo: { model, information_extracted: ref.information, strength: ref.strength },
        };
      }
      const cached = variant(doc, model, ref.information);
      if (cached)
        return { encoding: cached.encoding, libraryId: doc.id, file: `${doc.id}.naiv4vibe` };
      if (!ref.encode && ref.encoding && ref.model === model) return { encoding: ref.encoding };
      if (!doc?.image || ref.information === null)
        throw new Error('参考图没有适用于这个模型的编码或原图');
      if (!encode) return { pending: true, cacheKey: `${doc.id}:${model}:${ref.information}` };
      const encoding = await encode({
        image: doc.image,
        model,
        information_extracted: ref.information,
      });
      if (!encoding) throw new Error('Vibe 编码响应为空');
      const key = crypto
        .createHash('sha256')
        .update(`information_extracted:${ref.information}`)
        .digest('hex');
      doc.encodings[modelKey(model)] ??= {};
      doc.encodings[modelKey(model)][key] = {
        encoding,
        params: { information_extracted: ref.information },
      };
      save(doc);
      return { encoding, libraryId: doc.id, file: `${doc.id}.naiv4vibe` };
    },
  };
}
