import { parentPort } from 'node:worker_threads';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { readNovelAIMetadata } from './metadata.js';

parentPort.on('message', async ({ file }) => {
  try {
    const buffer = await fs.readFile(file);
    const metadata = await readNovelAIMetadata(file, buffer);
    parentPort.postMessage({
      hash: crypto.createHash('sha256').update(buffer).digest('hex'),
      bytes: buffer.length,
      hasMetadata: Boolean(
        metadata.prompt_raw ||
          metadata.negative_prompt ||
          metadata.model ||
          metadata.seed ||
          metadata.steps,
      ),
    });
  } catch (error) {
    parentPort.postMessage({ error: error.message });
  }
});
