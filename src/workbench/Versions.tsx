import { useEffect, useRef, useState } from 'react';
import {
  Button,
  ContextMenu,
  Input,
  Popover,
  Layer,
  ResizablePanel,
  useNotifications,
  useScrollArea,
} from '../ui';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';
import { mediaUrl } from '../lib/imageStage.js';
import { versionDiff, diffSummary, oneLine, changeText } from '../lib/versionDiff';
import { AnimatedItems } from '../ui/AnimatedItems';
import type { CommandTab } from '../shared/commands';
import type { WorkVersion, WorkOrigin } from '../shared/generation';
const token = (name: string) =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
export function Versions({ tab, before }: { tab: CommandTab; before?: () => Promise<void> }) {
  const state = useGeneration(),
    [versions, setVersions] = useState<WorkVersion[]>([]),
    [width, setWidth] = useState(
      () => Number(localStorage.getItem('nps.versions-width')) || token('--versions-w'),
    );
  const [expanded, setExpanded] = useState<string[]>([]),
    [renaming, setRenaming] = useState<WorkVersion | null>(null),
    [name, setName] = useState(''),
    [peek, setPeek] = useState<WorkVersion | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(
    () =>
      window.studio?.onCommandEvent((event) => {
        if (event.type === 'workbench' && event.libraryChanged) setRefresh((n) => n + 1);
      }),
    [],
  );
  const [left, setLeft] = useState(''),
    [origin, setOrigin] = useState<WorkOrigin | null>(null),
    [derived, setDerived] = useState<{ workId: string; source: WorkOrigin }[]>([]);
  const anchor = useRef<HTMLElement>(null),
    peekAnchor = useRef<HTMLElement>(null),
    timer = useRef<ReturnType<typeof setTimeout>>(undefined),
    scroll = useRef<HTMLDivElement>(null),
    notify = useNotifications();
  useScrollArea(scroll);
  useEffect(() => {
    let active = true;
    void Promise.resolve(before?.())
      .then(() => invokeUI('version.list', { tabId: tab.id }))
      .then((r) => {
        if (active) {
          setVersions(r.versions);
          setOrigin(r.origin);
          setDerived(r.derived);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [tab.id, tab.versionId, tab.revision, state.jobs, refresh]);
  const current = versions.find((v) => v.id === tab.versionId) || versions[0];
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        !current ||
        !['ArrowLeft', 'ArrowRight'].includes(event.key) ||
        (event.target as HTMLElement)?.closest(
          'input,textarea,[contenteditable=true],[role=dialog],.nps-popover,.library-viewer',
        )
      )
        return;
      const images = current.images.filter((i) => !i.deleted);
      if (images.length < 2) return;
      const index = images.findIndex((i) => i.projectId === tab.versionImageId),
        next =
          images[
            Math.max(0, Math.min(images.length - 1, index + (event.key === 'ArrowRight' ? 1 : -1)))
          ];
      event.preventDefault();
      void Promise.resolve(before?.()).then(() =>
        invokeUI('version.open', { tabId: tab.id, versionId: current.id, imageId: next.projectId }),
      );
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [current, tab.id, tab.versionImageId]);
  if (!current) return null;
  const kids = (id: string) => versions.filter((v) => v.parentId === id);
  const line: WorkVersion[] = [];
  let end = current;
  while (kids(end.id).length) end = kids(end.id)[0];
  for (let v: WorkVersion | undefined = end; v; v = versions.find((x) => x.id === v?.parentId))
    line.unshift(v);
  const delta = (v: WorkVersion) =>
    versionDiff(versions.find((x) => x.id === v.parentId)?.project || v.project, v.project);
  const open = async (v: WorkVersion, imageId?: string) => {
    try {
      await before?.();
      setLeft(current.branchId);
      await invokeUI('version.open', { tabId: tab.id, versionId: v.id, imageId });
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };
  const rename = (v: WorkVersion) => {
    setPeek(null);
    setRenaming(v);
    setName(v.branchName);
  };
  const hover = (v: WorkVersion, node: HTMLElement) => {
    clearTimeout(timer.current);
    peekAnchor.current = node;
    timer.current = setTimeout(() => setPeek(v), 400);
  };
  const pending = state.jobs.filter((j) => j.tabId === tab.id && j.state === 'pending');
  const job = state.jobs.find(
    (j) => j.tabId === tab.id && ['queued', 'generating', 'failed'].includes(j.state),
  );
  const changed = tab.project && versionDiff(current.project, tab.project);
  const thumbnail = (v: WorkVersion, image: WorkVersion['images'][number]) => (
    <ContextMenu
      key={image.id}
      label="图片操作"
      items={[
        {
          id: 'new-work',
          label: '作为新作品打开',
          onSelect: () => {
            void invokeUI('work.open-from-image', {
              tabId: tab.id,
              versionId: v.id,
              imageId: image.projectId,
            }).then(() => notify({ text: '已作为新作品打开' }));
          },
        },
        {
          id: 'trash',
          label: '移入回收站',
          onSelect: () => {
            void invokeUI('library.trash', { ids: [image.projectId] }).then(() => {
              setVersions(
                versions.map((x) => ({
                  ...x,
                  images: x.images.map((i) =>
                    i.projectId === image.projectId ? { ...i, deleted: true } : i,
                  ),
                })),
              );
              notify({
                text: '已移入回收站',
                action: {
                  label: '撤销',
                  onClick: () => {
                    void invokeUI('library.restore', { ids: [image.projectId] })
                      .then(() => invokeUI('version.list', { tabId: tab.id }))
                      .then((r) => setVersions(r.versions));
                  },
                },
              });
            });
          },
        },
      ]}
    >
      <button
        className="wb-version-thumb"
        key={image.id}
        aria-label={`${v.parentId ? `第 ${v.number} 版` : '原图'} 图片`}
        aria-current={tab.versionImageId === image.projectId ? 'true' : undefined}
        style={{
          aspectRatio: String(
            Math.max(
              token('--thumb-ratio-min'),
              Math.min(
                token('--thumb-ratio-max'),
                v.project.metadata.width / v.project.metadata.height,
              ),
            ),
          ),
        }}
        onClick={(e) => {
          e.stopPropagation();
          void open(v, image.projectId);
        }}
      >
        <VersionThumbnail id={image.projectId} />
      </button>
    </ContextMenu>
  );
  return (
    <ResizablePanel
      width={width}
      defaultWidth={token('--versions-w')}
      min={token('--versions-w')}
      max={token('--popover-w')}
      edge="right"
      label="版本栏宽度"
      onWidthChange={(v) => {
        setWidth(v);
        localStorage.setItem('nps.versions-width', String(v));
      }}
    >
      <section className="wb-versions">
        <header>
          <ContextMenu
            label="版本操作"
            items={[{ id: 'rename', label: '重命名分支…', onSelect: () => rename(current) }]}
          >
            <span
              ref={(node) => {
                anchor.current = node;
              }}
            >
              版本 · {current.branchName}
            </span>
          </ContextMenu>
          <small>
            {versions.length} 版 ·{' '}
            {versions.reduce((n, v) => n + v.images.filter((i) => !i.deleted).length, 1)} 张
          </small>
        </header>
        <div
          className="wb-versions-scroll"
          ref={scroll}
          onScroll={() => {
            clearTimeout(timer.current);
            setPeek(null);
          }}
        >
          {origin && (
            <Button
              variant="quiet"
              onClick={() =>
                void invokeUI('work.open', {
                  workId: origin.workId,
                  versionId: origin.versionId,
                  imageId: origin.projectId,
                })
              }
            >
              来自 {origin.name || '原作品'} · 第 {origin.number} 版 ↗
            </Button>
          )}
          {derived.map((d) => (
            <Button
              variant="quiet"
              key={d.workId}
              onClick={() => void invokeUI('work.open', { workId: d.workId })}
            >
              已作为新作品打开 · 第 {d.source.number} 版 ↗
            </Button>
          ))}
          <AnimatedItems ids={line.map((v) => v.id)} attribute="data-version-id">
            {line.map((v) => {
              const images = v.images.filter((i) => !i.deleted),
                limit = Math.max(
                  2,
                  Math.floor(
                    (width - 2 * token('--sp-4')) /
                      ((token('--ctl') + token('--sp-2')) *
                        Math.max(
                          0.5,
                          Math.min(
                            token('--thumb-ratio-max'),
                            v.project.metadata.width / v.project.metadata.height,
                          ),
                        ) +
                        token('--sp-1')),
                  ) *
                    2 -
                    1,
                );
              let visible = expanded.includes(v.id) ? images : images.slice(0, limit);
              const selected = images.find((i) => i.projectId === tab.versionImageId);
              if (selected && !visible.includes(selected))
                visible = [...visible.slice(0, -1), selected];
              const forks = kids(v.id)
                .filter((k) => !line.includes(k))
                .sort((a, b) => Number(b.branchId === left) - Number(a.branchId === left));
              return (
                <div key={v.id} data-version-id={v.id}>
                  <ContextMenu
                    label="版本操作"
                    items={[{ id: 'rename', label: '重命名分支…', onSelect: () => rename(v) }]}
                  >
                    <div
                      tabIndex={0}
                      role="button"
                      className={`wb-version-row ${v.id === current.id ? 'is-current' : ''}`}
                      onClick={() => void open(v)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void open(v);
                      }}
                      onMouseEnter={(e) => hover(v, e.currentTarget)}
                      onFocus={(e) => hover(v, e.currentTarget)}
                      onMouseLeave={() => {
                        clearTimeout(timer.current);
                        setPeek(null);
                      }}
                    >
                      {v.parentId && v.branchId === v.id && <small>{v.branchName}</small>}
                      <span className="wb-version-number">
                        {v.parentId ? `第 ${v.number} 版` : '原图'}
                        {v.source === 'agent' ? ' · Agent' : ''}
                      </span>
                      <span className="wb-version-summary">{diffSummary(delta(v))}</span>
                      <div className="wb-version-images">
                        {visible.map((i) => thumbnail(v, i))}
                        {!v.parentId && !images.length && (
                          <img
                            src={mediaUrl(v.project.thumbnail_path || v.project.image_path)}
                            alt="原图"
                          />
                        )}
                        {v.parentId && !images.length && <span>图片都在回收站</span>}
                        {images.length > limit && (
                          <Button
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpanded(
                                expanded.includes(v.id)
                                  ? expanded.filter((id) => id !== v.id)
                                  : [...expanded, v.id],
                              );
                            }}
                          >
                            {expanded.includes(v.id)
                              ? '收起'
                              : `+${images.length - visible.length}`}
                          </Button>
                        )}
                      </div>
                    </div>
                  </ContextMenu>
                  {v.id === current.id && changed && !changed.empty && (
                    <div
                      className="wb-version-draft"
                      tabIndex={0}
                      onMouseEnter={(e) =>
                        hover(
                          {
                            ...current,
                            id: 'draft',
                            parentId: current.id,
                            project: tab.project!,
                            number: versions.length + 1,
                          },
                          e.currentTarget,
                        )
                      }
                      onFocus={(e) =>
                        hover(
                          {
                            ...current,
                            id: 'draft',
                            parentId: current.id,
                            project: tab.project!,
                            number: versions.length + 1,
                          },
                          e.currentTarget,
                        )
                      }
                      onMouseLeave={() => {
                        clearTimeout(timer.current);
                        setPeek(null);
                      }}
                    >
                      未生成
                      {kids(v.id).length
                        ? ` · 分支 ${Math.max(...versions.map((v) => v.branchNumber)) + 1}`
                        : ''}
                      <small>{diffSummary(changed)}</small>
                    </div>
                  )}
                  {(expanded.includes(`fork:${v.id}`)
                    ? forks
                    : forks.length > 3
                      ? forks.slice(0, 2)
                      : forks
                  ).map((f) => (
                    <ContextMenu
                      label="版本操作"
                      key={f.id}
                      items={[
                        { id: 'open', label: '切换到这一支', onSelect: () => void open(f) },
                        { id: 'rename', label: '重命名分支…', onSelect: () => rename(f) },
                      ]}
                    >
                      <button
                        className="wb-version-fork"
                        onClick={() => void open(f)}
                        onMouseEnter={(e) => hover(f, e.currentTarget)}
                        onMouseLeave={() => {
                          clearTimeout(timer.current);
                          setPeek(null);
                        }}
                      >
                        <span>
                          {f.branchName}
                          {f.branchId === left
                            ? ' · 刚才所在'
                            : f.source === 'agent'
                              ? ' · Agent'
                              : ''}
                        </span>
                        <small>{oneLine(delta(f))}</small>
                      </button>
                    </ContextMenu>
                  ))}
                  {forks.length > 3 && (
                    <Button
                      variant="quiet"
                      onClick={() =>
                        setExpanded(
                          expanded.includes(`fork:${v.id}`)
                            ? expanded.filter((id) => id !== `fork:${v.id}`)
                            : [...expanded, `fork:${v.id}`],
                        )
                      }
                    >
                      {expanded.includes(`fork:${v.id}`) ? '收起' : `另外 ${forks.length - 2} 支`}
                    </Button>
                  )}
                </div>
              );
            })}
          </AnimatedItems>
          {pending.map((j) => (
            <div className="wb-version-draft" key={j.id}>
              待确认 · Agent<small>{j.count} 张</small>
            </div>
          ))}
          {job && (
            <div className="wb-version-draft" data-generation-state={job.state}>
              {job.state === 'failed' ? '×' : `生成中 ${job.index} / ${job.count}`}
              <div className="wb-generation-slots">
                <span
                  className={job.state === 'generating' ? 'is-generating' : ''}
                  data-indeterminate={job.progress == null ? 'true' : undefined}
                >
                  {job.state === 'generating' && (
                    <i
                      style={job.progress != null ? { width: `${job.progress * 100}%` } : undefined}
                    />
                  )}
                </span>
                {!job.continuous &&
                  Array.from(
                    { length: Math.min(5, Math.max(0, job.count - job.completed - 1)) },
                    (_, i) => <span key={i} />,
                  )}
                {job.count - job.completed > 6 && `+${job.count - job.completed - 6}`}
              </div>
            </div>
          )}
        </div>
      </section>
      <Popover
        open={!!renaming}
        anchor={anchor}
        label="重命名分支"
        onClose={() => setRenaming(null)}
      >
        <Input
          onKeyDown={(e) => {
            if (e.key === 'Enter' && renaming) {
              void invokeUI('branch.rename', { branchId: renaming.branchId, name });
              setRenaming(null);
            }
          }}
          autoFocus
          aria-label="分支名称"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="nps-help">
          清空就恢复成“{renaming?.branchNumber ? `分支 ${renaming.branchNumber}` : '主线'}”
        </p>
        <div className="settings-actions">
          <Button onClick={() => setRenaming(null)}>取消</Button>
          <Button
            variant="ink"
            onClick={() => {
              if (renaming)
                void invokeUI('branch.rename', { branchId: renaming.branchId, name }).then(() =>
                  setVersions(
                    versions.map((v) =>
                      v.branchId === renaming.branchId
                        ? {
                            ...v,
                            branchName:
                              name.trim() || (v.branchNumber ? `分支 ${v.branchNumber}` : '主线'),
                          }
                        : v,
                    ),
                  ),
                );
              setRenaming(null);
            }}
          >
            确定
          </Button>
        </div>
      </Popover>
      <Layer
        side
        className="nps-popover"
        open={!!peek && !!peek.parentId}
        anchor={peekAnchor}
        role="tooltip"
        onClose={() => setPeek(null)}
      >
        {peek && (
          <>
            <strong>第 {peek.number} 版</strong>
            {delta(peek).size && <p>{oneLine({ ...delta(peek), items: [], paras: [] })}</p>}
            {delta(peek).items.map((item, i) => (
              <span className={`wb-diff-${item.kind}`} key={i}>
                {changeText(item)}{' '}
              </span>
            ))}
            {delta(peek).paras.map((p, i) => (
              <div key={i}>
                <strong>{p.label}</strong>
                <p>
                  <del>{p.old}</del>
                </p>
                <p>
                  <ins>{p.now}</ins>
                </p>
              </div>
            ))}
          </>
        )}
      </Layer>
    </ResizablePanel>
  );
}
function VersionThumbnail({ id }: { id: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    void invokeUI('library.get', { id })
      .then((r) => setSrc(mediaUrl(r.project.thumbnail_path || r.project.image_path)))
      .catch(() => {});
  }, [id]);
  return src ? <img alt="" src={src} /> : null;
}
