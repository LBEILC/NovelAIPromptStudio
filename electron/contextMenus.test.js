import { describe, expect, it, vi } from 'vitest';
import { buildContextMenuTemplate } from './contextMenus.js';

function labels(template) {
  return template.filter((item) => item.label).map((item) => item.label);
}

describe('native context menu templates', () => {
  it('uses native edit roles for text fields', () => {
    expect(buildContextMenuTemplate({ kind: 'text' }).map((item) => item.role).filter(Boolean)).toEqual(['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll']);
  });

  it('keeps the image menu focused on workbench and removal', () => {
    const select = vi.fn();
    const template = buildContextMenuTemplate({ kind: 'project-simple' }, select);
    expect(labels(template)).toEqual(['在工作台中打开', '复制原始 Prompt', '在文件夹中显示', '从图片库移除']);
    template.find((item) => item.label === '在工作台中打开').click();
    expect(select).toHaveBeenCalledWith('project:open-workbench');
  });

  it('keeps translation and classification in the tag menu', () => {
    const template = buildContextMenuTemplate({ kind: 'tag', category: 'Artist', hasTranslation: true });
    expect(labels(template)).toContain('AI 翻译与分类');
    expect(template.find((item) => item.label === '设置分类').submenu).toHaveLength(6);
  });
});
