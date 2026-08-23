import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@lobehub/ui', () => ({
  Icon: ({ icon: Component, ...props }) => <Component {...props}/>,
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  Button: ({ children, icon, ...props }) => <button {...props}>{icon}{children}</button>,
  Input: (props) => <input {...props}/>,
  Segmented: ({ options = [], value }) => <div>{options.find((option) => option.value === value)?.label}</div>,
}));

import HelpCenter from './HelpCenter.jsx';

describe('HelpCenter', () => {
  it('ships task-oriented help and feedback actions with the application', () => {
    const html = renderToStaticMarkup(<HelpCenter
      currentVersion="0.9.2"
      platform="win32"
      studio={{ openReleasePage: async () => ({ ok: true }) }}
    />);

    expect(html).toContain('帮助与反馈');
    expect(html).toContain('快速开始');
    expect(html).toContain('打开图片，找到并复制 Prompt');
    expect(html).toContain('报告问题');
    expect(html).toContain('提出建议');
    expect(html).not.toContain('<img');
  });
});
