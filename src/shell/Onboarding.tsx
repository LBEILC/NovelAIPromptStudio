// 首次引导（doc/design.md 2.29，1.6.3）：第一次打开时一张欢迎卡片，四页，每页一句话加一个按钮。
// 不做高亮按钮一步步点的教程。随时跳过（Esc、点外面、"跳过"都算）；"设置·关于与更新"里可以重新查看。
// 自动验收按 data-onboard / data-onboard-page 找元素（任务 065），改名要同步。
import { useState } from 'react';
import { Icon } from '../kit/controls';
import { Dialog } from '../kit/dialog';
import { useSwap } from '../kit/motion';

export type OnboardAction = 'recover' | 'folder' | 'token' | 'agent';
/** "重新查看引导"发这个窗口事件，App 收到后打开卡片 */
export const ONBOARDING_REPLAY = 'studio:onboarding-replay';
export const replayOnboarding = () => dispatchEvent(new Event(ONBOARDING_REPLAY));
const PAGES: {
  id: OnboardAction;
  icon: string;
  title: string;
  text: string;
  action: string;
}[] = [
  {
    id: 'recover',
    icon: 'image-add-line',
    title: '把图拖进来，找回提示词',
    text: 'NovelAI 生成的图里存着提示词和参数。把图拖进窗口，就能查看、翻译、整理和复制。',
    action: '打开图片',
  },
  {
    id: 'folder',
    icon: 'folder-add-line',
    title: '导入你的文件夹',
    text: '选一个存着图的文件夹，图片库按里面的文件夹建好收藏集；同一张图只存一份。',
    action: '导入文件夹',
  },
  {
    id: 'token',
    icon: 'key-2-line',
    title: '填上令牌，直接生成',
    text: '填好 NovelAI 的持久令牌（也可以用中转站），改完提示词就能生成新的一版，生成的图自动存进图片库。',
    action: '去填令牌',
  },
  {
    id: 'agent',
    icon: 'terminal-box-line',
    title: '交给 Agent 整理',
    text: '装上技能后，Claude Code、Codex 这类 Agent 可以读取图片和提示词、整理图片库、排队生成。',
    action: '设置 Agent',
  },
];

export function Onboarding({
  open,
  onClose,
  onAction,
}: {
  open: boolean;
  /** 看完、跳过都会调；由外面记成"看过" */
  onClose: () => void;
  /** 点了某一页的按钮：先关卡片，再去做这件事 */
  onAction: (action: OnboardAction) => void;
}) {
  const [at, setAt] = useState(0);
  const [dir, setDir] = useState(0);
  const go = (n: number) => {
    setDir(n > at ? 1 : -1);
    setAt(n);
  };
  const close = () => {
    onClose();
    // 卡片淡出以后再回到第一页，下次重新查看从头开始
    setTimeout(() => {
      setAt(0);
      setDir(0);
    }, 300);
  };
  const page = PAGES[at];
  const pages = useSwap(page, (p) => p.id);
  const last = at === PAGES.length - 1;
  return (
    <Dialog
      open={open}
      onClose={close}
      label="欢迎使用"
      className="onboard"
      initialFocus=".ob-next"
      data={{ 'data-onboard-page': page.id }}
    >
      <div className="ob">
        <div className="ob-swap swap">
          {pages.map(({ key, value, leaving }) => (
            <div
              key={key}
              className={`ob-page ${leaving ? 'leaving' : ''}`}
              data-enter={dir > 0 ? 'right' : dir < 0 ? 'left' : 'fade'}
              aria-hidden={leaving || undefined}
            >
              <span className="ob-ic">
                <Icon name={value.icon} />
              </span>
              <h3>{value.title}</h3>
              <p>{value.text}</p>
              <button
                className="btn"
                data-onboard={leaving ? undefined : 'action'}
                tabIndex={leaving ? -1 : undefined}
                onClick={() => {
                  close();
                  onAction(value.id);
                }}
              >
                {value.action}
              </button>
            </div>
          ))}
        </div>
        <div className="acts">
          <span className="ob-dots" aria-label={`第 ${at + 1} 页，共 ${PAGES.length} 页`}>
            {PAGES.map((p, i) => (
              <i key={p.id} className={i === at ? 'on' : ''} />
            ))}
          </span>
          <button className="btn quiet" data-onboard="skip" onClick={close}>
            跳过
          </button>
          {at > 0 && (
            <button className="btn" data-onboard="back" onClick={() => go(at - 1)}>
              上一页
            </button>
          )}
          {last ? (
            <button className="btn ink ob-next" data-onboard="done" onClick={close}>
              开始使用
            </button>
          ) : (
            <button className="btn ink ob-next" data-onboard="next" onClick={() => go(at + 1)}>
              下一页
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
