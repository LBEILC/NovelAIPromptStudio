import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@lobehub/ui', () => ({
  Icon: ({ icon: Component, ...props }) => <Component {...props}/>,
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  Button: ({ children, icon, ...props }) => <button {...props}>{icon}{children}</button>,
  Input: (props) => <input {...props}/>,
  Segmented: ({ onChange, options = [], size, value, ...props }) => <div {...props}>{options.find((option) => option.value === value)?.label}</div>,
}));

import HelpCenter, { filterHelpTopics, HELP_GROUPS, HELP_TOPICS } from './HelpCenter.jsx';

describe('HelpCenter', () => {
  it('organizes bundled help into expandable task groups', () => {
    expect(HELP_GROUPS.map((group) => group.title)).toEqual(['开始使用', '工作台', '图片库', '参考与支持']);
    expect(HELP_GROUPS.every((group) => group.topics.length > 0)).toBe(true);
    expect(HELP_TOPICS).toHaveLength(16);
    expect(new Set(HELP_TOPICS.map((topic) => topic.id)).size).toBe(HELP_TOPICS.length);
  });

  it('searches task, troubleshooting, and privacy terminology locally', () => {
    expect(filterHelpTopics('来源不可用').map((topic) => topic.id)).toContain('troubleshooting');
    expect(filterHelpTopics('API Key').map((topic) => topic.id)).toContain('data');
    expect(filterHelpTopics('智能收藏集').map((topic) => topic.id)).toContain('gallery-find');
    expect(filterHelpTopics('DSO').map((topic) => topic.id)).toContain('translation-and-categories');
    expect(filterHelpTopics('未分类').map((topic) => topic.id)).toContain('translation-and-categories');
    expect(filterHelpTopics('按分类').map((topic) => topic.id)).toContain('translation-and-categories');
    expect(filterHelpTopics('不存在的帮助词')).toEqual([]);
  });

  it('ships task-oriented help and feedback actions with the application', () => {
    const html = renderToStaticMarkup(<HelpCenter
      currentVersion="0.9.2"
      platform="win32"
      studio={{ openReleasePage: async () => ({ ok: true }) }}
    />);
    const translationHtml = renderToStaticMarkup(HELP_TOPICS.find((topic) => topic.id === 'translation-and-categories').content);

    expect(html).toContain('帮助与反馈');
    expect(html).toContain('4 组 · 16 篇');
    expect(html).toContain('开始使用');
    expect(html).toContain('工作台');
    expect(html).toContain('图片库');
    expect(html).toContain('参考与支持');
    expect(html.match(/<details/g)).toHaveLength(4);
    expect(html).toContain('从一张图片开始');
    expect(html).toContain('打开图片，找到并复制 Prompt');
    expect(html).toContain('翻译与分类 Tag');
    expect(html).toContain('读懂分类视图，并整理当前需要的 Tag');
    expect(translationHtml).toContain('翻译分类演示分组方式');
    expect(translationHtml).toContain('按钮只处理当前可见的 4 个 Tag');
    expect(translationHtml).toContain('你的修正');
    expect(translationHtml).toContain('可选 AI');
    expect(html).toContain('<h3>从一张图片开始</h3><p>打开图片，找到并复制 Prompt</p>');
    expect(html).toContain('报告问题');
    expect(html).toContain('提出建议');
    expect(html).not.toContain('<img');
  });
});
