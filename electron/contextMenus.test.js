import { describe, expect, it, vi } from 'vitest';
import { buildContextMenuTemplate } from './contextMenus.js';

function labels(template) {
  return template.filter((item) => item.label).map((item) => item.label);
}

describe('native context menu templates', () => {
  it('uses native edit roles for text fields', () => {
    expect(buildContextMenuTemplate({ kind: 'text' }).map((item) => item.role).filter(Boolean)).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
  });

  it('sanitizes collections and returns a stable project action', () => {
    const select = vi.fn();
    const template = buildContextMenuTemplate({ kind: 'project', favorite: false, collections: [{ id: 'one', name: '测试组' }, { id: '', name: 'bad' }] }, select);
    expect(labels(template)).toContain('收藏');
    const submenu = template.find((item) => item.label === '加入收藏集').submenu;
    expect(submenu).toHaveLength(1);
    submenu[0].click();
    expect(select).toHaveBeenCalledWith('project:add-collection:one');
  });

  it('only exposes valid branch actions for the current state', () => {
    expect(labels(buildContextMenuTemplate({ kind: 'branch', status: 'draft' }))).toContain('标记为待生成');
    expect(labels(buildContextMenuTemplate({ kind: 'branch', status: 'draft' }))).not.toContain('上传结果图');
    expect(labels(buildContextMenuTemplate({ kind: 'branch', status: 'waiting' }))).toContain('上传结果图');
  });
});
