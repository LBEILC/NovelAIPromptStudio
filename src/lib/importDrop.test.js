import { describe, expect, it } from 'vitest';
import { assessDroppedFiles } from './importDrop.js';

describe('external file drag assessment', () => {
  it('keeps the accept state while the operating system has not exposed names yet', () => {
    expect(assessDroppedFiles([])).toEqual({ count: null, valid: true, label: '文件', pendingDetails: true });
  });

  it('rejects known unsupported extensions and accepts mixed image/ZIP batches', () => {
    expect(assessDroppedFiles([{ name: 'notes.txt' }])).toMatchObject({ valid: false, count: 1 });
    expect(assessDroppedFiles([{ name: '参考图.PNG' }, { name: 'NovelAI 导出.zip' }])).toMatchObject({ valid: true, count: 2, label: '图片或 NovelAI ZIP' });
  });
});
