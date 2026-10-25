import { Fragment, useState } from 'react';
import { Icon, Kbd, isMod, modKey } from '../kit/controls';
import { Pop } from '../kit/layer';
import { ContextMenu } from '../kit/menu';
import { FlipScope, useExitList } from '../kit/motion';
import { invokeUI } from '../lib/commands';
import { mediaUrl } from '../lib/imageStage.js';
import { versionDiff } from '../lib/versionDiff';
import type { CommandTab } from '../shared/commands';
import type { ImageOperation, WorkVersion } from '../shared/generation';
import { originGone } from './original';
import { useVersionState } from './useVersionState';
import { openCompare, type CompareSide } from './Compare';
import { VersionDifference, VersionSummary } from './VersionDifference';
import { Row, TH_H, TH_MORE, Thumb, rowsOf } from './versionHelpers';
// 放大、增强、图生图出来的那一版（1.8，doc/design.md 2.34）：标题旁边挂一个和 Agent 一样的小标签
const OP_NAME: Record<ImageOperation['kind'], string> = {
  upscale: '放大',
  enhance: '增强',
  img2img: '图生图',
  inpaint: '局部重绘',
};
const n2 = (v?: number) => (v == null ? '' : v.toFixed(2));
const opTip = (o: ImageOperation) =>
  o.kind === 'upscale'
    ? '把上一版的图宽高各放大 2 倍'
    : o.kind === 'enhance'
      ? `把上一版的图重新细化 · 幅度 ${o.magnitude ?? ''} · 放大 ${o.scale === 'max' ? 'Max' : `${o.scale ?? 1}x`}`
      : o.kind === 'inpaint'
        ? `重绘了上一版图里的一块${o.rect ? ` · 框 ${o.rect.width} × ${o.rect.height}，在 ${o.rect.x}, ${o.rect.y}` : ''} · 重绘强度 ${n2(o.strength)}`
        : `按底图生成 · 强度 ${n2(o.strength)} · 噪声 ${n2(o.noise)}`;

export function Versions({ tab, before }: { tab: CommandTab; before?: () => Promise<void> }) {
  const {
    ratio,
    go,
    ctx,
    thumbMenu,
    job,
    appending,
    rowW,
    open,
    setOpen,
    current,
    kids,
    byId,
    renameMenu,
    derived,
    peekProps,
    name,
    delta,
    origin,
    draft,
    versions,
    pending,
    subtree,
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
            data-tip="原图"
            onClick={(e) => {
              e.stopPropagation();
              if (pickOr(e, v, v.project.id)) return;
              void go(v, v.project.id);
            }}
            onContextMenu={ctx(thumbMenu(v, v.project.id, false))}
          >
            <Thumb
              id={v.project.id}
              src={mediaUrl(v.project.thumbnail_path || v.project.image_path)}
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
            onClick={(e) => {
              e.stopPropagation();
              if (pickOr(e, v, img.projectId)) return;
              void go(v, img.projectId);
            }}
            onContextMenu={ctx(thumbMenu(v, img.projectId))}
          >
            <Thumb id={img.projectId} />
          </span>
        ),
      });
    const mine =
      job && (job.versionId === v.id || (!job.versionId && appending && job.parentId === v.id));
    if (mine && job) {
      const n = job.continuous ? 1 : Math.max(1, job.count - job.completed);
      for (let i = 0; i < n; i++) {
        const run = i === 0 && job.state === 'generating',
          fail = i === 0 && job.state === 'failed';
        cells.push({
          key: `slot-${i}`,
          pin: run || fail,
          node: (
            <span
              key={`slot-${i}`}
              className={`slot ${run ? 'run' : ''} ${fail ? 'fail' : ''}`}
              data-enter="fade"
              style={
                {
                  '--w': `${w}px`,
                  '--p': `${Math.round((job.progress ?? 0.5) * 100)}%`,
                } as React.CSSProperties
              }
              data-tip={fail ? '生成失败' : run ? '生成中' : '排队中'}
            >
              {fail && <Icon name="close-line" />}
            </span>
          ),
        });
      }
    }
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
        data-tip={`显示这一版的全部 ${cells.length} 张`}
        onClick={(e) => (e.stopPropagation(), setOpen([...open, v.id]))}
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
              onContextMenu={ctx(renameMenu(v, `[data-key="brm-${v.id}"]`))}
            >
              <Icon name="git-branch-line" />
              <span className="t">{v.branchName}</span>
            </div>
          ),
        });
      const spawned = derived.filter((d) => d.source.versionId === v.id);
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
            onContextMenu={ctx(renameMenu(v, `[data-key="ver-${v.id}"]`, false, true))}
            {...peekProps(`ver-${v.id}`, v, name(v))}
          >
            <span className="vh">
              <span className="vn">{name(v)}</span>
              {v.source === 'agent' && <span className="src">Agent</span>}
              {v.operation && (
                <span className="src" data-tip={opTip(v.operation)}>
                  {OP_NAME[v.operation.kind]}
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
            </span>
            {v.parentId ? (
              <VersionSummary diff={delta(v)} />
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
            <div className="ths" data-key={`ths-${v.id}`} data-grow="">
              {thumbs(v, on)}
            </div>
          </div>
        ),
      });
      if (on && draft && !draft.empty && (!job || job.state === 'failed')) {
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
              </span>
              <VersionSummary diff={versionDiff(v.project, j.project)} />
              <div className="ths">
                {Array.from({ length: Math.min(6, j.count) }, (_, i) => (
                  <span
                    key={i}
                    className="slot"
                    style={{ '--w': `${Math.round(TH_H * ratio(v))}px` } as React.CSSProperties}
                  />
                ))}
                {j.count > 6 && <span className="more mono">+{j.count - 6}</span>}
              </div>
            </div>
          ),
        });
      // 分叉：刚离开的那条线排在最前，其余按最新的在上面
      const forks = kids(v.id)
        .filter((k) => !line.includes(k))
        .map((k) => ({ k, last: Math.max(...subtree(k).map((x) => versions.indexOf(x))) }))
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
              onContextMenu={ctx(renameMenu(f, `[data-key="fork-${f.id}"]`, true))}
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
              </span>
            </div>
          ),
        });
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
    if (job && !job.versionId && !appending && job.state !== 'failed')
      rows.push({
        key: `new-${job.id}`,
        render: (gone) => (
          <div
            key={`new-${job.id}`}
            data-key={`new-${job.id}`}
            data-flip=""
            data-exit="lift"
            data-enter="fade"
            className={`ver ${gone ? 'leaving' : ''}`}
          >
            <span className="vh">
              <span className="vn">第 {versions.length + 1} 版</span>
              {job.source === 'agent' && <span className="src">Agent</span>}
              {job.operation && <span className="src">{OP_NAME[job.operation]}</span>}
            </span>
            {job.summary && <span className="what">{job.summary}</span>}
            <div className="ths">
              <span
                className="slot run"
                data-enter="fade"
                style={
                  {
                    '--w': `${Math.round(TH_H * ratio(current))}px`,
                    '--p': `${Math.round((job.progress ?? 0.5) * 100)}%`,
                  } as React.CSSProperties
                }
                data-tip="生成中"
              />
            </div>
          </div>
        ),
      });
  }
  // key 带上标签页：两个标签页里同 key 的行（草稿、同一作品的版本）切换时会被当成同一行、原地直接换内容（用户 10-25）
  const shown = useExitList(rows, (r) => `${tab.id}:${r.key}`);
  // 原图算一张；空白作品的起点没有图
  const images = versions.reduce(
    (n, v) => n + v.images.filter((i) => !i.deleted).length,
    versions.length && !versions[0].isStart && !originGone(versions[0]) ? 1 : 0,
  );
  return (
    <div className="col versions" ref={col}>
      {rz.handle}
      <div className="col-h">
        <span className="label">版本</span>
        {current && (
          <span
            className="br-head"
            data-key="br-head"
            data-tip="当前这条线所在的分支，右键可以改名"
            onContextMenu={ctx(renameMenu(current, '[data-key="br-head"]'))}
          >
            · {current.branchName}
          </span>
        )}
        <span className="sp" />
        <span className="muted">
          {versions.filter((v) => !v.isStart).length} 版 · {images} 张
        </span>
      </div>
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
        anchor={peek ? `[data-peek="${peek.key}"]` : undefined}
        place="right-top"
        className="popover ver-peek scroll"
        passive
        deps={[peek?.key]}
      >
        {peek && (
          <div
            className="vp-in"
            onPointerEnter={() => clearTimeout(peekTimer.current)}
            onPointerLeave={unhover}
          >
            <VersionDifference diff={delta(peek.v)} title={peek.title} against={peek.against} />
          </div>
        )}
      </Pop>
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
