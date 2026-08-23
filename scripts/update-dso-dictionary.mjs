import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDsoDictionary } from './lib/dsoDictionaryBuild.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = Object.freeze({
  repository: 'https://github.com/SuzumiyaAkizuki/DanbooruSearchOnline',
  commit: '0636f762694fc436b4ac472cf59b85d172eaaac4',
  files: {
    'origin_database/tags_enhanced.csv': '9b494660aa3e7ab45ea440b6c16223634c33be54a7e03f58749842ecbfec77fe',
    'origin_database/tag_groups.json': 'bfe7529f70ba8d367667b879f7db0d4302978aa8f7c2ff72273014533d6bee96',
    LICENSE: '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986',
  },
});

const vendorRoot = path.join(ROOT, 'third_party', 'DanbooruSearchOnline');
const generatedPath = path.join(ROOT, 'electron', 'data', 'dso-dictionary.json');
const checkOnly = process.argv.includes('--check');

function digest(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

async function sourceBuffer(relativePath) {
  const localPath = path.join(vendorRoot, ...relativePath.split('/'));
  let buffer;
  if (checkOnly) buffer = await fs.readFile(localPath);
  else {
    const response = await fetch(`https://raw.githubusercontent.com/SuzumiyaAkizuki/DanbooruSearchOnline/${SOURCE.commit}/${relativePath}`);
    if (!response.ok) throw new Error(`${relativePath} 下载失败（HTTP ${response.status}）`);
    buffer = Buffer.from(await response.arrayBuffer());
  }
  const actual = digest(buffer);
  if (actual !== SOURCE.files[relativePath]) throw new Error(`${relativePath} SHA-256 不匹配：${actual}`);
  if (!checkOnly) {
    await fs.mkdir(path.dirname(localPath), { recursive: true });
    await fs.writeFile(localPath, buffer);
  }
  return buffer;
}

const [csv, groups] = await Promise.all([
  sourceBuffer('origin_database/tags_enhanced.csv'),
  sourceBuffer('origin_database/tag_groups.json'),
  sourceBuffer('LICENSE'),
]);
const dictionary = buildDsoDictionary(new TextDecoder('gb18030').decode(csv), groups.toString('utf8'), SOURCE);
const output = `${JSON.stringify(dictionary)}\n`;

if (checkOnly) {
  const current = await fs.readFile(generatedPath, 'utf8');
  if (current !== output) throw new Error('DSO 运行时词典不是由当前固定源数据生成的，请运行 npm run dso:update');
  console.log(`DSO 数据验证通过：${dictionary.stats.entries} 个 Tag，${dictionary.stats.groups} 个 Tag Group`);
} else {
  await fs.mkdir(path.dirname(generatedPath), { recursive: true });
  await fs.writeFile(generatedPath, output);
  console.log(`DSO 数据已更新：${dictionary.stats.entries} 个 Tag，${dictionary.stats.groups} 个 Tag Group`);
}
