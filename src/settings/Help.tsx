// 帮助（doc/design.md 2.36，1.8.2）：最上面是功能一览（搜索、按工作台 / 生成和修图 / 图片库 / Agent 与设置分组，"去看看"直接跳过去），
// 下面是从"关于与更新"搬过来的快捷键、重新查看引导、报告问题和诊断信息。没有快捷键打开这一页（用户 10-25）。
import { Fragment, useRef, useState } from 'react';
import { invokeUI } from '../lib/commands';
import { writeClipboardText } from '../lib/clipboard';
import { Icon, Kbd } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { useUpdates } from '../state/updates';
import { replayOnboarding } from '../shell/Onboarding';
import { ISSUES, feedbackDiagnostics } from './About';
import { FEATURES, type FeatureTarget } from './features';
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
const GO_NAME: Record<string, string> = {
  workbench: '工作台',
  gallery: '图片库',
  materials: '素材',
};

export function Help({ onGo }: { onGo: (target: FeatureTarget) => void }) {
  const notify = useNotifications();
  const st = useUpdates().state;
  const [q, setQ] = useState('');
  const search = useRef<HTMLInputElement>(null);
  const query = q.trim().toLowerCase();
  const groups = FEATURES.map((g) => ({
    ...g,
    items: query
      ? g.items.filter((f) => `${f.name}${f.text}`.toLowerCase().includes(query))
      : g.items,
  })).filter((g) => g.items.length);
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
      <h2>功能一览</h2>
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
      {groups.length ? (
        groups.map((g) => (
          <div className="feat-group" key={g.group} data-feature-group={g.group}>
            <span className="label">{g.group}</span>
            {g.items.map((f) => (
              <Row key={f.name} title={f.name} help={f.text} className="feat-row">
                <button
                  className="btn quiet sm"
                  data-tip={`去${GO_NAME[f.go] || '设置里的这一页'}`}
                  onClick={() => onGo(f.go)}
                >
                  去看看
                  <Icon name="arrow-right-s-line" />
                </button>
              </Row>
            ))}
          </div>
        ))
      ) : (
        <p className="help feat-none">没有找到"{q.trim()}"相关的功能</p>
      )}
      <h2>快捷键</h2>
      <div className="help">macOS 上 Ctrl 对应 Command。在输入框里，Ctrl V 仍然是普通的粘贴。</div>
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
      <h2>引导</h2>
      <Row title="完整引导" help="新装第一次打开时的几页介绍">
        <button className="btn sm" data-onboard="replay" onClick={replayOnboarding}>
          重新查看
        </button>
      </Row>
      <h2>反馈与支持</h2>
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
            onClick={() => open(`${ISSUES}?labels=enhancement&title=%5B%E5%BB%BA%E8%AE%AE%5D%20`)}
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
    </SetPage>
  );
}
