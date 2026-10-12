import fs from 'node:fs';
import path from 'node:path';

// Pause a real fixture read, without replacing its bytes or importer results.
// Used to keep an in-progress import stable while capturing both themes.
export function pauseFileRead(filePath) {
  const original = fs.createReadStream;
  let release;
  let reached = false;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  fs.createReadStream = (file, options = {}) => {
    if (typeof file !== 'string' || path.resolve(file) !== path.resolve(filePath))
      return original(file, options);
    const backend = { open: fs.open, read: fs.read, close: fs.close, ...options.fs };
    return original(file, {
      ...options,
      fs: {
        ...backend,
        open: (...args) => {
          reached = true;
          void gate.then(() => backend.open(...args));
        },
      },
    });
  };
  return {
    reached: () => reached,
    restore: () => {
      fs.createReadStream = original;
      release();
    },
  };
}
