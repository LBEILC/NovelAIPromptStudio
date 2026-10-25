import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
let cached;

export function loadWindowsClipboard() {
  if (cached) return cached;
  const koffi = require('koffi');
  const user = koffi.load('user32.dll');
  const kernel = koffi.load('kernel32.dll');
  cached = createWindowsClipboard({
    open: user.func('int __stdcall OpenClipboard(void *owner)'),
    empty: user.func('int __stdcall EmptyClipboard()'),
    close: user.func('int __stdcall CloseClipboard()'),
    set: user.func('void * __stdcall SetClipboardData(uint32_t format, void *memory)'),
    register: user.func('uint32_t __stdcall RegisterClipboardFormatW(str16 name)'),
    available: user.func('int __stdcall IsClipboardFormatAvailable(uint32_t format)'),
    alloc: kernel.func('void * __stdcall GlobalAlloc(uint32_t flags, size_t size)'),
    lock: kernel.func('void * __stdcall GlobalLock(void *memory)'),
    unlock: kernel.func('int __stdcall GlobalUnlock(void *memory)'),
    free: kernel.func('void * __stdcall GlobalFree(void *memory)'),
    copy: (target, bytes) => koffi.encode(target, 'uint8_t', bytes, bytes.length),
  });
  return cached;
}

export function createWindowsClipboard(api, wait = delay) {
  return {
    isFormatAvailable: (format) => Boolean(api.available(format)),
    async write(formats, owner) {
      // A real HWND is required: EmptyClipboard with a NULL owner prevents SetClipboardData.
      if (!owner) throw Error('Clipboard owner window is unavailable');
      const handles = [];
      let opened = false;
      try {
        // Prepare all memory before emptying the clipboard; only untransferred handles are freed.
        for (const { format, bytes } of formats) {
          const id = typeof format === 'number' ? format : api.register(format);
          if (!id) throw Error('RegisterClipboardFormat failed');
          const memory = api.alloc(2, bytes.length); // GMEM_MOVEABLE
          if (!memory) throw Error('GlobalAlloc failed');
          const item = { id, memory };
          handles.push(item);
          const pointer = api.lock(memory);
          if (!pointer) throw Error('GlobalLock failed');
          try {
            api.copy(pointer, bytes);
          } finally {
            api.unlock(memory);
          }
        }
        for (let attempt = 0; attempt < 5; attempt++) {
          if (api.open(owner)) {
            opened = true;
            break;
          }
          if (attempt < 4) await wait(40);
        }
        if (!opened) throw Error('OpenClipboard failed after 5 attempts');
        if (!api.empty()) throw Error('EmptyClipboard failed');
        for (const item of handles) {
          if (!api.set(item.id, item.memory)) throw Error('SetClipboardData failed');
          item.memory = null; // Windows owns this allocation now.
        }
      } finally {
        if (opened) api.close();
        for (const { memory } of handles) if (memory) api.free(memory);
      }
    },
  };
}
