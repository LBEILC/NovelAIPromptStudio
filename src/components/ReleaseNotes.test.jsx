import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ReleaseNotes from './ReleaseNotes.jsx';

describe('ReleaseNotes', () => {
  it('renders GitHub HTML release notes as formatted content', () => {
    const html = renderToStaticMarkup(<ReleaseNotes>{'<h2>重点更新</h2><ul><li><strong>修复更新</strong>：<code>latest.yml</code></li></ul>'}</ReleaseNotes>);

    expect(html).toContain('<h2>重点更新</h2>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<strong>修复更新</strong>');
    expect(html).toContain('<code>latest.yml</code>');
  });

  it('renders Markdown release notes', () => {
    const html = renderToStaticMarkup(<ReleaseNotes>{'## 体验与修复\n\n- **支持** `blockmap`'}</ReleaseNotes>);

    expect(html).toContain('<h2>体验与修复</h2>');
    expect(html).toContain('<strong>支持</strong>');
    expect(html).toContain('<code>blockmap</code>');
  });

  it('removes executable HTML and unsafe URLs', () => {
    const html = renderToStaticMarkup(<ReleaseNotes>{'<p onclick="alert(1)">安全内容</p><script>alert(1)</script><a href="javascript:alert(1)">危险链接</a>'}</ReleaseNotes>);

    expect(html).toContain('安全内容');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('javascript:');
  });
});
