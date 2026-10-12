import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { About, feedbackDiagnostics } from './SettingsPage';

describe('about and feedback migration', () => {
  it('keeps feedback and privacy copy available in About', () => {
    const html = renderToStaticMarkup(<About onInstallUpdate={async () => {}} />);
    for (const text of [
      '反馈与支持',
      '诊断信息',
      '报告问题',
      '提出建议',
      '只包含软件版本和操作系统，不包含图片、提示词和路径',
      '不会自动附带任何数据',
      '非官方工具，与 NovelAI 没有隶属关系。',
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('搜索帮助');
    expect(html).not.toContain('帮助主题');
  });
  it('limits diagnostics to version and platform', () => {
    expect(feedbackDiagnostics('0.9.2', 'darwin')).toBe(
      'NovelAI Prompt Studio v0.9.2\n平台：macOS',
    );
    expect(feedbackDiagnostics('0.9.2', 'win32')).toBe(
      'NovelAI Prompt Studio v0.9.2\n平台：Windows',
    );
  });
});
