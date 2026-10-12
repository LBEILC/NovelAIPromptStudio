import { TAG_TRANSLATION_BATCH_SIZE, translateTags } from './translation.js';

export async function retranslateDictionary({
  tags,
  database,
  settings,
  fetcher,
  signal,
  progress = () => {},
}) {
  if (!String(settings.model || '').trim()) throw Error('请先配置 AI 服务');
  const entries = [...database.lookupTagDictionary(tags).values()];
  const failed = [];
  let completed = 0;
  let translated = 0;
  const report = () => ({
    total: entries.length,
    completed,
    translated,
    failed: [...failed],
    canceled: !!signal?.aborted,
  });
  progress(report());
  for (
    let offset = 0;
    offset < entries.length && !signal?.aborted;
    offset += TAG_TRANSLATION_BATCH_SIZE
  ) {
    const batch = entries.slice(offset, offset + TAG_TRANSLATION_BATCH_SIZE);
    try {
      const result = await translateTags(
        batch.map((entry) => entry.display_tag || entry.tag),
        settings,
        fetcher,
        signal,
      );
      if (signal?.aborted) break;
      batch.forEach((entry, index) => {
        if (database.replaceTagDictionaryAI(entry.tag, result.items[index], entry)) translated++;
        else failed.push({ tag: entry.tag, error: '条目已修改或删除，保留当前值' });
      });
    } catch (error) {
      if (signal?.aborted) break;
      failed.push(
        ...batch.map((entry) => ({
          tag: entry.tag,
          error: error instanceof Error ? error.message : String(error),
        })),
      );
    }
    completed += batch.length;
    progress(report());
  }
  return report();
}
