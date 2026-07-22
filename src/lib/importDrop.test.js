import { describe, expect, it } from 'vitest';
import { assessDroppedFiles, assessWorkbenchDroppedFiles } from './importDrop.js';

describe('external file drag assessment', () => {
  it('keeps the accept state while the operating system has not exposed names yet', () => {
    expect(assessDroppedFiles([])).toEqual({ count: null, valid: true, label: '文件', pendingDetails: true });
  });

  it('rejects known unsupported extensions and accepts mixed image/ZIP batches', () => {
    expect(assessDroppedFiles([{ name: 'notes.txt' }])).toMatchObject({ valid: false, count: 1 });
    expect(assessDroppedFiles([{ name: '参考图.PNG' }, { name: 'NovelAI 导出.zip' }])).toMatchObject({ valid: true, count: 2, label: '图片或 NovelAI ZIP' });
  });

  it('accepts exactly one workbench image and rejects ZIP or multi-image drops', () => {
    expect(assessWorkbenchDroppedFiles([])).toMatchObject({ valid: true, count: null, pendingDetails: true });
    expect(assessWorkbenchDroppedFiles([{ name: 'source.PNG' }])).toMatchObject({ valid: true, count: 1 });
    expect(assessWorkbenchDroppedFiles([{ name: 'source.png' }, { name: 'other.png' }])).toMatchObject({ valid: false, count: 2 });
    expect(assessWorkbenchDroppedFiles([{ name: 'export.zip' }])).toMatchObject({ valid: false, count: 1 });
  });
});
