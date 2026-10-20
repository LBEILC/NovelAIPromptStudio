// 图片库（doc/design.md 2.13）：左边常驻侧栏；工具栏是搜索、筛选、视图、导入；右边详情栏只读显示提示词。
// 底部浮着导入进度、整理图片库的进度和多选操作条（[data-dock]，通知停在它们上方）。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, EmptyMark } from '../kit/controls';
import { ContextMenu, type MenuEntry } from '../kit/menu';
import { useExitList, ms } from '../kit/motion';
import { useResizable } from '../kit/resize';
import { useNotifications } from '../kit/toast';
import { Viewer, type ViewerItem } from '../kit/Viewer';
import { invokeUI } from '../lib/commands';
import { writeClipboardText } from '../lib/clipboard';
import { mediaUrl } from '../lib/imageStage.js';
import { hasImageName } from '../lib/imageNaming.js';
import { GALLERY_CARD_SIZE_KEY } from '../lib/galleryLayout.js';
import { GALLERY_PREVIEW_PANEL_WIDTH_KEY } from '../lib/panelLayout.js';
import { DEFAULT_GALLERY_FILTERS, hasActiveGalleryFilters } from '../lib/galleryFilters.js';
import { fallbackRatio, rowHeightFromLegacyWidth } from '../library/layout';
import { libraryCountText } from '../library/presentation';
import { libraryPositivePrompt } from '../library/Prompt';
import { useLibraryDetail } from '../state/libraryDetail';
import { Side } from './Side';
import { Tools } from './Tools';
import { Grid } from './Grid';
import { Detail } from './Detail';
import { CollectPop } from './Collect';
import { BatchNamePop } from './BatchName';
import { NameAI } from './NameAI';
import type { LibraryGroup, LibraryProps } from '../library/types';
import type { LibraryCardCacheProgress } from '../shared/ipc';
import type { ImportProgress, LibraryCard } from '../shared/types';

const stored = (key: string) => {
  try {
    return Number(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
};
const persist = (key: string, value: number) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* 记不住也照常能用 */
  }
};

export default function GalleryPage(
  props: LibraryProps & {
    cacheProgress?: LibraryCardCacheProgress | null;
    importProgress?: ImportProgress | null;
    onCancelImport: () => void;
    dragState?: { active: boolean; valid: boolean };
  },
) {
  const notify = useNotifications();
  const [aiConfigured, setAI] = useState(false);
  useEffect(() => {
    let live = true;
    void invokeUI('settings.ai.get', {}).then((s) => live && setAI(!!s.model));
    return () => {
      live = false;
    };
  }, []);
  const [renameRequest, setRenameRequest] = useState<{ id: string; sequence: number }>();
  const p = {
    ...props,
    aiConfigured,
    renameRequest,
    onRequestRename: (id: string) => setRenameRequest({ id, sequence: Date.now() }),
  };
  const [rowHeight, setRowHeight] = useState(() => {
    const legacy = stored(GALLERY_CARD_SIZE_KEY);
    return legacy ? rowHeightFromLegacyWidth(legacy) : ms('--thumb-row') || 180;
  });
  const onRowHeight = (h: number) => {
    setRowHeight(h);
    persist(GALLERY_CARD_SIZE_KEY, h * fallbackRatio);
  };
  const search = useRef<HTMLInputElement>(null);
  const detailCol = useRef<HTMLDivElement>(null);
  const rz = useResizable(detailCol, {
    key: 'detail',
    edge: 'left',
    min: () => ms('--popover-w'),
    max: () => ms('--prompt-w'),
    def: () => ms('--detail-w'),
    storage: GALLERY_PREVIEW_PANEL_WIDTH_KEY,
    label: '详情栏宽度',
  });
  const { detail } = useLibraryDetail(p.preview?.id || '', p.preview);
  // 没有选中的就选第一组
  useEffect(() => {
    if (!p.preview && p.groups.length && !p.loading) p.onPreview(p.groups[0]);
  }, [p.preview, p.groups, p.loading]);
  const picked = p.groups.filter((g) => p.selectedGroupIds.includes(g.id));
  const pickedIds = picked.flatMap((g) => g.members.map((m) => m.id));
  const trash = p.view === 'trash';

  // 大图：按图片库当前的顺序，遇到一组依次走完
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number } | null>(null);
  const openViewer = (group: LibraryGroup, member?: { id: string }) => {
    if (p.selectedGroupIds.length) return;
    const items: ViewerItem[] = p.groups.flatMap((g) =>
      g.members.map((m) => ({ id: m.id, src: mediaUrl(m.image_path), group: g.id })),
    );
    const start = member?.id || group.cover.id;
    setViewer({
      items,
      index: Math.max(
        0,
        items.findIndex((x) => x.id === start),
      ),
    });
  };
  const memberOf = (id: string) => p.groups.flatMap((g) => g.members).find((m) => m.id === id);

  // 右键卡片：右键的是多选里的一张时对选中的全部生效
  const [menu, setMenu] = useState<{
    at: [number, number];
    group: LibraryGroup;
    member: LibraryCard;
  } | null>(null);
  const [collect, setCollect] = useState<'detail' | 'dock' | null>(null);
  const [batchName, setBatchName] = useState(false);
  const [nameAI, setNameAI] = useState<{ groups: LibraryGroup[]; seq: number } | null>(null);
  const collectIds =
    collect === 'dock' ? pickedIds : p.previewGroup?.members.map((m) => m.id) || [];
  const copyPrompt = async (id: string) => {
    const r = await invokeUI('library.get', { id });
    if (r.project) {
      await writeClipboardText(libraryPositivePrompt(r.project));
      notify({ text: '已复制提示词' });
    }
  };
  const menuItems: MenuEntry[] = (() => {
    if (!menu) return [];
    const multi = p.selectedGroupIds.includes(menu.group.id) && pickedIds.length > 1;
    const ids = multi ? pickedIds : menu.group.members.map((m) => m.id);
    if (trash)
      return [
        { label: '恢复', onSelect: () => void p.onRestore(ids) },
        'sep',
        { label: '永久删除…', danger: true, onSelect: () => void p.onPermanentDelete(ids) },
      ];
    return [
      {
        label: multi ? `在工作台打开 ${ids.length} 张` : '在工作台打开',
        onSelect: () => {
          for (const m of multi ? picked.flatMap((g) => g.members) : [menu.member])
            p.onOpenWorkbench(m);
        },
      },
      {
        label: '加入收藏集…',
        onSelect: () => {
          if (multi) setCollect('dock');
          else {
            p.onPreview(menu.group, menu.member);
            setCollect('detail');
          }
        },
      },
      ...(multi ? [] : [{ label: '复制提示词', onSelect: () => void copyPrompt(menu.member.id) }]),
      {
        label: multi || !hasImageName(menu.member) ? '起名' : '重命名',
        onSelect: () => {
          if (multi) setBatchName(true);
          else {
            p.onPreview(menu.group, menu.member);
            p.onRequestRename?.(menu.member.id);
          }
        },
      },
      ...(p.activeCollection?.kind === 'manual'
        ? [
            {
              label: '移出这个收藏集',
              onSelect: () =>
                void p.onCollectionProjectsChange(p.activeCollection!.id, ids, 'remove'),
            },
          ]
        : []),
      'sep',
      { label: '移入回收站', danger: true, onSelect: () => void p.onTrash(ids) },
    ];
  })();

  // 空状态
  const searching = !!p.query.trim();
  const filtering = hasActiveGalleryFilters({ ...p.filters, query: '' });
  const noImages =
    !p.loading &&
    !p.groups.length &&
    !(p.allCount ?? p.filterCacheSource.length) &&
    !trash &&
    !p.activeCollection;
  const emptyTitle =
    searching || filtering
      ? '没有符合的图片'
      : trash
        ? '回收站为空'
        : p.activeCollection?.kind === 'smart'
          ? '没有符合规则的图片'
          : p.activeCollection
            ? '收藏集为空'
            : '暂无图片';
  const emptyText = searching
    ? filtering
      ? '当前的搜索和筛选条件下没有图片。'
      : `文件名和 Tag 中都不包含"${p.query}"。`
    : filtering
      ? '当前的筛选条件下没有图片。'
      : trash
        ? '移入回收站的图片会保留在这里，直到恢复或永久删除。'
        : p.activeCollection?.kind === 'smart'
          ? '符合规则的新图片会自动显示在这里。'
          : '在详情栏或卡片的右键菜单中选择"加入收藏集"即可添加图片。';
  const empty = noImages ? (
    <div className="empty" data-enter="fade">
      <EmptyMark />
      <h3>图片库里还没有图片</h3>
      <p>把图片或 NovelAI 导出的 ZIP 拖到这里。软件会复制一份保存，并读出每张图的提示词和参数。</p>
      <div className="acts">
        <button className="btn ink" onClick={p.onImport}>
          导入图片
        </button>
        <button className="btn" onClick={p.onImportClipboard}>
          从剪贴板导入
        </button>
      </div>
      <span className="fine">导入不会修改或移动你原来的文件。</span>
    </div>
  ) : (
    <div className="empty" data-enter="fade" key={`${emptyTitle}-${p.contentKey}`}>
      <h3>{emptyTitle}</h3>
      <p>{emptyText}</p>
      {(searching || filtering) && (
        <div className="acts">
          <button className="btn" onClick={() => p.onFiltersChange(DEFAULT_GALLERY_FILTERS)}>
            {searching && filtering ? '清除搜索和筛选' : searching ? '清除搜索' : '清除筛选'}
          </button>
        </div>
      )}
    </div>
  );

  // 底部浮条：导入进度、整理图片库、多选操作条；出现从下方上来，消失淡出
  const busyImport =
    p.importProgress && ['preparing', 'importing'].includes(p.importProgress.phase)
      ? p.importProgress
      : null;
  const docks = useExitList(
    [
      ...(busyImport ? [{ key: 'import' }] : []),
      ...(p.cacheProgress ? [{ key: 'cache' }] : []),
      ...(picked.length ? [{ key: 'pick' }] : []),
    ],
    (d) => d.key,
  );
  const lastImport = useRef(busyImport);
  if (busyImport) lastImport.current = busyImport;
  const lastCache = useRef(p.cacheProgress);
  if (p.cacheProgress) lastCache.current = p.cacheProgress;
  const lastPick = useRef({ groups: picked.length, images: pickedIds.length });
  if (picked.length) lastPick.current = { groups: picked.length, images: pickedIds.length };
  const dock = (key: string, leaving: boolean) => {
    if (key === 'import') {
      const ip = lastImport.current!;
      const done = ip.processed || 0,
        total = ip.total || 0;
      return (
        <div key={key} className={`job ljob ${leaving ? 'leaving' : ''}`} data-enter="up">
          <div className="top">
            <span className="spin" />
            <b>
              正在导入 {Math.min(done + 1, Math.max(total, 1))} / {total}
            </b>
            <span className="sp" />
            <button className="btn quiet sm" onClick={p.onCancelImport}>
              取消剩余
            </button>
          </div>
          <div className="progress ink">
            <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
          </div>
          <small>
            {'duplicates' in ip && ip.duplicates
              ? `已跳过 ${ip.duplicates} 张图片库里已有的图片`
              : '导入不会修改或移动原文件'}
          </small>
        </div>
      );
    }
    if (key === 'cache') {
      const c = lastCache.current!;
      return (
        <div key={key} className={`job ljob ${leaving ? 'leaving' : ''}`} data-enter="up">
          <div className="top">
            <span className="spin" />
            <b>
              正在整理图片库 {c.completed.toLocaleString('en-US')} /{' '}
              {c.total.toLocaleString('en-US')}
            </b>
          </div>
          <div className="progress ink">
            <i style={{ width: `${c.total ? (c.completed / c.total) * 100 : 0}%` }} />
          </div>
          <small>
            第一次打开新版本时整理一次。整理完之前，搜索和筛选的结果可能不全，可以照常使用
          </small>
        </div>
      );
    }
    return (
      <span
        key={key}
        className={`selbar ${leaving ? 'leaving' : ''}`}
        data-enter="up"
        aria-label="多选操作条"
      >
        <span className="n">
          已选 {libraryCountText(lastPick.current.groups, lastPick.current.images)}
        </span>
        {trash ? (
          <>
            <button className="btn quiet sm" onClick={() => p.onRestore(pickedIds)}>
              恢复
            </button>
            <button className="btn danger sm" onClick={() => p.onPermanentDelete(pickedIds)}>
              永久删除
            </button>
          </>
        ) : (
          <>
            <button
              className="btn quiet sm"
              onClick={() => picked.flatMap((g) => g.members).forEach(p.onOpenWorkbench)}
            >
              在工作台打开
            </button>
            <button
              className={`btn quiet sm ${collect === 'dock' ? 'is-hover' : ''}`}
              data-trigger="lcollect-dock"
              onClick={() => setCollect(collect === 'dock' ? null : 'dock')}
            >
              加入收藏集
            </button>
            <button
              className={`btn quiet sm ${batchName ? 'is-hover' : ''}`}
              data-trigger="lbname"
              onClick={() => setBatchName(!batchName)}
            >
              起名
            </button>
            <button
              className={`btn quiet sm ${aiConfigured ? '' : 'is-off'}`}
              aria-disabled={!aiConfigured || undefined}
              data-tip={
                aiConfigured ? undefined : '根据提示词起名：请先在设置的"AI 服务"中完成配置'
              }
              onClick={() => aiConfigured && setNameAI({ groups: picked, seq: Date.now() })}
            >
              <Icon name="sparkling-2-line" />
              根据提示词起名
            </button>
            {p.activeCollection?.kind === 'manual' && (
              <button
                className="btn quiet sm"
                onClick={() =>
                  p.onCollectionProjectsChange(p.activeCollection!.id, pickedIds, 'remove')
                }
              >
                移出这个收藏集
              </button>
            )}
            <button className="btn danger sm" onClick={() => p.onTrash(pickedIds)}>
              移入回收站
            </button>
          </>
        )}
        <button className="btn quiet sm" onClick={p.onClearSelection}>
          取消
        </button>
      </span>
    );
  };
  const showTools = !noImages || !!p.activeCollection;
  return (
    <div
      className="body libp"
      onKeyDown={(e) => {
        if ((e.target as Element).closest('input, textarea, [contenteditable=true]')) return;
        if (e.key === 'Escape' && p.selectedGroupIds.length) p.onClearSelection();
      }}
    >
      <Side p={p} />
      <div className="col lib-grid-col">
        {showTools && (
          <Tools p={p} rowHeight={rowHeight} onRowHeight={onRowHeight} searchRef={search} />
        )}
        <Grid
          p={p}
          rowHeight={rowHeight}
          onRowHeight={onRowHeight}
          onViewer={openViewer}
          onCardMenu={(at, group, member) => {
            if (!p.selectedGroupIds.includes(group.id)) {
              p.onClearSelection();
              p.onPreview(group, member);
            }
            setMenu({ at, group, member });
          }}
          empty={empty}
        />
        <div className="dock ldock" data-dock="">
          {docks.map((d) => dock(d.key, d.leaving))}
        </div>
        {p.dragState?.active && (
          <div className="dropzone" data-enter="fade">
            {p.dragState.valid ? '松开后导入图片库' : '只能导入 PNG、JPG、WEBP 图片和 ZIP'}
          </div>
        )}
      </div>
      {!noImages && (
        <Detail
          p={p}
          detail={detail}
          a={{
            onViewer: openViewer,
            onCollect: () => setCollect(collect === 'detail' ? null : 'detail'),
            onNameAI: (groups) => setNameAI({ groups, seq: Date.now() }),
            collectOpen: collect === 'detail',
            colRef: detailCol,
            handle: rz.handle,
          }}
        />
      )}
      <ContextMenu
        at={menu?.at || null}
        onClose={() => setMenu(null)}
        items={menuItems}
        className="lsp"
      />
      <CollectPop
        p={p}
        open={!!collect}
        onClose={() => setCollect(null)}
        ids={collectIds}
        from={collect || 'detail'}
      />
      <BatchNamePop
        open={batchName && picked.length > 0}
        onClose={() => setBatchName(false)}
        count={pickedIds.length}
        onSubmit={(name) => p.onRenameMany(pickedIds, name)}
      />
      <NameAI p={p} request={nameAI} onDone={() => setNameAI(null)} />
      <Viewer
        open={!!viewer}
        items={viewer?.items || []}
        index={viewer?.index || 0}
        onIndex={(index) => setViewer((v) => (v ? { ...v, index } : v))}
        onClose={() => setViewer(null)}
        onCopy={(it) => {
          const m = memberOf(it.id);
          if (m) void p.onCopyImage(m);
        }}
        onSaveAs={(it) => {
          const m = memberOf(it.id);
          if (m) void p.onDownloadImage(m);
        }}
        onOpenWorkbench={
          trash
            ? undefined
            : (it) => {
                const m = memberOf(it.id);
                if (m) {
                  setViewer(null);
                  p.onOpenWorkbench(m);
                }
              }
        }
      />
    </div>
  );
}
