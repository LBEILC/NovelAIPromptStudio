// 帮助（doc/design.md 2.36）：三个页签——功能、快捷键、反馈（用户 10-27：原来一页铺开 44 个功能，太长）。
// 功能：搜索加分组切换，一个功能一行（名称和一句说明），整行点下去跳过去并指出控件（2.40）；
// "在哪"平时放进悬停提示，搜索时直接显示。几个常用、难懂或不好找的功能带"演示"（helpDemos.tsx）。
// 没有快捷键打开这一页（用户 10-25）。记住上次的页签和分组。
import { Fragment, useRef, useState } from 'react';
import { invokeUI } from '../lib/commands';
import { writeClipboardText } from '../lib/clipboard';
import { Icon, Kbd, Seg } from '../kit/controls';
import { useIndicator } from '../kit/motion';
import { useNotifications } from '../kit/toast';
import { useUpdates } from '../state/updates';
import { pointAt } from '../kit/spotlight';
import { replayOnboarding } from '../shell/Onboarding';
import { ISSUES, feedbackDiagnostics } from './About';
import { FEATURES, type Feature, type FeatureTarget } from './features';
import { HelpDemo } from './helpDemos';
import { Row, SetPage, errorText } from './parts';

// 快捷键按在哪里用分成三组；以产品实际绑定的为准
const KEYS: [string, [string, ...string[][]][]][] = [
  [
    '通用',
    [
      ['打开图片；在图片库里是导入', ['Mod', 'I']],
      ['从剪贴板打开或导入图片', ['Mod', 'V']],
      ['聚焦搜索框', ['Mod', 'K']],
      ['下一个 / 上一个标签页', ['Mod', 'Tab'], ['Mod', 'Shift', 'Tab']],
      ['关闭当前标签页', ['Mod', 'W']],
    ],
  ],
  [
    '工作台',
    [
      ['切换按块 / 按文本编辑', ['Mod', 'E']],
      ['移动当前 Tag 或块', ['Alt', '方向键']],
      ['在这一版的图之间切换', ['←'], ['→']],
      ['取消选择', ['Esc']],
    ],
  ],
  [
    '图片库',
    [
      ['在图片之间移动', ['方向键']],
      ['在工作台打开', ['Enter']],
      ['看大图', ['Space']],
      ['大图里换一张 / 换一组', ['← →'], ['↑ ↓']],
      ['全选图片', ['Mod', 'A']],
      ['取消选择；关闭大图', ['Esc']],
    ],
  ],
];
const TABS = [
  ['features', '功能'],
  ['keys', '快捷键'],
  ['feedback', '反馈'],
] as const;
type Tab = (typeof TABS)[number][0];
const GROUPS = ['全部', ...FEATURES.map((g) => g.group)];
// 记住上次的页签和分组；读不到（隐私模式、清过数据）就用默认的
const recall = <T extends string>(key: string, ok: readonly string[], fallback: T): T => {
  try {
    const v = localStorage.getItem(key);
    return v && ok.includes(v) ? (v as T) : fallback;
  } catch {
    return fallback;
  }
};
const remember = (key: string, v: string) => {
  try {
    localStorage.setItem(key, v);
  } catch {
    // 存不下就算了，下次用默认的
  }
};
const GO_NAME: Record<string, string> = {
  workbench: '工作台',
  gallery: '图片库',
  materials: '素材',
};

export function Help({ onGo }: { onGo: (target: FeatureTarget) => void }) {
  const notify = useNotifications();
  const st = useUpdates().state;
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>(() =>
    recall(
      'nps.help-tab',
      TABS.map((t) => t[0]),
      'features',
    ),
  );
  const [group, setGroup] = useState<string>(() => recall('nps.help-group', GROUPS, '工作台'));
  const [demo, setDemo] = useState('');
  const tabs = useRef<HTMLSpanElement>(null);
  useIndicator(tabs, [tab]);
  const search = useRef<HTMLInputElement>(null);
  const query = q.trim().toLowerCase();
  // 有搜索词时跨组搜，分组切换显示"全部"；清掉搜索回到原来的分组
  const shown = query ? '全部' : group;
  const groups = FEATURES.filter((g) => shown === '全部' || g.group === shown)
    .map((g) => ({
      ...g,
      items: query
        ? g.items.filter((f) => `${f.name}${f.text}${f.where}`.toLowerCase().includes(query))
        : g.items,
    }))
    .filter((g) => g.items.length);
  const pickTab = (t: Tab) => {
    setTab(t);
    remember('nps.help-tab', t);
  };
  const go = (f: Feature) => {
    onGo(f.go);
    void pointAt(f.point).then((found) => {
      if (!found) notify({ text: `${f.name}在：${f.where}`, tone: 'info', duration: 6000 });
    });
  };
  const open = (url: string) =>
    void invokeUI('updates.open-release', { url }).then(
      () => notify({ text: '已在浏览器中打开', tone: 'success' }),
      (e) => notify({ text: errorText(e), tone: 'error' }),
    );
  const copy = async () => {
    try {
      await writeClipboardText(feedbackDiagnostics(st?.currentVersion, st?.platform));
      notify({ text: '已复制诊断信息', tone: 'success' });
    } catch {
      notify({ text: '复制诊断信息失败', tone: 'error' });
    }
  };
  return (
    <SetPage title="帮助">
      <span className="help-tabs has-ind" ref={tabs} role="tablist" aria-label="帮助">
        <i className="ind" />
        {TABS.map(([k, name]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? 'on' : ''}
            data-help-tab={k}
            onClick={() => pickTab(k)}
          >
            {name}
          </button>
        ))}
      </span>
      {tab === 'features' && (
        <div className="help-pane" data-enter="fade">
          <div className="help-bar">
            <label className="field sm help-search">
              <Icon name="search-line" />
              <input
                ref={search}
                placeholder="搜索功能"
                aria-label="搜索功能"
                autoComplete="off"
                spellCheck={false}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && q) {
                    e.stopPropagation();
                    setQ('');
                  }
                }}
              />
              {q && (
                <button
                  className="btn quiet sm icon lq-x"
                  aria-label="清除搜索"
                  onClick={() => {
                    setQ('');
                    search.current?.focus();
                  }}
                >
                  <Icon name="close-line" />
                </button>
              )}
            </label>
            <span className="sp" />
            <button className="btn quiet sm" data-onboard="replay" onClick={replayOnboarding}>
              <Icon name="play-circle-line" />
              重新看引导
            </button>
          </div>
          <Seg
            items={GROUPS.map((g) => [g, g] as const)}
            value={shown}
            label="功能分组"
            className="help-groups"
            onChange={(g) => {
              setQ('');
              setGroup(g);
              remember('nps.help-group', g);
            }}
          />
          <div className={`help-feats ${query ? 'searching' : ''}`}>
            {groups.length ? (
              groups.map((g) => (
                <div className="feat-group" key={g.group} data-feature-group={g.group}>
                  {shown === '全部' && <span className="label">{g.group}</span>}
                  {g.items.map((f) => (
                    <Fragment key={f.name}>
                      <div className="feat-row">
                        <button
                          className="feat-go"
                          data-tip={query ? undefined : f.where}
                          onClick={() => go(f)}
                        >
                          <span className="feat-name">{f.name}</span>
                          <span className="feat-text">{f.text}</span>
                          <span className="feat-where">{f.where}</span>
                          <Icon name="arrow-right-s-line" className="feat-arrow" />
                        </button>
                        {f.demo && (
                          <button
                            className={`btn quiet sm feat-demo ${demo === f.name ? 'on' : ''}`}
                            aria-expanded={demo === f.name}
                            onClick={() => setDemo(demo === f.name ? '' : f.name)}
                          >
                            <Icon
                              name={demo === f.name ? 'stop-circle-line' : 'play-circle-line'}
                            />
                            演示
                          </button>
                        )}
                      </div>
                      {f.demo && demo === f.name && (
                        <div className="feat-demo-box" data-enter="fade">
                          <HelpDemo id={f.demo} />
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
              ))
            ) : (
              <p className="help feat-none">没有找到"{q.trim()}"相关的功能</p>
            )}
          </div>
        </div>
      )}
      {tab === 'keys' && (
        <div className="help-pane" data-enter="fade">
          <div className="help">
            macOS 上 Ctrl 对应 Command。在输入框里，Ctrl V 仍然是普通的粘贴。
          </div>
          <div className="help-keys">
            {KEYS.map(([group, rows]) => (
              <div className="key-group" key={group}>
                <span className="label">{group}</span>
                {rows.map(([title, ...binds]) => (
                  <div className="setrow keyrow" key={title}>
                    <div>{title}</div>
                    <span className="keys">
                      {binds.map((keys, i) => (
                        <Fragment key={i}>
                          {i > 0 && <span className="key-sep">/</span>}
                          {keys.map((k) => (
                            <Kbd key={k} keys={k} />
                          ))}
                        </Fragment>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
      {tab === 'feedback' && (
        <div className="help-pane" data-enter="fade">
          <Row title="报告问题或提出建议" help="会在浏览器里打开 GitHub，不会自动附带任何数据">
            <span className="row">
              <button
                className="btn sm"
                onClick={() => open(`${ISSUES}?labels=bug&title=%5B%E9%97%AE%E9%A2%98%5D%20`)}
              >
                报告问题
              </button>
              <button
                className="btn sm"
                onClick={() =>
                  open(`${ISSUES}?labels=enhancement&title=%5B%E5%BB%BA%E8%AE%AE%5D%20`)
                }
              >
                提出建议
              </button>
            </span>
          </Row>
          <Row title="诊断信息" help="只包含软件版本和操作系统，不包含图片、提示词和路径">
            <button className="btn quiet sm" onClick={() => void copy()}>
              复制
            </button>
          </Row>
        </div>
      )}
    </SetPage>
  );
}
