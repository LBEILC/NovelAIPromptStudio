// 设置（doc/design.md 2.11）：左边分类（当前项的底色会滑），右边换内容时旧的淡出、新的淡入。
// 各页的状态在切走后保留（例如 AI 服务没保存的修改）。
import { Activity, useEffect, useRef, useState } from 'react';
import { Icon } from '../kit/controls';
import { useIndicator, useSwap } from '../kit/motion';
import { About } from './About';
import { Help } from './Help';
import type { FeatureTarget } from './features';
import { Backup } from './Backup';
import { Dictionary } from './Dictionary';
import { Network } from './Network';
import { Account, Agent, AI, Appearance, Storage } from './sections';

export { About, feedbackDiagnostics } from './About';

const SECS = [
  ['appearance', '通用', 'equalizer-line'],
  ['storage', '图片库', 'hard-drive-2-line'],
  ['backup', '备份与恢复', 'archive-line'],
  ['novelai', 'NovelAI 账号', 'key-2-line'],
  ['ai', 'AI 服务', 'translate-2'],
  ['network', '网络', 'global-line'],
  ['tags', '翻译词典', 'book-2-line'],
  ['agent', 'Agent', 'terminal-box-line'],
  ['help', '帮助', 'question-line'],
  ['updates', '关于与更新', 'information-line'],
] as const;
type Sec = (typeof SECS)[number][0];

export default function SettingsPage(props: {
  onAccountSaved?: () => void;
  menuDestination?: { section: string } | null;
  onFindTag?: (tag: string) => void;
  onInstallUpdate: () => Promise<unknown>;
  onLibraryChange: () => Promise<unknown>;
  onEmptyTrash: () => Promise<unknown>;
  /** 帮助页功能一览的"去看看" */
  onGo: (target: FeatureTarget) => void;
}) {
  const [sec, setSec] = useState<Sec>(
    ((window as Window & { studioScreenshot?: { section?: string } }).studioScreenshot
      ?.section as Sec) || 'appearance',
  );
  useEffect(() => {
    const s = props.menuDestination?.section as Sec | undefined;
    if (s && SECS.some(([k]) => k === s)) setSec(s);
  }, [props.menuDestination]);
  const side = useRef<HTMLElement>(null);
  useIndicator(side, [sec]);
  const swap = useSwap(sec, (v) => v);
  const body = (k: Sec) => {
    switch (k) {
      case 'appearance':
        return <Appearance />;
      case 'storage':
        return (
          <Storage onLibraryChange={props.onLibraryChange} onEmptyTrash={props.onEmptyTrash} />
        );
      case 'novelai':
        return <Account onSaved={props.onAccountSaved} />;
      case 'ai':
        return <AI />;
      case 'tags':
        return <Dictionary onFindTag={props.onFindTag} />;
      case 'agent':
        return <Agent />;
      case 'network':
        return <Network />;
      case 'backup':
        return <Backup />;
      case 'help':
        return <Help onGo={props.onGo} />;
      default:
        return <About onInstallUpdate={props.onInstallUpdate} />;
    }
  };
  return (
    <div className="body setp">
      <nav className="set-side has-ind" ref={side} aria-label="设置分类">
        <i className="ind" />
        {SECS.map(([k, label, icon]) => (
          <button
            key={k}
            className={`it ${sec === k ? 'on' : ''}`}
            aria-current={sec === k ? 'page' : undefined}
            data-settings-target={k}
            onClick={() => setSec(k)}
          >
            <Icon name={icon} />
            {label}
          </button>
        ))}
      </nav>
      <div className="col set-col">
        <div className="swap setswap">
          {SECS.map(([k]) => {
            const it = swap.find((x) => x.key === k);
            return (
              <Activity key={k} mode={it ? 'visible' : 'hidden'}>
                <div
                  className={`set-pane ${it?.leaving ? 'leaving' : ''}`}
                  data-enter="fade"
                  data-settings-section={k}
                >
                  {body(k)}
                </div>
              </Activity>
            );
          })}
        </div>
      </div>
    </div>
  );
}
