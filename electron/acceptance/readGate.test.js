import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { pauseFileRead } from './readGate.js';

it('holds only the selected real read and restores the stream API and original bytes', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'acceptance-read-gate-'));
  const target = path.join(root, 'target.txt');
  const other = path.join(root, 'other.txt');
  fs.writeFileSync(target, 'actual target');
  fs.writeFileSync(other, 'unrelated');
  const original = fs.createReadStream;
  const gate = pauseFileRead(target);
  try {
    let completed = false;
    const read = (file) =>
      new Promise((resolve, reject) => {
        let text = '';
        fs.createReadStream(file, { encoding: 'utf8' })
          .on('data', (chunk) => {
            text += chunk;
          })
          .on('error', reject)
          .on('end', () => resolve(text));
      });
    const pending = read(target).then((text) => {
      completed = true;
      return text;
    });
    expect(await read(other)).toBe('unrelated');
    expect(gate.reached()).toBe(true);
    expect(completed).toBe(false);
    gate.restore();
    expect(fs.createReadStream).toBe(original);
    expect(await pending).toBe('actual target');
  } finally {
    gate.restore();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
