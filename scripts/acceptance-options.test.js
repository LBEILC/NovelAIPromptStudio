import { expect, it } from 'vitest';
import { acceptanceOptions } from './acceptance-options.mjs';

it('limits CPU slowdown and rejects unknown categories before starting Electron', () => {
  for (const value of ['0', '2', '-4', 'NaN', '60'])
    expect(() => acceptanceOptions([`--slow=${value}`])).toThrow('--slow');
  expect(() => acceptanceOptions(['--category=missing'])).toThrow('category');
});

it('prepares only the fixture types a selected category needs', () => {
  expect(acceptanceOptions(['--category=设置·AI 服务', '--slow=4'], {})).toMatchObject({
    slow: 4,
    needsLibrary: false,
    needsDictionary: false,
    outputName: 'acceptance-slow-4-设置-AI 服务',
  });
  expect(acceptanceOptions(['--category=图片库·复制'])).toMatchObject({
    needsLibrary: true,
    needsDictionary: false,
  });
  expect(acceptanceOptions()).toMatchObject({ needsLibrary: true, needsDictionary: true });
});

it('gives a slowed complete process room while keeping a hard upper bound', () => {
  expect(acceptanceOptions([], {}).processTimeoutMs).toBe(600_000);
  expect(acceptanceOptions(['--slow=4'], {}).processTimeoutMs).toBe(1_800_000);
  expect(acceptanceOptions(['--slow=6'], {}).processTimeoutMs).toBe(1_800_000);
});

it('keeps the system-reduced full run separate from the subset and explicit-off runs', () => {
  expect(acceptanceOptions(['--reduced-motion', '--motion=system'], {})).toMatchObject({
    category: '全部',
    reducedMotion: true,
    motion: 'system',
    needsLibrary: true,
    needsDictionary: true,
    outputName: 'acceptance-reduced-system',
  });
  expect(
    acceptanceOptions(['--reduced-motion', '--motion=off', '--category=设置·外观'], {}),
  ).toMatchObject({
    category: '设置·外观',
    motion: 'off',
    outputName: 'acceptance-reduced-off-设置-外观',
    needsLibrary: false,
    needsDictionary: false,
  });
  expect(() => acceptanceOptions(['--motion=missing'], {})).toThrow('--motion');
});

it('selects the reduced subset fixtures and validates timing policy before launch', () => {
  expect(
    acceptanceOptions(['--category=减少动态效果', '--reduced-motion'], { CI: 'true' }),
  ).toMatchObject({
    timing: 'record',
    needsLibrary: true,
    needsDictionary: true,
    reducedMotion: true,
  });
  expect(acceptanceOptions(['--timing=strict'], { CI: 'true' }).timing).toBe('strict');
  expect(() => acceptanceOptions(['--timing=skip'], {})).toThrow('--timing');
  expect(() => acceptanceOptions(['--slow=4'], { CI: 'true' })).toThrow('--slow');
});

it('splits only the full suite into three shards', () => {
  expect(acceptanceOptions(['--shard=2/3'], {})).toMatchObject({
    shard: { index: 2, total: 3, restarts: true },
    outputName: 'acceptance-shard-2',
  });
  expect(acceptanceOptions([], {}).shard).toBeNull();
  expect(() => acceptanceOptions(['--shard=4/3'], {})).toThrow('--shard');
  expect(() => acceptanceOptions(['--shard=1/2'], {})).toThrow('--shard');
  expect(() => acceptanceOptions(['--shard=1/3', '--category=工作台'], {})).toThrow('--shard');
});
