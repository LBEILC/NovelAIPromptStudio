import { useEffect, useRef, useState } from 'react';
import { useAsk } from '../kit/dialog';
import { type MenuEntry } from '../kit/menu';
import { ms } from '../kit/motion';
import { useResizable } from '../kit/resize';
import { useNotifications } from '../kit/toast';
import { errorCode, errorDetails, invokeUI } from '../lib/commands';
import { versionDiff } from '../lib/versionDiff';
import type { CommandTab } from '../shared/commands';
import type { WorkOrigin, WorkVersion } from '../shared/generation';
import { useSharedTrash } from '../shell/SharedTrash';
import { useGeneration } from '../state/generation';
import { originGone, originMenu, trashImage } from './original';
import { openCompare } from './Compare';
import { openPick } from './Pick';
import { applyRedrawPrompt, isRedraw, promptOf } from './versionHelpers';
import { applyRandom } from './RandomBlock';
import { nsfwMenu } from '../kit/blur';
type Loaded = {
  tab: string;
  versions: WorkVersion[];
  origin: WorkOrigin | null;
  derived: { workId: string; source: WorkOrigin }[];
};
// 每个标签页最近一次读到的版本：切过去先显示它，不等重新读完（用户 10-26：换了图片，左边还是上一张的分支）
const versionCache = new Map<string, Loaded>();
export function useVersionState({
  tab,
  before,
}: {
  tab: CommandTab;
  before?: () => Promise<void>;
}) {
  const state = useGeneration();
  const notify = useNotifications();
  const [dialog, ask] = useAsk();
  const [sharedDialog, askShared] = useSharedTrash();
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
  const [fetched, setLoaded] = useState<Loaded>({
    tab: '',
    versions: [],
    origin: null,
    derived: [],
  });
  // 切到没看过的标签页、还没读到之前，先照旧显示，但不拿上一个标签页的版本算"未生成"
  const loaded = fetched.tab === tab.id ? fetched : versionCache.get(tab.id) || fetched;
  const { versions, origin, derived } = loaded;
  const stale = loaded.tab !== tab.id;
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
        const next = { tab: tab.id, versions: r.versions, origin: r.origin, derived: r.derived };
        versionCache.set(tab.id, next);
        setLoaded(next);
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
  // 原图移入回收站或从作品里去掉以后，第一行是"起点"（1.5.1）
  const name = (v: WorkVersion) =>
    v.isStart || originGone(v) ? '起点' : v.parentId ? `第 ${v.number} 版` : '原图';
  // 局部重绘那一版和上一版比的是这次重绘用的提示词（promptOf）
  const delta = (v: WorkVersion) =>
    versionDiff(byId(v.parentId)?.project || v.project, promptOf(v));
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
    const against = byId(v.parentId) ? name(byId(v.parentId)!) : name(v);
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
  // 删除分支（2.23）：从这条分支分出来的那一版起整棵子树，图进回收站；下面还有分支时先确认，通知里可以撤销
  const branchTree = (v: WorkVersion) => {
    const first = versions.find(
      (x) => x.branchId === v.branchId && byId(x.parentId)?.branchId !== v.branchId,
    );
    return new Set(first ? subtree(first).map((x) => x.id) : []);
  };
  const branchBusy = (v: WorkVersion) => {
    const tree = branchTree(v);
    return state.jobs.some(
      (j) =>
        j.tabId === tab.id &&
        ['generating', 'queued'].includes(j.state) &&
        (tree.has(j.versionId || '') || tree.has(j.parentId || '')),
    );
  };
  // 删除分支 / 删除这一版（2.23）：都是删掉一棵子树，图进回收站；不止一版时先确认，通知里可以撤销。
  // 只删这一版（1.5.2）：后面的版本接到它的上一版下面，只删一版所以不确认
  const remove = async (kind: 'branch' | 'version' | 'only', v: WorkVersion) => {
    const label = kind === 'branch' ? v.branchName || `分支 ${v.branchNumber}` : name(v);
    // 名字以数字或英文结尾时和后面的汉字隔一个空格（"分支 2 下面"）
    const sp = /[!-~]$/.test(label) ? ' ' : '';
    const run = (confirmed?: boolean) =>
      kind === 'branch'
        ? invokeUI('branch.delete', { branchId: v.branchId, ...(confirmed ? { confirmed } : {}) })
        : invokeUI('version.delete', {
            versionId: v.id,
            ...(kind === 'only' ? { only: true } : {}),
            ...(confirmed ? { confirmed } : {}),
          });
    let r: Awaited<ReturnType<typeof run>>;
    try {
      await before?.();
      try {
        r = await run();
      } catch (e) {
        if (errorCode(e) !== 'needs_confirm') throw e;
        const d = errorDetails<{ branches: number; versions: number; images: number }>(e);
        const body = !d
          ? `${label}${sp}后面还有别的版本，会一起删除。`
          : kind === 'branch'
            ? `${label}${sp}下面还有 ${Math.max(1, d.branches - 1)} 个分支，会一起删除。共 ${d.versions} 版，${d.images} 张图移入回收站。`
            : `${label}${sp}后面还有 ${d.versions - 1} 版${d.branches ? `（其中有 ${d.branches} 个分支）` : ''}，会一起删除。共 ${d.versions} 版，${d.images} 张图移入回收站。`;
        if (!(await ask({ title: `删除${label}？`, body, ok: '删除', danger: true }))) return;
        r = await run(true);
      }
    } catch (e) {
      notify({
        text:
          errorCode(e) === 'branch_generating'
            ? kind === 'branch'
              ? '这条分支正在生成'
              : '这一版或之后的版本正在生成'
            : `删除失败：${(e as Error).message}`,
        tone: 'error',
      });
      return;
    }
    const { undo } = r;
    const what =
      kind === 'branch'
        ? `${label}：${r.versions} 版`
        : kind === 'only'
          ? label
          : `${label}${r.versions > 1 ? `和之后的 ${r.versions - 1} 版` : ''}`;
    notify({
      text: `已删除${what}${r.images ? `，${r.images} 张图已移入回收站` : ''}${kind === 'only' && byId(v.parentId) ? `，后面的版本接到${name(byId(v.parentId)!)}下面` : ''}${r.cancelledJobs ? `，取消了 ${r.cancelledJobs} 个待确认的 Agent 生成` : ''}`,
      action: {
        label: '撤销',
        onClick: () =>
          void invokeUI('branch.restore', { undo }).catch((e) =>
            notify({ text: `撤销失败：${(e as Error).message}`, tone: 'error' }),
          ),
      },
    });
  };
  const treeBusy = (v: WorkVersion) => {
    const tree = new Set(subtree(v).map((x) => x.id));
    return state.jobs.some(
      (j) =>
        j.tabId === tab.id &&
        ['generating', 'queued'].includes(j.state) &&
        (tree.has(j.versionId || '') || tree.has(j.parentId || '')),
    );
  };
  const ownBusy = (v: WorkVersion) =>
    state.jobs.some(
      (j) =>
        j.tabId === tab.id &&
        ['generating', 'queued'].includes(j.state) &&
        (j.versionId === v.id || j.parentId === v.id),
    );
  // row：版本行上的菜单多一项"删除这一版"（原图和起点没有）；分叉行和分支名只有"删除分支"（主线没有）
  const renameMenu = (
    v: WorkVersion,
    anchor: string,
    fork?: boolean,
    row?: boolean,
  ): MenuEntry[] => [
    ...(fork ? [{ label: '切换到这一支', onSelect: () => void go(v) }, 'sep' as const] : []),
    // 挑图（1.8.6，2.47）：一版有 2 张以上时
    ...(row && v.parentId && v.images.filter((i) => !i.deleted).length > 1
      ? [
          {
            label: '挑图…',
            icon: 'checkbox-multiple-line',
            onSelect: () => openPick(tab.id, v.id),
          },
          'sep' as const,
        ]
      : []),
    // 局部重绘那一版：把这次重绘用的提示词放回草稿，在它的基础上再重绘
    ...(row && isRedraw(v)
      ? [
          {
            label: '用这次重绘的提示词',
            onSelect: () => void applyRedrawPrompt({ tabId: tab.id, version: v, before, notify }),
          },
          'sep' as const,
        ]
      : []),
    { label: '重命名分支…', onSelect: () => setRename({ v, anchor, text: v.branchName }) },
    ...(row && v.parentId
      ? [
          'sep' as const,
          // 后面还有版本时：只删这一版，后面的接到上一版下面
          ...(subtree(v).length > 1
            ? [
                {
                  label: '只删除这一版',
                  danger: true,
                  disabled: ownBusy(v) ? '这一版正在生成' : false,
                  onSelect: () => void remove('only', v),
                },
              ]
            : []),
          {
            label:
              subtree(v).length > 1
                ? `删除这一版和之后的 ${subtree(v).length - 1} 版`
                : '删除这一版',
            danger: true,
            disabled: treeBusy(v) ? '这一版或之后的版本正在生成' : false,
            onSelect: () => void remove('version', v),
          },
        ]
      : []),
    ...(v.branchNumber
      ? [
          ...(row && v.parentId ? [] : ['sep' as const]),
          {
            label: '删除分支',
            danger: true,
            disabled: branchBusy(v) ? '这条分支正在生成' : false,
            onSelect: () => void remove('branch', v),
          },
        ]
      : []),
  ];
  const ctx = (items: MenuEntry[]) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(peekTimer.current);
    setPeek(null);
    setMenu({ at: [e.clientX, e.clientY], items });
  };
  // 舞台上现在这张：右键别的缩略图可以和它对比（1.8.1）
  const stageImage = tab.versionImageId || current?.project.id;
  const thumbMenu = (v: WorkVersion, imageId: string, trash = true): MenuEntry[] => [
    ...(current && stageImage && imageId !== stageImage
      ? [
          {
            label: '和当前这张对比',
            icon: 'contrast-2-line',
            onSelect: () =>
              openCompare(
                tab.id,
                { versionId: current.id, imageId: stageImage },
                { versionId: v.id, imageId },
              ),
          },
          'sep' as const,
        ]
      : []),
    // 图片模糊（1.8.3，2.37）：版本里的图只有 ID，不知道现在的状态时三项都给
    ...nsfwMenu([imageId], imageId === v.project.id ? v.project.nsfw : undefined, (text) =>
      notify({ text, tone: 'error' }),
    ),
    'sep' as const,
    // 随机块（2.44）：草稿里的随机块换成这张图实际抽到的文字和权重，接着细调
    ...(v.images.find((i) => i.projectId === imageId)?.random?.blocks.length
      ? [
          {
            label: '用这张抽到的内容',
            icon: 'dice-line',
            onSelect: () =>
              void applyRandom({ tabId: tab.id, versionId: v.id, imageId, before, notify }),
          },
        ]
      : []),
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
              void trashImage(imageId, tab.workId, {
                notify,
                refresh: () => setRefresh((n) => n + 1),
                ask: askShared,
              }),
          },
        ]
      : v.parentId
        ? []
        : [
            'sep' as const,
            originMenu(v, tab.id, {
              before,
              notify,
              refresh: () => setRefresh((n) => n + 1),
              ask: askShared,
              workId: tab.workId,
            }),
          ]),
  ];
  // 生成中：一版一张张出来，正在生成的格子是实底加墨色细条，排队的是虚线框；失败的格子是绛红色的叉
  // 1.8.6 起同一个标签页能排好几份（2.46）：每份各自显示，排在它基于的那一版下面或另起一行
  const jobs = state.jobs.filter((j) => j.tabId === tab.id);
  const live = jobs.filter((j) => ['queued', 'generating'].includes(j.state));
  const active = (live.length ? live : jobs.at(-1)?.state === 'failed' ? [jobs.at(-1)!] : []).map(
    (j) => ({
      job: j,
      appending: versionDiff(byId(j.parentId)?.project || j.project, j.project).empty,
    }),
  );
  const job = active[0]?.job;
  const appending = active[0]?.appending;
  // 草稿已经排进队列（和某一份一样）时不再显示"未生成"那一行
  const draftQueued =
    !!tab.project && live.some((j) => !j.operation && versionDiff(j.project, tab.project!).empty);
  const pending = jobs.filter((j) => j.state === 'pending');
  const draft = !stale && current && tab.project ? versionDiff(current.project, tab.project) : null;
  const rowW = (rz.width || ms('--versions-w')) - 32;
  const ratio = (v: WorkVersion) =>
    Math.max(
      ms('--thumb-ratio-min') || 0.5,
      Math.min(
        ms('--thumb-ratio-max') || 2.5,
        (v.project.metadata.width || 832) / (v.project.metadata.height || 1216),
      ),
    );
  return {
    ratio,
    go,
    ctx,
    thumbMenu,
    job,
    appending,
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
    /** 现在显示的是哪个标签页的版本（还没读到新标签页时是上一个） */
    shownTab: loaded.tab,
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
  };
}
