import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@lobehub/ui', () => ({
  Icon: ({ icon: Component, ...props }) => <Component {...props}/>,
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  Button: ({ children, icon, type, ...props }) => <button {...props} type={type === 'submit' || type === 'reset' ? type : 'button'}>{icon}{children}</button>,
}));

import FeedbackCenter, { feedbackDiagnostics } from './FeedbackCenter.jsx';

describe('FeedbackCenter', () => {
  it('keeps feedback available without exposing the unfinished help center', () => {
    const html = renderToStaticMarkup(<FeedbackCenter
      currentVersion="0.9.2"
      platform="win32"
      studio={{ openReleasePage: async () => ({ ok: true }) }}
    />);

    expect(html).toContain('反馈与支持');
    expect(html).toContain('复制诊断信息');
    expect(html).toContain('报告问题');
    expect(html).toContain('提出建议');
    expect(html).toContain('不会自动包含图片、Prompt、文件路径、API 地址、API Key 或日志');
    expect(html).not.toContain('搜索帮助');
    expect(html).not.toContain('帮助主题');
  });

  it('limits diagnostics to the version and platform', () => {
    expect(feedbackDiagnostics('0.9.2', 'darwin')).toBe('NovelAI Prompt Studio v0.9.2\n平台：macOS');
    expect(feedbackDiagnostics('0.9.2', 'win32')).toBe('NovelAI Prompt Studio v0.9.2\n平台：Windows');
  });
});
