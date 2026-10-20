// 版本栏（doc/design.md 2.3、2.23）：标题"版本 · 分支名"和"几版 · 几张"。只显示当前这条线，不缩进：
// 原图 → 中间各版 → 当前版 → 沿当前分支一直到它的最后一版；一条线从一支进入另一支的地方，上面一行小字写分支名。
// 每一版写相对上一版改了什么（最多两行），下面是这一版的缩略图（按比例，最多两行，"+N"展开），当前这一张朱砂细框。
// 改了还没生成时，当前版下面一行虚线的"未生成"。别的分支在分叉处各收成一行；一处超过 3 支时列 2 支加"另外 N 支"。
// 停在一版上 400ms 右边弹出和上一版的完整对比。右键分叉行、版本行或标题里的分支名可以改名。
import { useEffect, useRef, useState } from 'react';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';
import { mediaUrl } from '../lib/imageStage.js';
import { versionDiff } from '../lib/versionDiff';
import { VersionDifference, VersionSummary } from './VersionDifference';
import { Icon, Kbd } from '../kit/controls';
import { ContextMenu, type MenuEntry } from '../kit/menu';
import { Pop } from '../kit/layer';
import { useNotifications } from '../kit/toast';
import { FlipScope, ms, useExitList } from '../kit/motion';
import { useResizable } from '../kit/resize';
import type { CommandTab } from '../shared/commands';
import type { WorkVersion, WorkOrigin } from '../shared/generation';

const TH_H = 38,
  TH_GAP = 4,
  TH_MORE = 28;
const thumbCache = new Map<string, Promise<string>>();
function thumbOf(id: string) {
  let p = thumbCache.get(id);
  if (!p) {
    p = invokeUI('library.get', { id }).then((r) =>
      mediaUrl(r.project.thumbnail_path || r.project.image_path),
    );
    thumbCache.set(id, p);
    p.catch(() => thumbCache.delete(id));
  }
  return p;
}
function Thumb({ id, src }: { id: string; src?: string }) {
  const [url, setUrl] = useState(src || '');
  useEffect(() => {
    if (src) return setUrl(src);
    let live = true;
    void thumbOf(id)
      .then((u) => live && setUrl(u))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id, src]);
  return url ? <img src={url} alt="" draggable={false} /> : null;
}
/** 按宽度一格一格往下排，返回占几行 */
function rowsOf(widths: number[], rowW: number) {
  let rows = widths.length ? 1 : 0,
    x = 0;
  for (const w of widths) {
    if (x && x + TH_GAP + w > rowW) {
      rows++;
      x = w;
    } else x += (x ? TH_GAP : 0) + w;
  }
  return rows;
}
type Row = { key: string; render: (leaving: boolean) => React.ReactNode };

export function Versions({ tab, before }: { tab: CommandTab; before?: () => Promise<void> }) {
  const state = useGeneration();
  const notify = useNotifications();
  const col = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const rz = useResizable(col, {
    key: 'versions',
    edge: 'right',
    min: () => ms('--versions-w'),
    max: () => ms('--popover-w'),
    def: () => ms('--versions-w'),
    storage: 'nps.versions-width',
    label: '版本栏宽度',
  });
  const [versions, setVersions] = useState<WorkVersion[]>([]);
  const [origin, setOrigin] = useState<WorkOrigin | null>(null);
  const [derived, setDerived] = useState<{ workId: string; source: WorkOrigin }[]>([]);
  const [open, setOpen] = useState<string[]>([]);
  const [left, setLeft] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [peek, setPeek] = useState<{
    key: string;
    v: WorkVersion;
    title: string;
    against: string;
  } | null>(null);
  const [menu, setMenu] = useState<{ at: [number, number]; items: MenuEntry[] } | null>(null);
  const [rename, setRename] = useState<{ v: WorkVersion; anchor: string; text: string } | null>(
    null,
  );
  const peekTimer = useRef(0);
  useEffect(
    () =>
      window.studio?.onCommandEvent((e) => {
        if (e.type === 'workbench' && e.libraryChanged) setRefresh((n) => n + 1);
      }),
    [],
  );
  useEffect(() => {
    let live = true;
    void Promise.resolve(before?.())
      .then(() => invokeUI('version.list', { tabId: tab.id }))
      .then((r) => {
        if (!live) return;
        setVersions(r.versions);
        setOrigin(r.origin);
        setDerived(r.derived);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [tab.id, tab.versionId, tab.revision, state.jobs, refresh]);
  useEffect(() => () => clearTimeout(peekTimer.current), []);
  const current = versions.find((v) => v.id === tab.versionId) || versions[0];
  const kids = (id: string) => versions.filter((v) => v.parentId === id);
  const subtree = (v: WorkVersion): WorkVersion[] => [v, ...kids(v.id).flatMap(subtree)];
  const byId = (id: string | null) => versions.find((v) => v.id === id);
  const name = (v: WorkVersion) => (v.parentId ? `第 ${v.number} 版` : '原图');
  const delta = (v: WorkVersion) => versionDiff(byId(v.parentId)?.project || v.project, v.project);
  const go = async (v: WorkVersion, imageId?: string) => {
    try {
      await before?.();
      if (current && v.branchId !== current.branchId) setLeft(current.branchId);
      await invokeUI('version.open', { tabId: tab.id, versionId: v.id, imageId });
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };
  const hover = (key: string, v: WorkVersion, title: string) => {
    clearTimeout(peekTimer.current);
    const against = byId(v.parentId) ? name(byId(v.parentId)!) : '原图';
    if (peek) return setPeek({ key, v, title, against });
    peekTimer.current = window.setTimeout(() => setPeek({ key, v, title, against }), 400);
  };
  const unhover = () => {
    clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => setPeek(null), 120);
  };
  const peekProps = (key: string, v: WorkVersion | null, title: string) =>
    v?.parentId
      ? {
          'data-peek': key,
          onPointerEnter: () => hover(key, v, title),
          onPointerLeave: unhover,
          onFocus: () => hover(key, v, title),
          onBlur: unhover,
        }
      : {};
  const renameMenu = (v: WorkVersion, anchor: string, fork?: boolean): MenuEntry[] => [
    ...(fork ? [{ label: '切换到这一支', onSelect: () => void go(v) }, 'sep' as const] : []),
    { label: '重命名分支…', onSelect: () => setRename({ v, anchor, text: v.branchName }) },
  ];
  const ctx = (items: MenuEntry[]) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(peekTimer.current);
    setPeek(null);
    setMenu({ at: [e.clientX, e.clientY], items });
  };
  const thumbMenu = (v: WorkVersion, imageId: string, trash = true): MenuEntry[] => [
    {
      label: '作为新作品打开',
      onSelect: () =>
        void invokeUI('work.open-from-image', { tabId: tab.id, versionId: v.id, imageId }).then(
          () => notify({ text: '已作为新作品打开' }),
        ),
    },
    ...(trash
      ? [
          'sep' as const,
          {
            label: '移入回收站',
            danger: true,
            onSelect: () =>
              void invokeUI('library.trash', { ids: [imageId] }).then(() => {
                setRefresh((n) => n + 1);
                notify({
                  text: '已移入回收站',
                  action: {
                    label: '撤销',
                    onClick: () =>
                      void invokeUI('library.restore', { ids: [imageId] }).then(() =>
                        setRefresh((n) => n + 1),
                      ),
                  },
                });
              }),
          },
        ]
      : []),
  ];
  // 生成中：一版一张张出来，正在生成的格子是实底加墨色细条，排队的是虚线框；失败的格子是绛红色的叉
  const jobs = state.jobs.filter((j) => j.tabId === tab.id);
  const job =
    jobs.find((j) => ['queued', 'generating'].includes(j.state)) ||
    (jobs.at(-1)?.state === 'failed' ? jobs.at(-1) : undefined);
  const appending =
    job && versionDiff(byId(job.parentId)?.project || job.project, job.project).empty;
  const pending = jobs.filter((j) => j.state === 'pending');
  const draft = current && tab.project ? versionDiff(current.project, tab.project) : null;
  const rowW = (rz.width || ms('--versions-w')) - 32;
  const ratio = (v: WorkVersion) =>
    Math.max(
      ms('--thumb-ratio-min') || 0.5,
      Math.min(
        ms('--thumb-ratio-max') || 2.5,
        (v.project.metadata.width || 832) / (v.project.metadata.height || 1216),
      ),
    );
  const thumbs = (v: WorkVersion, on: boolean) => {
    const w = Math.round(TH_H * ratio(v));
    type Cell = { key: string; pin: boolean; node: React.ReactNode };
    const cells: Cell[] = [];
    const cur = (id: string) =>
      on && (tab.versionImageId ? tab.versionImageId === id : id === v.project.id);
    if (!v.parentId)
      cells.push({
        key: 'orig',
        pin: cur(v.project.id),
        node: (
          <span
            key="orig"
            className={cur(v.project.id) ? 'is-cur' : ''}
            style={{ '--w': `${w}px` } as React.CSSProperties}
            data-tip="原图"
            onClick={(e) => {
              e.stopPropagation();
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
            className={cur(img.projectId) ? 'is-cur' : ''}
            style={{ '--w': `${w}px` } as React.CSSProperties}
            data-enter="fade"
            onClick={(e) => {
              e.stopPropagation();
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
            onContextMenu={ctx(renameMenu(v, `[data-key="ver-${v.id}"]`))}
            {...peekProps(`ver-${v.id}`, v, name(v))}
          >
            <span className="vh">
              <span className="vn">{name(v)}</span>
              {v.source === 'agent' && <span className="src">Agent</span>}
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
            </span>
            {job.summary && <span className="what">{job.summary}</span>}
            <div className="ths">
              <span
                className="slot run"
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
  const shown = useExitList(rows, (r) => r.key);
  const images = versions.reduce(
    (n, v) => n + v.images.filter((i) => !i.deleted).length,
    versions.length ? 1 : 0,
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
          {versions.length} 版 · {images} 张
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
          {shown.map(({ item, leaving }) => item.render(leaving))}
        </div>
      </FlipScope>
      <Pop
        open={!!peek && !menu}
        onClose={() => setPeek(null)}
        anchor={peek ? `[data-peek="${peek.key}"]` : undefined}
        place="right-top"
        className="popover ver-peek"
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
