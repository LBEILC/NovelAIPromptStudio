import { parentPort, workerData } from 'node:worker_threads';
import { createClipboardBitmap } from './clipboardBitmap.js';

parentPort.postMessage(
  await createClipboardBitmap(Buffer.from(workerData.bytes), workerData.format),
);
