// 完整引导（doc/design.md 2.36，1.8.2；最早 2.29、1.6.3）：新装第一次打开时一张卡片，按要做的事分 6 页，
// 最后一页"还有很多功能"打开帮助页的功能一览（引导自己不再列功能，清单只维护一份）。
// 每页上面一块用产品组件拼的示意（onboardArt.tsx），下面标题、两三条短说明和一个按钮。
// 不做高亮按钮一步步点的教程。随时跳过（Esc、点外面、"跳过"都算）；"设置·帮助"里可以重新查看。
// 自动验收按 data-onboard / data-onboard-page 找元素（任务 065），改名要同步。
import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../kit/dialog';
import { useSwap } from '../kit/motion';
import { OnboardArt } from './onboardArt';

export type OnboardAction = 'recover' | 'tidy' | 'folder' | 'token' | 'fix' | 'agent' | 'help';
/** "重新查看引导"发这个窗口事件，App 收到后打开卡片 */
export const ONBOARDING_REPLAY = 'studio:onboarding-replay';
export const replayOnboarding = () => dispatchEvent(new Event(ONBOARDING_REPLAY));
const PAGES: {
  id: OnboardAction;
  title: string;
  points: string[];
  action: string;
}[] = [
  {
    id: 'recover',
    title: '把图拖进来，找回提示词',
    points: [
      'NovelAI 生成的图里存着提示词和参数，拖进窗口、粘贴或者打开都行',
      '提示词按块显示，Tag 带分类颜色和中文译文',
      '一键复制整段，也可以只复制一块',
    ],
    action: '打开图片',
  },
  {
    id: 'tidy',
    title: '整理提示词',
    points: [
      '点 Tag 改译文、调权重；拖动换位置',
      '改过的译文记进翻译词典，以后同一个 Tag 都用它',
      'Ctrl E 换成文本方式，像 NovelAI 网页那样直接改文字',
    ],
    action: '打开翻译词典',
  },
  {
    id: 'folder',
    title: '把图都放进图片库',
    points: [
      '导入一个文件夹，按里面的文件夹建好收藏集；同一张图只存一份',
      '按 Tag、模型、日期搜索和筛选',
      '删掉的先进回收站，图片库也能整个导出备份',
    ],
    action: '导入文件夹',
  },
  {
    id: 'token',
    title: '填上令牌，直接生成',
    points: [
      '填好 NovelAI 的持久令牌（也可以用中转站），改完提示词就能生成新的一版',
      '"生成"旁边一直写着要花多少，不在免费范围时会说明原因',
      '每一版写着改了什么，从旧版本生成会自动分出分支',
    ],
    action: '去填令牌',
  },
  {
    id: 'fix',
    title: '放大、增强和局部重绘',
    points: [
      '放大和增强在图片下面，浮层里先写好结果尺寸和价格',
      '局部重绘：在大图上涂要修的地方，按免费尺寸重画后自动贴回',
      '修完可以和修之前并排看，或者叠在一起拖分界线看',
    ],
    action: '去工作台',
  },
  {
    id: 'agent',
    title: '交给 Agent 整理',
    points: [
      '装上技能后，Claude Code、Codex 这类 Agent 可以读取图片和提示词',
      '整理图片库、改提示词、排队生成；要花钱的生成默认等你确认',
    ],
    action: '设置 Agent',
  },
  {
    id: 'help',
    title: '还有很多功能',
    points: ['设置里的"帮助"页列着所有功能，可以搜索，点一下就跳过去', '快捷键和这份引导也在那里'],
    action: '打开功能一览',
  },
];
const ART = {
  recover: 'recover',
  tidy: 'tidy',
  folder: 'folder',
  token: 'token',
  fix: 'fix',
  agent: 'agent',
  help: 'more',
} as const;

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
  const reset = useRef(0);
  const close = () => {
    onClose();
    // 卡片淡出以后再回到第一页，下次重新查看从头开始
    reset.current = window.setTimeout(() => {
      reset.current = 0;
      setAt(0);
      setDir(0);
    }, 300);
  };
  // 淡出还没完就又打开：直接回到第一页，不留着等会儿把翻到的页拨回去（080 汇报）
  useEffect(() => {
    if (!open || !reset.current) return;
    clearTimeout(reset.current);
    reset.current = 0;
    setAt(0);
    setDir(0);
  }, [open]);
  useEffect(() => () => clearTimeout(reset.current), []);
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
              <OnboardArt id={ART[value.id]} />
              <h3>{value.title}</h3>
              <ul className="ob-points">
                {value.points.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
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
