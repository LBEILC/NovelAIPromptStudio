import { expect, it, vi } from 'vitest';
import { createWindowsClipboard } from './windowsClipboard.js';

function fixture() {
  let next = 10;
  return Object.fromEntries(
    Object.entries({
      open: () => 1,
      empty: () => 1,
      close: () => 1,
      set: (_id, memory) => memory,
      register: () => 100,
      available: () => 1,
      alloc: () => ++next,
      lock: (memory) => memory,
      unlock: () => 1,
      free: () => null,
      copy: () => {},
    }).map(([key, fn]) => [key, vi.fn(fn)]),
  );
}
const formats = [
  { format: 'PNG', bytes: Buffer.from('png') },
  { format: 17, bytes: Buffer.from('dib') },
];

it('retries busy clipboard asynchronously and transfers both handles in one open/close', async () => {
  const api = fixture(),
    wait = vi.fn();
  api.open.mockReturnValueOnce(0).mockReturnValueOnce(0);
  await createWindowsClipboard(api, wait).write(formats, 1n);
  expect(wait.mock.calls).toEqual([[40], [40]]);
  expect(api.empty).toHaveBeenCalledOnce();
  expect(api.set.mock.calls).toEqual([
    [100, 11],
    [17, 12],
  ]);
  expect(api.free).not.toHaveBeenCalled();
  expect(api.close).toHaveBeenCalledOnce();
});

it('releases allocations without emptying or closing when all open attempts fail', async () => {
  const api = fixture(),
    wait = vi.fn();
  api.open.mockReturnValue(0);
  await expect(createWindowsClipboard(api, wait).write(formats, 1n)).rejects.toThrow('5 attempts');
  expect(api.open).toHaveBeenCalledTimes(5);
  expect(wait).toHaveBeenCalledTimes(4);
  expect(api.empty).not.toHaveBeenCalled();
  expect(api.close).not.toHaveBeenCalled();
  expect(api.free.mock.calls).toEqual([[11], [12]]);
});

it('frees only untransferred memory after a partial write and closes the clipboard', async () => {
  const api = fixture();
  api.set.mockReturnValueOnce(11).mockReturnValueOnce(null);
  await expect(createWindowsClipboard(api).write(formats, 1n)).rejects.toThrow('SetClipboardData');
  expect(api.free.mock.calls).toEqual([[12]]);
  expect(api.close).toHaveBeenCalledOnce();
});

it('releases locked memory on conversion failure before opening the clipboard', async () => {
  const api = fixture();
  api.copy.mockImplementation(() => {
    throw Error('copy failed');
  });
  await expect(createWindowsClipboard(api).write(formats, 1n)).rejects.toThrow('copy failed');
  expect(api.unlock).toHaveBeenCalledWith(11);
  expect(api.free).toHaveBeenCalledWith(11);
  expect(api.open).not.toHaveBeenCalled();
});
