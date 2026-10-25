// V5 控制词面板（10-25 用户选方案 B，添加方式以点选为主）：节标题上的按钮打开。
// 复杂度、年代感只能选一档，用分段选择（含"无"）；透明、视觉小说、其他可以多选，点一下加上、再点去掉。
// 面板只读当前这一节的 Tag 来显示状态，改动都直接写进提示词，没有第二份数据。
import { Seg } from '../kit/controls';
import { Pop } from '../kit/layer';
import {
  CONTROL_GROUPS,
  matchControl,
  type ControlGroup,
  type ControlTag,
} from '../lib/v5Controls';

export function ControlPanel({
  open,
  onClose,
  anchor,
  tags,
  v5,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  anchor: string;
  /** 这一节现在写着的 Tag 原文 */
  tags: string[];
  v5: boolean;
  /** 选了某一项（item 为 null 表示这一组选"无"） */
  onPick: (group: ControlGroup, item: ControlTag | null) => void;
}) {
  const on = new Set(tags.map((t) => matchControl(t)?.item.tag).filter(Boolean));
  return (
    <Pop
      open={open}
      onClose={onClose}
      anchor={anchor}
      trigger={anchor}
      place="below-right"
      className="popover ctl-panel"
      label="V5 控制词"
      deps={[tags.length]}
    >
      <div className="vp-h">
        <b>V5 控制词</b>
        <span className="help">点一下加到这一节末尾，再点一下去掉</span>
      </div>
      {!v5 && <p className="help warn-note">当前模型不是 V5，这些词不起控制作用</p>}
      {CONTROL_GROUPS.map((g) => (
        <div className="frow" key={g.id}>
          <span className="label">{g.label}</span>
          {g.exclusive ? (
            <Seg
              label={g.label}
              items={[['', '无'] as const, ...g.items.map((x) => [x.tag, x.short] as const)]}
              value={g.items.find((x) => on.has(x.tag))?.tag || ''}
              onChange={(tag) => onPick(g, g.items.find((x) => x.tag === tag) || null)}
            />
          ) : (
            <span className="ctl-opts">
              {g.items.map((x) => (
                <button
                  key={x.tag}
                  className="btn sm ctl-opt"
                  aria-pressed={on.has(x.tag)}
                  data-tip={x.help}
                  onClick={() => onPick(g, x)}
                >
                  {x.short}
                </button>
              ))}
            </span>
          )}
        </div>
      ))}
    </Pop>
  );
}
