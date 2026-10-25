import { describe, expect, it } from 'vitest';
import { controlConflicts, isV5Model, matchControl, suggestControls } from './v5Controls';

describe('V5 控制词', () => {
  it('认得官方写法，并给出中文名', () => {
    expect(matchControl('high complexity')?.name).toBe('复杂度·高');
    expect(matchControl('transparent background')?.name).toBe('透明背景');
    expect(matchControl('visual novel sprite')?.name).toBe('视觉小说·立绘');
    expect(matchControl('high complexity')?.nonstandard).toBe(false);
    expect(matchControl('blue hair')).toBeNull();
  });

  it('大小写、下划线、meta 冒号后的空格也认，但标成不标准', () => {
    expect(matchControl('High_Complexity')).toMatchObject({ nonstandard: true });
    const meta = matchControl('meta: novel era');
    expect(meta?.item.tag).toBe('meta:novel era');
    expect(meta?.nonstandard).toBe(true);
  });

  it('同一个互斥组写了两种档位才算冲突', () => {
    const tag = (key: string, text: string) => ({ key, tag: { tag: text } });
    const clash = controlConflicts([
      tag('a', 'low complexity'),
      tag('b', 'high complexity'),
      tag('c', 'transparent background'),
      tag('d', 'has alpha'),
    ]);
    expect([...clash.keys()].sort()).toEqual(['a', 'b']);
    expect(controlConflicts([tag('a', 'high complexity'), tag('b', 'high complexity')]).size).toBe(
      0,
    );
  });

  it('补全能用中文名和英文找到', () => {
    expect(suggestControls('立绘').map((x) => x.tag)).toEqual(['visual novel sprite']);
    expect(suggestControls('复杂度', 4)).toHaveLength(4);
    expect(suggestControls('depth')[0].tag).toBe('depthness');
    expect(suggestControls('')).toEqual([]);
  });

  it('只有 V5 模型算 V5', () => {
    expect(isV5Model('nai-diffusion-5-full')).toBe(true);
    expect(isV5Model('nai-diffusion-4-5-full')).toBe(false);
    expect(isV5Model(undefined)).toBe(false);
  });
});
