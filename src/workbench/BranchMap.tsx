// 分支总览（用户 11-01）：版本栏只管正在走的这条线，这里把所有分支一次铺开看全。
// 每条分支一行（从它分出来的那一版起，沿第一个孩子一路往下），同一代的版本对齐在同一列；
// 分支从它分出来的那一版右边的缝里往下拐进自己那一行，连线不压到别的图。点一版切过去。
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Icon, Kbd } from '../kit/controls';
import { ToWin, useDismiss } from '../kit/layer';
import { Presence, ms } from '../kit/motion';
import type { WorkVersion } from '../shared/generation';
import { Thumb } from './versionHelpers';

type Tree = { byId: Map<string, WorkVersion>; children: Map<string, WorkVersion[]> };
type Props = {
  open: boolean;
  onClose: () => void;
  tab: string;
  versions: WorkVersion[];
  current?: WorkVersion;
  tree: Tree;
  name: (v: WorkVersion) => string;
  /** 一版拿哪张出来代表（没有图时是空的） */
  firstImage: (v: WorkVersion) => string;
  onGo: (v: WorkVersion, imageId?: string) => void;
};

export function BranchMap(p: Props) {
  return (
    <Presence show={p.open}>
      {(leaving, ref) => (
        <ToWin>
          <Body {...p} leaving={leaving} nodeRef={ref} />
        </ToWin>
      )}
    </Presence>
  );
}

function Body({
  onClose,
  tab,
  versions,
  current,
  tree,
  name,
  firstImage,
  onGo,
  leaving,
  nodeRef,
}: Props & { leaving: boolean; nodeRef: React.RefObject<HTMLElement | null> }) {
  const ov = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    nodeRef.current = ov.current;
  });
  useDismiss(!leaving, onClose, [ov], { modal: true });
  const kids = (id: string) => tree.children.get(id) || [];
  // 分成一行一行：根那条线是第一行，每一版除第一个孩子以外的孩子各起一行，紧跟在它上面那行后面
  const { lanes, col, laneOf } = useMemo(() => {
    const lanes: WorkVersion[][] = [];
    const col = new Map<string, number>();
    const laneOf = new Map<string, number>();
    const root = versions.find((v) => !v.parentId);
    const add = (start: WorkVersion, c: number) => {
      const lane: WorkVersion[] = [];
      for (let x: WorkVersion | undefined = start, k = c; x; x = kids(x.id)[0], k++) {
        lane.push(x);
        col.set(x.id, k);
        laneOf.set(x.id, lanes.length);
      }
      lanes.push(lane);
      for (const x of lane) for (const other of kids(x.id).slice(1)) add(other, col.get(x.id)! + 1);
    };
    if (root) add(root, 0);
    return { lanes, col, laneOf };
  }, [versions, tree]);
  // 当前这一版往上一路到根：这条线上的连线用墨色
  const onLine = useMemo(() => {
    const ids = new Set<string>();
    for (let x = current; x; x = x.parentId ? tree.byId.get(x.parentId) : undefined) ids.add(x.id);
    return ids;
  }, [current, tree]);
  const W = ms('--map-card-w') || 96,
    H = ms('--map-card-h') || 128,
    GAP = ms('--sp-6') || 24,
    PAD = ms('--sp-3') || 12,
    CAP = ms('--sp-6') || 24,
    LABEL = ms('--map-label-w') || 168;
  const PITCH = W + GAP,
    LANE = PAD + H + CAP + PAD;
  const cols = Math.max(1, ...[...col.values()].map((c) => c + 1));
  const mid = (lane: number) => lane * LANE + PAD + H / 2;
  const left = (c: number) => c * PITCH;
  // 打开时把当前这一版滚到看得见的地方
  useLayoutEffect(() => {
    body.current
      ?.querySelector('.map-card.on')
      ?.scrollIntoView({ block: 'center', inline: 'center' });
  }, []);
  const lines: { d: string; on: boolean }[] = [];
  lanes.forEach((lane, li) => {
    // 同一行里相邻两版：横线
    for (let i = 1; i < lane.length; i++) {
      const c = col.get(lane[i].id)!;
      lines.push({
        d: `M${left(c - 1) + W} ${mid(li)}H${left(c)}`,
        on: onLine.has(lane[i].id),
      });
    }
    // 分出来的一行：从上一版右边的缝里往下拐
    const first = lane[0];
    const parent = first.parentId ? tree.byId.get(first.parentId) : undefined;
    if (!parent) return;
    const pl = laneOf.get(parent.id)!,
      c = col.get(first.id)!,
      x = left(c) - GAP / 2;
    lines.push({
      d: `M${left(c - 1) + W} ${mid(pl)}H${x}V${mid(li)}H${left(c)}`,
      on: onLine.has(first.id),
    });
  });
  const count = (v: WorkVersion) =>
    v.images.filter((i) => !i.deleted).length + (firstImage(v) === v.project.id ? 1 : 0);
  const total = versions.reduce((n, v) => n + count(v), 0);
  return (
    <div
      ref={ov}
      className={`viewer-ov map-ov ${leaving ? 'leaving' : ''}`}
      data-enter="fade3"
      role="dialog"
      aria-modal="true"
      aria-label="分支总览"
    >
      <div className="viewer-bar map-top">
        <b>分支总览</b>
        <span className="muted">
          {lanes.length} 条分支 · {versions.filter((v) => !v.isStart).length} 版 · {total} 张
        </span>
        <span className="sp" />
        <span className="help key-hint">
          <span>点一版切过去</span>
          <Kbd keys="Esc" />
          <span>关闭</span>
        </span>
        <button className="btn quiet sm" onClick={onClose}>
          <Icon name="close-line" />
          关闭
        </button>
      </div>
      <div className="map-body scroll" ref={body}>
        <div
          className="map-grid"
          style={
            { width: LABEL + cols * PITCH, height: lanes.length * LANE } as React.CSSProperties
          }
        >
          {/* 左边写分支名的一栏：横着滚动时贴在左边不动 */}
          <div className="map-labels" style={{ width: LABEL, height: lanes.length * LANE }}>
            {lanes.map((lane, li) => {
              const first = lane[0];
              const parent = first.parentId ? tree.byId.get(first.parentId) : undefined;
              const here = lane.some((x) => x.id === current?.id);
              return (
                <div
                  key={first.id}
                  className={`map-label ${here ? 'on' : ''}`}
                  style={{ top: li * LANE, height: LANE }}
                >
                  <b>{first.branchName}</b>
                  <span className="help">
                    {parent
                      ? `从${name(parent)}分出`
                      : name(first) === '原图'
                        ? '从原图开始'
                        : '从起点开始'}
                  </span>
                  <span className="help">
                    {lane.filter((x) => !x.isStart).length} 版 ·{' '}
                    {lane.reduce((n, x) => n + count(x), 0)} 张
                  </span>
                </div>
              );
            })}
          </div>
          <svg
            className="map-lines"
            width={cols * PITCH}
            height={lanes.length * LANE}
            style={{ left: LABEL }}
            aria-hidden="true"
          >
            {lines.map((l, i) => (
              <path key={i} d={l.d} className={l.on ? 'on' : ''} />
            ))}
          </svg>
          {lanes.flatMap((lane, li) =>
            lane.map((v) => {
              const id = firstImage(v),
                n = count(v);
              return (
                <button
                  key={v.id}
                  className={`map-card ${v.id === current?.id ? 'on' : ''}`}
                  style={{ left: LABEL + left(col.get(v.id)!), top: li * LANE + PAD }}
                  data-tip={`${v.branchName} · ${name(v)} · ${n} 张`}
                  onClick={() => onGo(v, id || undefined)}
                >
                  <span className="map-pic">
                    {id === v.project.id ? (
                      <Thumb
                        id={id}
                        path={v.project.thumbnail_path || v.project.image_path}
                        image={v.project}
                        tab={tab}
                      />
                    ) : id ? (
                      <Thumb id={id} tab={tab} />
                    ) : (
                      <span className="map-none">{name(v)}</span>
                    )}
                  </span>
                  <span className="map-cap">
                    <span>{name(v)}</span>
                    {n > 1 && <span className="muted mono">×{n}</span>}
                  </span>
                </button>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
