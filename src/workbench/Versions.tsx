import { Fragment, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon, Kbd, isMod, modKey } from '../kit/controls';
import { Pop } from '../kit/layer';
import { ContextMenu } from '../kit/menu';
import { FlipScope, SnapshotSwap, useExitList } from '../kit/motion';
import { invokeUI } from '../lib/commands';
import { versionDiff } from '../lib/versionDiff';
import type { CommandTab } from '../shared/commands';
import type { ImageOperation, WorkVersion } from '../shared/generation';
import { originGone } from './original';
import { useVersionState, type PeekImage } from './useVersionState';
import { BranchMap } from './BranchMap';
import { openCompare, type CompareSide } from './Compare';
import { VersionDifference, VersionSummary } from './VersionDifference';
import {
  DIRECTOR_TOOL,
  OpSize,
  Row,
  TH_H,
  TH_MORE,
  Thumb,
  fullOf,
  isRedraw,
  opPlan,
  rowsOf,
} from './versionHelpers';
import { BlurImg } from '../kit/blur';
import { openPick } from './Pick';
import { randomSummary } from './RandomBlock';
/** 一版超过这么多张时，"+N"打开挑图而不是展开 */
const PICK_AT = 24;
// 放大、增强、图生图出来的那一版（1.8，doc/design.md 2.34）：标题旁边挂一个和 Agent 一样的小标签
const OP_NAME: Record<ImageOperation['kind'], string> = {
  upscale: '放大',
  enhance: '增强',
  img2img: '图生图',
  inpaint: '局部重绘',
  outpaint: '扩图',
  director: '导演工具',
};
/** 去背景一版三张（2.49）：按返回顺序是抠图、补全、混合 */
const VARIANT: Record<string, string> = {
  masked: '抠图：原图去掉背景',
  generated: '补全：把被挡住的部分也画出来',
  blend: '混合：抠图和补全混在一起',
};
const SIDE: Record<string, string> = { left: '左', right: '右', top: '上', bottom: '下' };
/** 扩图那一版的悬停：右 +256、下 +128 · 一次画完；分块失败时写只扩了哪几边 */
const outpaintTip = (o: ImageOperation) => {
  const e = o.edges || { top: 0, right: 0, bottom: 0, left: 0 };
  const failed = o.failedEdges || [];
  const done = (['left', 'right', 'top', 'bottom'] as const).filter(
    (k) => e[k] && !failed.includes(k),
  );
  const head = done.map((k) => `${SIDE[k]} +${e[k]}`).join('、');
  const how = o.mode === 'edges' ? `按边分块 ${o.blocks?.length ?? done.length} 次` : '一次画完';
  return failed.length
    ? `只扩了${done.map((k) => SIDE[k]).join('、')}边（${head}），${failed.map((k) => SIDE[k]).join('、')}边生成失败${o.failure ? `：${o.failure}` : ''}`
    : `往外扩图 · ${head} · ${how}`;
};
const n2 = (v?: number) => (v == null ? '' : v.toFixed(2));
const opTip = (o: ImageOperation) =>
  o.kind === 'upscale'
    ? '把上一版的图宽高各放大 2 倍'
    : o.kind === 'enhance'
      ? `把上一版的图重新细化 · 幅度 ${o.magnitude ?? ''} · 放大 ${o.scale === 'max' ? 'Max' : `${o.scale ?? 1}x`}`
      : o.kind === 'inpaint'
        ? `重绘了上一版图里的一块${o.rect ? ` · 框 ${o.rect.width} × ${o.rect.height}，在 ${o.rect.x}, ${o.rect.y}` : ''} · 重绘强度 ${n2(o.strength)}`
        : o.kind === 'outpaint'
          ? outpaintTip(o)
          : o.kind === 'director'
            ? `导演工具 · ${DIRECTOR_TOOL[o.tool || ''] || ''}${o.sent ? ` · 送去 ${o.sent.width} × ${o.sent.height}` : ''}`
            : `按底图生成 · 强度 ${n2(o.strength)} · 噪声 ${n2(o.noise)}`;

export function Versions({ tab, before }: { tab: CommandTab; before?: () => Promise<void> }) {
  const {
    ratio,
    go,
    ctx,
    thumbMenu,
    job,
    active,
    draftQueued,
    rowW,
    open,
    setOpen,
    current,
    kids,
    byId,
    renameMenu,
    derived,
    shownTab,
    peekProps,
    hover,
    hoverImg,
    folded,
    toggleFold,
    saveFolded,
    tree,
    name,
    delta,
    origin,
    draft,
    versions,
    pending,
    subtree,
    lastInSubtree,
    left,
    col,
    rz,
    scroll,
    peekTimer,
    setPeek,
    peek,
    menu,
    unhover,
    setMenu,
    dialog,
    sharedDialog,
    rename,
    setRename,
    setRefresh,
  } = useVersionState({ tab, before });
  // Ctrl（macOS 是 Command）点两张缩略图：两张对比（1.8.1）；先点的那张虚线框标着
  const [pick, setPick] = useState<CompareSide | null>(null);
  const [map, setMap] = useState(false);
  /** 停在缩略图上看大图：卡片贴在版本栏右边，顶边对齐这张图（11-01） */
  const imgPeek = (e: ReactPointerEvent<HTMLElement>, v: WorkVersion, img: Omit<PeekImage, 'at'>) =>
    hoverImg(`img-${img.id}`, v, {
      ...img,
      at: [
        (col.current?.getBoundingClientRect().right ?? 0) + 6,
        e.currentTarget.getBoundingClientRect().top,
      ],
    });
  /** 离开一排缩略图、还在这一行里：换回版本对比。缩略图之间的缝隙算在图上，扫过时不闪 */
  const backToRow =
    (key: string, v: WorkVersion, title: string) => (e: ReactPointerEvent<HTMLElement>) => {
      const row = e.currentTarget.closest('[data-peek]');
      if (v.parentId && row && e.relatedTarget instanceof Node && row.contains(e.relatedTarget))
        hover(key, v, title);
    };
  /** 一版的第 k 张：大图卡片下面写的那行 */
  const imgLabel = (v: WorkVersion, projectId: string, prefix = '') => {
    const list = v.images.filter((i) => !i.deleted);
    const k = list.findIndex((i) => i.projectId === projectId);
    const img = list[k];
    return {
      label: `${prefix}${name(v)} · 第 ${k + 1} 张${img?.seed ? ` · Seed ${img.seed}` : ''}`,
      tip: (img?.variant && VARIANT[img.variant]) || randomSummary(img?.random) || undefined,
    };
  };
  /** 从 f 起沿第一个孩子一路往下：这条分支自己的那条线 */
  const lineFrom = (f: WorkVersion) => {
    const out = [f];
    for (let x = kids(f.id)[0]; x; x = kids(x.id)[0]) out.push(x);
    return out;
  };
  /** 一版拿哪张出来代表：第一张没进回收站的；原图那一版是原图 */
  const firstImage = (x: WorkVersion) =>
    x.images.find((i) => !i.deleted)?.projectId ||
    (!x.parentId && !x.isStart && !originGone(x) ? x.project.id : '');
  const pickOr = (e: React.MouseEvent, v: WorkVersion, imageId: string) => {
    if (!isMod(e)) return false;
    if (pick && pick.imageId !== imageId) {
      openCompare(tab.id, pick, { versionId: v.id, imageId });
      setPick(null);
    } else setPick(pick?.imageId === imageId ? null : { versionId: v.id, imageId });
    return true;
  };
  const thumbs = (v: WorkVersion, on: boolean) => {
    const w = Math.round(TH_H * ratio(v));
    type Cell = { key: string; pin: boolean; node: React.ReactNode };
    const cells: Cell[] = [];
    const cur = (id: string) =>
      on && (tab.versionImageId ? tab.versionImageId === id : id === v.project.id);
    if (!v.parentId && !v.isStart && !originGone(v))
      cells.push({
        key: 'orig',
        pin: cur(v.project.id),
        node: (
          <span
            key="orig"
            className={`${cur(v.project.id) ? 'is-cur' : ''} ${pick?.imageId === v.project.id ? 'is-pick' : ''}`}
            style={{ '--w': `${w}px` } as React.CSSProperties}
            onPointerEnter={(e) =>
              imgPeek(e, v, {
                id: v.project.id,
                path: v.project.image_path,
                image: v.project,
                label: '原图',
              })
            }
            onClick={(e) => {
              e.stopPropagation();
              if (pickOr(e, v, v.project.id)) return;
              void go(v, v.project.id);
            }}
            onContextMenu={ctx(() => thumbMenu(v, v.project.id, false))}
          >
            <Thumb
              id={v.project.id}
              path={v.project.thumbnail_path || v.project.image_path}
              image={v.project}
              tab={tab.id}
            />
          </span>
        ),
      });
    for (const img of v.images.filter((i) => !i.deleted))
      cells.push({
        key: img.id,
        pin: cur(img.projectId),
        node: (
          <span
            key={img.id}
            className={`${cur(img.projectId) ? 'is-cur' : ''} ${pick?.imageId === img.projectId ? 'is-pick' : ''}`}
            style={{ '--w': `${w}px` } as React.CSSProperties}
            data-enter="fade"
            data-tip={
              pick && pick.imageId !== img.projectId
                ? `按住 ${modKey()} 点，和标着的那张对比`
                : undefined
            }
            onPointerEnter={(e) =>
              imgPeek(e, v, { id: img.projectId, ...imgLabel(v, img.projectId) })
            }
            onClick={(e) => {
              e.stopPropagation();
              if (pickOr(e, v, img.projectId)) return;
              void go(v, img.projectId);
            }}
            onContextMenu={ctx(() => thumbMenu(v, img.projectId))}
          >
            <Thumb id={img.projectId} tab={tab.id} />
          </span>
        ),
      });
    // 排在这一版下面的每一份（同一标签页可以排好几份，2.46）
    active.forEach(({ job, appending }) => {
      const mine = job.versionId === v.id || (!job.versionId && appending && job.parentId === v.id);
      if (!mine) return;
      const n = job.continuous ? 1 : Math.max(1, job.count - job.completed);
      for (let i = 0; i < n; i++) {
        const run = i === 0 && job.state === 'generating',
          fail = i === 0 && job.state === 'failed';
        cells.push({
          key: `slot-${job.id}-${i}`,
          pin: run || fail,
          node: (
            <span
              key={`slot-${job.id}-${i}`}
              className={`slot ${run ? 'run' : ''} ${fail ? 'fail' : ''} ${job.deferred ? 'deferred' : ''}`}
              data-enter="fade"
              style={
                {
                  '--w': `${w}px`,
                  '--p': `${Math.round((job.progress ?? 0.5) * 100)}%`,
                } as React.CSSProperties
              }
              data-tip={fail ? '生成失败' : run ? '生成中' : job.deferred ? '已暂缓' : '排队中'}
            >
              {fail && <Icon name="close-line" />}
            </span>
          ),
        });
      }
    });
    if (!cells.length) return v.parentId ? <span className="ths-empty">图片都在回收站</span> : null;
    const over =
      rowsOf(
        cells.map(() => w),
        rowW,
      ) > 2;
    const unfolded = open.includes(v.id);
    if (!over) return cells.map((c) => c.node);
    if (unfolded)
      return [
        ...cells.map((c) => c.node),
        <span
          key="more"
          className="more"
          data-tip="收起"
          onClick={(e) => (e.stopPropagation(), setOpen(open.filter((x) => x !== v.id)))}
        >
          <Icon name="arrow-up-s-line" />
        </span>,
      ];
    // 先留下要钉住的（当前这张、正在生成的），再按顺序补，直到连同"+N"那格排不下两行
    const keep = new Set(cells.filter((c) => c.pin).map((c) => c.key));
    const fits = (k: Set<string>) =>
      rowsOf([...cells.filter((c) => k.has(c.key)).map(() => w), TH_MORE], rowW) <= 2;
    for (const c of cells) {
      if (keep.has(c.key)) continue;
      keep.add(c.key);
      if (!fits(keep)) {
        keep.delete(c.key);
        break;
      }
    }
    const shown = cells.filter((c) => keep.has(c.key));
    return [
      ...shown.map((c) => c.node),
      <span
        key="more"
        className="more mono"
        data-tip={
          cells.length > PICK_AT
            ? `挑图：这一版 ${cells.length} 张铺开来挑`
            : `显示这一版的全部 ${cells.length} 张`
        }
        // 图很多时（批量生成、随机块）展开会把版本栏撑得很长，直接打开挑图（2.47）
        onClick={(e) => (
          e.stopPropagation(),
          cells.length > PICK_AT ? openPick(tab.id, v.id) : setOpen([...open, v.id])
        )}
      >
        +{cells.length - shown.length}
      </span>,
    ];
  };
  // 一行一行排出来（每行带 key，换一条线时留下的行移到新位置，离开的先浮起来再淡出）
  const rows: Row[] = [];
  if (current) {
    let end = current;
    while (kids(end.id).length) end = kids(end.id)[0];
    const line: WorkVersion[] = [];
    for (let v: WorkVersion | undefined = end; v; v = byId(v.parentId)) line.unshift(v);
    const mixed = line.some((x) => x.parentId && x.branchId === x.id);
    for (const v of line) {
      const on = v.id === current.id;
      if ((v.parentId && v.branchId === v.id) || (!v.parentId && mixed))
        rows.push({
          key: `brm-${v.id}`,
          render: (gone) => (
            <div
              key={`brm-${v.id}`}
              data-key={`brm-${v.id}`}
              data-flip=""
              data-exit="lift"
              data-enter="fade"
              className={`ver br-mark ${gone ? 'leaving' : ''}`}
              onContextMenu={ctx(() => renameMenu(v, `[data-key="brm-${v.id}"]`))}
            >
              <Icon name="git-branch-line" />
              <span className="t">{v.branchName}</span>
            </div>
          ),
        });
      const spawned = derived.filter((d) => d.source.versionId === v.id);
      // 缩略图收起来了（正在往这一版里生成时照样显示，看得到进度）
      const count =
        v.images.filter((i) => !i.deleted).length + (firstImage(v) === v.project.id ? 1 : 0);
      const busy = active.some(
        ({ job, appending }) =>
          job.versionId === v.id || (!job.versionId && appending && job.parentId === v.id),
      );
      const fold = folded.has(v.id) && !busy && count > 0;
      rows.push({
        key: `ver-${v.id}`,
        render: (gone) => (
          <div
            key={`ver-${v.id}`}
            data-key={`ver-${v.id}`}
            data-flip=""
            data-exit="lift"
            data-enter="fade"
            className={`ver ${on ? 'on' : ''} ${gone ? 'leaving' : ''}`}
            tabIndex={0}
            role="button"
            aria-current={on || undefined}
            onClick={() => void go(v)}
            onKeyDown={(e) => e.key === 'Enter' && void go(v)}
            onContextMenu={ctx(() => renameMenu(v, `[data-key="ver-${v.id}"]`, false, true))}
            {...peekProps(`ver-${v.id}`, v, name(v))}
          >
            <span className="vh">
              <span className="vn">{name(v)}</span>
              {v.source === 'agent' && <span className="src">Agent</span>}
              {v.operation && (
                <span className="src" data-tip={opTip(v.operation)}>
                  {v.operation.kind === 'director'
                    ? DIRECTOR_TOOL[v.operation.tool || ''] || OP_NAME.director
                    : OP_NAME[v.operation.kind]}
                </span>
              )}
              {spawned.length > 0 && (
                <span
                  className="src link"
                  data-tip="打开从这一版另起的作品"
                  onClick={(e) => {
                    e.stopPropagation();
                    void invokeUI('work.open', { workId: spawned[spawned.length - 1].workId });
                  }}
                >
                  新作品
                </span>
              )}
              {fold && <span className="ver-n">{count} 张</span>}
              {count > 0 && !busy && (
                <button
                  className={`btn quiet sm icon ver-fold ${fold ? 'on' : ''}`}
                  aria-label={fold ? '展开缩略图' : '收起缩略图'}
                  data-tip={fold ? '展开缩略图' : '收起缩略图，只留标题和改了什么'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFold(v.id);
                  }}
                >
                  <Icon name={fold ? 'arrow-down-s-line' : 'arrow-up-s-line'} />
                </button>
              )}
            </span>
            {v.parentId ? (
              isRedraw(v) ? (
                delta(v).empty ? (
                  <span className="what">
                    提示词没改
                    {v.operation?.rect
                      ? ` · 区域 ${v.operation.rect.width} × ${v.operation.rect.height}`
                      : ''}
                  </span>
                ) : (
                  <VersionSummary diff={delta(v)} lead="重绘提示词 " />
                )
              ) : v.operation?.kind === 'upscale' ||
                v.operation?.kind === 'enhance' ||
                v.operation?.kind === 'director' ? (
                <OpSize
                  from={v.operation.sourceProjectId}
                  to={v.images.find((i) => !i.deleted)?.projectId}
                />
              ) : (
                <VersionSummary diff={delta(v)} />
              )
            ) : originGone(v) ? (
              <span className="what">
                {v.originState === 'trashed' ? '原图在回收站' : '已去掉原图'}
              </span>
            ) : origin?.deleted ? (
              <span className="what">来自的作品已删除</span>
            ) : origin ? (
              <span
                className="what from"
                data-tip="回到原来的作品"
                onClick={(e) => {
                  e.stopPropagation();
                  void invokeUI('work.open', {
                    workId: origin.workId,
                    versionId: origin.versionId,
                    imageId: origin.projectId,
                  });
                }}
              >
                来自 {origin.name || '原作品'} · 第 {origin.number} 版
              </span>
            ) : null}
            {!fold && (
              <div
                className="ths"
                data-key={`ths-${v.id}`}
                data-grow=""
                onPointerLeave={backToRow(`ver-${v.id}`, v, name(v))}
              >
                {thumbs(v, on)}
              </div>
            )}
          </div>
        ),
      });
      if (on && draft && !draft.empty && !draftQueued) {
        const fail = job?.state === 'failed' && !job.versionId;
        const fake = {
          ...current,
          id: 'draft',
          parentId: current.id,
          project: tab.project!,
          number: versions.length + 1,
        } as WorkVersion;
        rows.push({
          key: 'draft',
          render: (gone) => (
            <div
              key="draft"
              data-key="draft"
              data-flip=""
              data-exit="lift"
              data-enter="fade"
              className={`ver draft ${gone ? 'leaving' : ''}`}
              tabIndex={0}
              {...peekProps('draft', fake, '未生成')}
            >
              <span className="vh">
                <span className="vn">
                  未生成
                  {kids(v.id).length
                    ? ` · 分支 ${Math.max(0, ...versions.map((x) => x.branchNumber)) + 1}`
                    : ''}
                </span>
              </span>
              <VersionSummary diff={draft} />
              <div className="ths">
                {fail ? (
                  <span className="slot fail" data-tip="生成失败">
                    <Icon name="close-line" />
                  </span>
                ) : (
                  <span
                    className="slot"
                    style={
                      { '--w': `${Math.round(TH_H * ratio(current))}px` } as React.CSSProperties
                    }
                  />
                )}
              </div>
            </div>
          ),
        });
      }
      for (const j of pending.filter((x) => x.parentId === v.id))
        rows.push({
          key: `q-${j.id}`,
          render: (gone) => (
            <div
              key={`q-${j.id}`}
              data-key={`q-${j.id}`}
              data-flip=""
              data-exit="lift"
              data-enter="fade"
              className={`ver draft ${gone ? 'leaving' : ''}`}
            >
              <span className="vh">
                <span className="vn">待确认</span>
                <span className="src">Agent</span>
                {j.operation && <span className="src">{opPlan(j).name}</span>}
              </span>
              {/* Agent 的图片操作（2.48）：写对哪张图做什么，缩略图位置放预览小图（遮罩和框、扩出来的区域） */}
              {j.operation ? (
                <span className="what">{opPlan(j).text}</span>
              ) : (
                <VersionSummary diff={versionDiff(v.project, j.project)} />
              )}
              <div className="ths">
                {j.operation && j.previewPath ? (
                  <span className="op-prev">
                    <BlurImg
                      image={j.project}
                      path={j.previewPath}
                      eye={false}
                      className="alpha-bg"
                      alt=""
                      draggable={false}
                    />
                  </span>
                ) : (
                  Array.from({ length: j.operation ? 1 : Math.min(6, j.count) }, (_, i) => (
                    <span
                      key={i}
                      className="slot"
                      style={{ '--w': `${Math.round(TH_H * ratio(v))}px` } as React.CSSProperties}
                    />
                  ))
                )}
                {!j.operation && j.count > 6 && <span className="more mono">+{j.count - 6}</span>}
              </div>
            </div>
          ),
        });
      // 分叉：刚离开的那条线排在最前，其余按最新的在上面
      const forks = kids(v.id)
        .filter((k) => !line.includes(k))
        .map((k) => ({ k, last: lastInSubtree(k) }))
        .sort(
          (a, b) =>
            Number(b.k.branchId === left) - Number(a.k.branchId === left) || b.last - a.last,
        )
        .map((x) => x.k);
      const fo = open.includes(`fork:${v.id}`);
      const list = forks.length > 3 && !fo ? forks.slice(0, 2) : forks;
      for (const f of list) {
        const all = subtree(f);
        const title = `${f.branchName} · ${all.length} 版 · ${all.reduce((n, x) => n + x.images.filter((i) => !i.deleted).length, 0)} 张`;
        // 分叉行常态带一排小图：这条分支最近几版各一张，在主线上也看得到分支的图（11-01）
        const fl = lineFrom(f);
        const fx = open.includes(`forkx:${f.id}`);
        const strip = fl.filter((x) => firstImage(x)).slice(-4);
        rows.push({
          key: `fork-${f.id}`,
          render: (gone) => (
            <div
              key={`fork-${f.id}`}
              data-key={`fork-${f.id}`}
              data-flip=""
              data-exit="lift"
              data-enter="fade"
              className={`ver fork ${gone ? 'leaving' : ''}`}
              tabIndex={0}
              role="button"
              onClick={() => void go(f)}
              onKeyDown={(e) => e.key === 'Enter' && void go(f)}
              onContextMenu={ctx(() => renameMenu(f, `[data-key="fork-${f.id}"]`, true))}
              {...peekProps(`fork-${f.id}`, f, title)}
            >
              <Icon name="git-branch-line" />
              <span className="fk">
                <span className="fk-name">
                  <span className="t">{f.branchName}</span>
                  {f.branchId === left && <span className="fk-left">刚才所在</span>}
                  {f.source === 'agent' && <span className="src">Agent</span>}
                </span>
                <VersionSummary compact diff={delta(f)} />
                {!fx && strip.length > 0 && (
                  <span className="ths fk-ths" onPointerLeave={backToRow(`fork-${f.id}`, f, title)}>
                    {strip.map((x) => {
                      const id = firstImage(x);
                      return (
                        <span
                          key={x.id}
                          style={
                            { '--w': `${Math.round(TH_H * ratio(x))}px` } as React.CSSProperties
                          }
                          onPointerEnter={(e) =>
                            imgPeek(e, x, {
                              id,
                              ...(id === x.project.id
                                ? { path: x.project.image_path, image: x.project, label: '原图' }
                                : imgLabel(x, id, `${f.branchName} · `)),
                            })
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            void go(x, id);
                          }}
                        >
                          {id === x.project.id ? (
                            <Thumb
                              id={id}
                              path={x.project.thumbnail_path || x.project.image_path}
                              image={x.project}
                              tab={tab.id}
                            />
                          ) : (
                            <Thumb id={id} tab={tab.id} />
                          )}
                        </span>
                      );
                    })}
                  </span>
                )}
              </span>
              <button
                className={`btn quiet sm icon fk-open ${fx ? 'on' : ''}`}
                aria-label={fx ? '收起这条分支' : '展开这条分支'}
                data-tip={fx ? '收起' : `展开这条分支的 ${fl.length} 版，不用切过去`}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(
                    fx ? open.filter((x) => x !== `forkx:${f.id}`) : [...open, `forkx:${f.id}`],
                  );
                }}
              >
                <Icon name={fx ? 'arrow-up-s-line' : 'arrow-down-s-line'} />
              </button>
            </div>
          ),
        });
        // 就地展开：这条分支的各版一行一个，左边一张小图；点了才切过去
        if (fx)
          for (const x of fl) {
            const id = firstImage(x);
            const t = `${f.branchName} · ${name(x)}`;
            rows.push({
              key: `fx-${x.id}`,
              render: (gone) => (
                <div
                  key={`fx-${x.id}`}
                  data-key={`fx-${x.id}`}
                  data-flip=""
                  data-exit="lift"
                  data-enter="fade"
                  className={`ver fork-ver ${gone ? 'leaving' : ''}`}
                  tabIndex={0}
                  role="button"
                  onClick={() => void go(x)}
                  onKeyDown={(e) => e.key === 'Enter' && void go(x)}
                  {...peekProps(`fx-${x.id}`, x, t)}
                >
                  {id ? (
                    <span className="ths fx-th" onPointerLeave={backToRow(`fx-${x.id}`, x, t)}>
                      <span
                        style={{ '--w': `${Math.round(TH_H * ratio(x))}px` } as React.CSSProperties}
                        onPointerEnter={(e) =>
                          imgPeek(e, x, { id, ...imgLabel(x, id, `${f.branchName} · `) })
                        }
                      >
                        <Thumb id={id} tab={tab.id} />
                      </span>
                    </span>
                  ) : (
                    <span className="fx-th empty" />
                  )}
                  <span className="fk">
                    <span className="fk-name">
                      <span className="t">{name(x)}</span>
                      <span className="ver-n">{x.images.filter((i) => !i.deleted).length} 张</span>
                    </span>
                    <VersionSummary compact diff={delta(x)} />
                  </span>
                </div>
              ),
            });
          }
      }
      if (list.length < forks.length || (fo && forks.length > 3))
        rows.push({
          key: `forkmore-${v.id}`,
          render: (gone) => (
            <div
              key={`forkmore-${v.id}`}
              data-key={`forkmore-${v.id}`}
              data-flip=""
              data-exit="lift"
              className={`ver fork more ${gone ? 'leaving' : ''}`}
              tabIndex={0}
              role="button"
              onClick={() =>
                setOpen(fo ? open.filter((x) => x !== `fork:${v.id}`) : [...open, `fork:${v.id}`])
              }
            >
              <Icon name={fo ? 'arrow-up-s-line' : 'more-line'} />
              <span className="fk">
                <span className="what">
                  {fo ? '收起' : `另外 ${forks.length - list.length} 支`}
                </span>
              </span>
            </div>
          ),
        });
    }
    // 还没出图、要另起一版的每一份：正在生成的是实底加墨色细条，排队的是虚线格子
    active
      .filter(({ job, appending }) => !job.versionId && !appending && job.state !== 'failed')
      .forEach(({ job }, k) => {
        const run = job.state === 'generating';
        const n = run || job.continuous ? 1 : Math.min(job.count, 8);
        rows.push({
          key: `new-${job.id}`,
          render: (gone) => (
            <div
              key={`new-${job.id}`}
              data-key={`new-${job.id}`}
              data-flip=""
              data-exit="lift"
              data-enter="fade"
              className={`ver ${run ? '' : 'queued'} ${job.deferred ? 'deferred' : ''} ${gone ? 'leaving' : ''}`}
            >
              <span className="vh">
                <span className="vn">第 {versions.length + 1 + k} 版</span>
                {job.source === 'agent' && <span className="src">Agent</span>}
                {job.operation && <span className="src">{OP_NAME[job.operation]}</span>}
                {!run && <span className="src">{job.deferred ? '已暂缓' : '排队中'}</span>}
              </span>
              {job.summary && <span className="what">{job.summary}</span>}
              <div className="ths">
                {Array.from({ length: n }, (_, i) => (
                  <span
                    key={i}
                    className={`slot ${run ? 'run' : ''}`}
                    data-enter="fade"
                    style={
                      {
                        '--w': `${Math.round(TH_H * ratio(current))}px`,
                        '--p': `${Math.round((job.progress ?? 0.5) * 100)}%`,
                      } as React.CSSProperties
                    }
                    data-tip={run ? '生成中' : job.deferred ? '已暂缓' : '排队中'}
                  />
                ))}
                {!run && job.count > n && <span className="more mono">+{job.count - n}</span>}
              </div>
            </div>
          ),
        });
      });
  }
  // 浮层的滚动条画在浮层外面（ScrollLayer）：指针移到它上面、拖动它都还算在浮层里，离开滚动条、松手时再看指针在哪
  const inPeek = (t: EventTarget | null) =>
    t instanceof Element && !!t.closest('.ver-peek, .sb-layer .sb');
  const leavePeek = (e: ReactPointerEvent) => {
    const bar =
      e.relatedTarget instanceof Element ? e.relatedTarget.closest<HTMLElement>('.sb') : null;
    if (!bar) return unhover();
    const settle = (ev: PointerEvent) => {
      if (document.documentElement.classList.contains('is-dragging')) {
        bar.removeEventListener('pointerleave', settle);
        window.addEventListener(
          'pointerup',
          (up) => {
            if (!inPeek(document.elementFromPoint(up.clientX, up.clientY))) unhover();
          },
          { once: true },
        );
        return;
      }
      bar.removeEventListener('pointerleave', settle);
      if (!inPeek(ev.relatedTarget)) unhover();
    };
    bar.addEventListener('pointerleave', settle);
  };
  // key 带上标签页：两个标签页里同 key 的行（草稿、同一作品的版本）切换时会被当成同一行、原地直接换内容（用户 10-25）
  // 切到别的标签页时上一个标签页的行不逐行淡出：整列由 SnapshotSwap 交叉淡化
  // 跟着"显示的是哪个标签页的版本"走，不跟着标签页切换走：新标签页的版本读到时才整列换过去
  const shown = useExitList(rows, (r) => `${shownTab}:${r.key}`).filter(
    (r) => !r.leaving || r.key.startsWith(`${shownTab}:`),
  );
  const allFolded = versions.length > 0 && versions.every((v) => folded.has(v.id));
  // 原图算一张；空白作品的起点没有图
  const images = versions.reduce(
    (n, v) => n + v.images.filter((i) => !i.deleted).length,
    versions.length && !versions[0].isStart && !originGone(versions[0]) ? 1 : 0,
  );
  return (
    <div className="col versions" ref={col} data-feature="versions">
      {rz.handle}
      <div className="col-h">
        <span className="label">版本</span>
        {current && (
          <span
            className="br-head"
            data-key="br-head"
            data-tip="当前这条线所在的分支，右键可以改名"
            onContextMenu={ctx(() => renameMenu(current, '[data-key="br-head"]'))}
          >
            · {current.branchName}
          </span>
        )}
        <span className="sp" />
        <span className="muted">
          {versions.filter((v) => !v.isStart).length} 版 · {images} 张
        </span>
        {versions.length > 1 && (
          <>
            <button
              className="btn quiet sm icon"
              aria-label={allFolded ? '展开全部缩略图' : '收起全部缩略图'}
              data-tip={allFolded ? '展开全部缩略图' : '收起全部缩略图，只留标题和改了什么'}
              onClick={() =>
                saveFolded(
                  allFolded
                    ? new Set([...folded].filter((id) => !tree.byId.has(id)))
                    : new Set([...folded, ...versions.map((v) => v.id)]),
                )
              }
            >
              <Icon name={allFolded ? 'expand-up-down-line' : 'contract-up-down-line'} />
            </button>
            <button
              className={`btn quiet sm icon ${map ? 'is-hover' : ''}`}
              aria-label="分支总览"
              data-tip="分支总览：所有分支的图一次看全"
              data-feature="branch-map"
              onClick={() => setMap(true)}
            >
              <Icon name="node-tree" />
            </button>
          </>
        )}
      </div>
      <SnapshotSwap swapKey={shownTab} root={scroll} />
      <FlipScope root={scroll}>
        <div
          className="scroll"
          ref={scroll}
          onScroll={() => {
            clearTimeout(peekTimer.current);
            setPeek(null);
          }}
        >
          {/* 外面再包一层带标签页的 key：行自己的 key（ver-版本号）在两个标签页里会重复 */}
          {shown.map(({ key, item, leaving }) => (
            <Fragment key={key}>{item.render(leaving)}</Fragment>
          ))}
        </div>
      </FlipScope>
      <Pop
        open={!!peek && !menu}
        onClose={() => setPeek(null)}
        anchor={peek && !peek.img ? `[data-peek="${peek.key}"]` : undefined}
        point={peek?.img?.at}
        place="right-top"
        className={`popover ver-peek scroll ${peek?.img ? 'img' : ''}`}
        passive
        deps={[peek?.key]}
      >
        {peek && (
          <div
            className="vp-in"
            onPointerEnter={() => clearTimeout(peekTimer.current)}
            onPointerLeave={leavePeek}
          >
            {peek.img ? (
              <PeekPicture img={peek.img} tab={tab.id} />
            ) : (
              <VersionDifference
                diff={delta(peek.v)}
                title={peek.title}
                against={peek.against}
                redraw={isRedraw(peek.v)}
              />
            )}
          </div>
        )}
      </Pop>
      <BranchMap
        open={map}
        onClose={() => setMap(false)}
        tab={tab.id}
        versions={versions}
        current={current}
        tree={tree}
        name={name}
        firstImage={firstImage}
        onGo={(v, imageId) => {
          setMap(false);
          void go(v, imageId);
        }}
      />
      <ContextMenu at={menu?.at || null} onClose={() => setMenu(null)} items={menu?.items || []} />
      {dialog}
      {sharedDialog}
      <Pop
        open={!!rename}
        onClose={() => setRename(null)}
        anchor={rename?.anchor}
        className="popover br-pop"
        label="重命名分支"
      >
        {rename && (
          <>
            <label className="field sm">
              <input
                autoFocus
                ref={(n) => {
                  if (n && !n.dataset.sel) {
                    n.dataset.sel = '1';
                    n.select();
                  }
                }}
                value={rename.text}
                placeholder={rename.v.branchNumber ? `分支 ${rename.v.branchNumber}` : '主线'}
                aria-label="分支名称"
                onChange={(e) => setRename({ ...rename, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing || e.key !== 'Enter') return;
                  e.preventDefault();
                  void invokeUI('branch.rename', {
                    branchId: rename.v.branchId,
                    name: rename.text,
                  }).then(() => setRefresh((n) => n + 1));
                  setRename(null);
                }}
              />
            </label>
            <span className="help">
              清空就恢复成"{rename.v.branchNumber ? `分支 ${rename.v.branchNumber}` : '主线'}"
            </span>
            <div className="row">
              <span className="help key-hint">
                <Kbd keys="Enter" />
                <span>确定</span>
                <Kbd keys="Esc" />
                <span>取消</span>
              </span>
              <span className="sp" />
              <button className="btn quiet sm" onClick={() => setRename(null)}>
                取消
              </button>
              <button
                className="btn ink sm"
                onClick={() => {
                  void invokeUI('branch.rename', {
                    branchId: rename.v.branchId,
                    name: rename.text,
                  }).then(() => setRefresh((n) => n + 1));
                  setRename(null);
                }}
              >
                确定
              </button>
            </div>
          </>
        )}
      </Pop>
    </div>
  );
}

/** 悬停缩略图时的大图卡片：原图按比例放在 --peek-img-w × --peek-img-h 里，下面写第几版第几张和 Seed */
function PeekPicture({ img, tab }: { img: PeekImage; tab: string }) {
  const [data, setData] = useState(img.path ? { path: img.path, image: img.image } : null);
  useEffect(() => {
    if (img.path) return setData({ path: img.path, image: img.image });
    let live = true;
    setData(null);
    void fullOf(img.id)
      .then((d) => live && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [img.id, img.path]);
  return (
    <>
      <div className="vp-pic">
        {data && (
          <BlurImg
            image={data.image}
            path={data.path}
            tab={tab}
            eye={false}
            alt=""
            draggable={false}
          />
        )}
      </div>
      <div className="vp-h">
        <b>{img.label}</b>
        {img.tip && <span className="help">{img.tip}</span>}
      </div>
    </>
  );
}
