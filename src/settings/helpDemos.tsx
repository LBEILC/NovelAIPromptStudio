// 帮助页的功能演示（doc/design.md 2.36，用户 10-27）：只给几个常用、光看文字难懂、或者不好找的功能做，
// 不是每个功能都有。画法和首次引导的示意一样（src/shell/onboardArt.tsx）：用产品自己的 Tag、按钮、
// 缩略图的样子配固定的假数据拼一小块，不录屏，深浅色跟着走；整块 inert，点不到。
// 时间线是一串"步"：走到第几步，容器上就加上 s1…sN，元素用 --dur-2 / --dur-3 过渡到这一步的样子；
// 最后一步停一会儿，整块淡出，从头再来。动效关闭时直接停在最后一步，不循环。
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon, Kbd } from '../kit/controls';
import { motionOff } from '../kit/motion';
import type { DemoId } from './features';

// 每一步停多久（毫秒）；最后一项是最后一步停的时间
const STEPS: Record<DemoId, number[]> = {
  drag: [600, 500, 900, 500, 1600],
  compare: [500, 700, 500, 800, 700, 700, 900, 1600],
  inpaint: [500, 800, 400, 400, 400, 1600],
  pick: [500, 600, 400, 600, 400, 600, 400, 600, 400, 1600],
  random: [700, 800, 800, 800, 1600],
};
const OUT = 360;

function useSteps(id: DemoId) {
  const times = STEPS[id];
  const last = times.length - 1;
  const [step, setStep] = useState(() => (motionOff() ? last : 0));
  // run：一步步走；out：整块淡出；back：看不见的时候回到第 0 步再淡入，免得看见元素往回走
  const [phase, setPhase] = useState<'run' | 'out' | 'back'>('run');
  const out = phase !== 'run';
  useEffect(() => {
    if (motionOff()) return setStep(last);
    const t = window.setTimeout(
      () => {
        if (phase === 'out') return (setStep(0), setPhase('back'));
        if (phase === 'back') return setPhase('run');
        if (step < last) setStep(step + 1);
        else setPhase('out');
      },
      phase === 'run' ? times[step] : OUT,
    );
    return () => clearTimeout(t);
  }, [step, phase, id]);
  const cls = Array.from({ length: step }, (_, i) => `s${i + 1}`).join(' ');
  return `${cls} ${out ? 'out' : ''}`;
}

const tag = (en: string, zh: string, tc: string, cls = '') => (
  <span className={`tag ${cls}`} data-tc={tc}>
    <span className="t">
      <span className="en">{en}</span>
      <span className="zh">{zh}</span>
    </span>
  </span>
);
const Cur = ({ className = '' }: { className?: string }) => (
  <Icon name="cursor-fill" className={`hd-cur ${className}`} />
);
const thumb = (cls: string, style?: CSSProperties) => (
  <i className={`hd-th ${cls}`} style={style} />
);

const SCENES: Record<DemoId, () => ReactNode> = {
  // 按块整理：把最后一个 Tag 拖到第二个的位置，中间两个让开
  drag: () => (
    <div className="oba-card hd-card">
      <span className="oba-cap">TAG 块 · 4 个</span>
      <div className="hd-tags">
        {tag('1girl', '1名女孩', 'subject', 'hd-t0')}
        {tag('rain', '雨', 'environment', 'hd-t1')}
        {tag('umbrella', '雨伞', 'unsorted', 'hd-t2')}
        {tag('smile', '微笑', 'action', 'hd-t3')}
        <Cur className="hd-cur-drag" />
      </div>
      <span className="oba-note">按住拖到别的位置，别的块和别的节也行</span>
    </div>
  ),
  // 两张图对比：按住 Ctrl 点版本栏里的两张小图，右边出现对比，拖分界线
  compare: () => (
    <>
      <div className="hd-vers">
        {['第 1 版', '第 2 版', '第 3 版'].map((v, i) => (
          <span key={v}>
            {v}
            <span className="hd-ths">
              {thumb(i === 0 ? 'hd-a' : '')}
              {thumb(i === 2 ? 'hd-b' : '')}
            </span>
          </span>
        ))}
        <span className="hd-key">
          <Kbd keys="Mod" /> 点两张
        </span>
        <Cur className="hd-cur-cmp" />
      </div>
      <div className="hd-cmp">
        <i className="hd-cmp-l" />
        <i className="hd-cmp-r" />
        <i className="hd-cmp-line" />
      </div>
    </>
  ),
  // 局部重绘：先框出范围，再涂要重画的地方，点"重绘"
  inpaint: () => (
    <>
      <span className="hd-pic">
        <i className="hd-box" />
        {/* 涂抹在同一层里、整层半透明，叠在一起的地方不会更深（和真的涂抹一样） */}
        <span className="hd-mask">
          <i className="hd-blob hd-b1" />
          <i className="hd-blob hd-b2" />
          <i className="hd-blob hd-b3" />
        </span>
        <Cur className="hd-cur-paint" />
      </span>
      <div className="hd-side">
        <span className="oba-note">
          <Icon name="crop-line" /> 先框出范围
        </span>
        <span className="oba-note">
          <Icon name="brush-line" /> 再涂要重画的地方
        </span>
        <span className="btn ink sm hd-go">重绘</span>
      </div>
    </>
  ),
  // 挑图：空格保留、X 不要，最后把不要的一起移入回收站
  pick: () => (
    <div className="hd-pick">
      <div className="hd-grid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <i key={i} className={`hd-cell hd-c${i}`}>
            <Icon name="checkbox-circle-fill" className="hd-keep" />
            <Icon name="close-circle-fill" className="hd-drop" />
          </i>
        ))}
      </div>
      <div className="hd-side">
        <span className="hd-press hd-p-keep">
          <Kbd keys="Space" /> 保留
        </span>
        <span className="hd-press hd-p-drop">
          <Kbd keys="X" /> 不要
        </span>
        <span className="btn sm hd-bin">不要的 2 张移入回收站</span>
      </div>
    </div>
  ),
  // 随机池：提示词里放一个随机块，每张图生成前各抽一次
  random: () => (
    <>
      <div className="oba-card hd-card hd-rnd">
        <span className="oba-cap">随机块</span>
        <span className="hd-pool">
          <Icon name="dice-line" /> 发色 · 4 条
        </span>
      </div>
      <Icon name="arrow-right-line" className="oba-arrow" />
      <div className="hd-outs">
        {[
          ['silver hair', '银发'],
          ['black hair', '黑发'],
          ['pink hair', '粉发'],
        ].map(([en, zh], i) => (
          <span key={en} className={`hd-out hd-o${i}`}>
            {thumb('')}
            {tag(en, zh, 'body')}
          </span>
        ))}
      </div>
    </>
  ),
};

export function HelpDemo({ id }: { id: DemoId }) {
  const steps = useSteps(id);
  return (
    <div className={`oba hd hd-${id} ${steps}`} inert aria-hidden="true">
      {SCENES[id]()}
    </div>
  );
}
