// 标题栏右边的生成状态（doc/design.md 2.9、2.23）：平时是余额（和 V5 免费用量）；生成时换成"生成中 · 2 / 3"加墨色进度。
// 1.8.6 起点开是生成队列（2.46）：正在生成的、排队中的（拖动排序、改张数、暂缓、移除）、Agent 待确认的，
// 底部写剩余多少、今天花了多少、暂停 / 继续；最近完成的折叠成一行。没有配置账号时什么都没有。
import { useEffect, useRef, useState } from 'react';
import { Pop } from '../kit/layer';
import { Icon } from '../kit/controls';
import { ContextMenu, MenuButton, type MenuEntry } from '../kit/menu';
import { useNotifications } from '../kit/toast';
import { FlipScope, useExitList, useSwap } from '../kit/motion';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';
import { BlurImg } from '../kit/blur';
import { openPick } from '../workbench/Pick';
import { Thumb } from '../workbench/versionHelpers';
import type { GenerationJob } from '../shared/generation';

/** 放大、增强、局部重绘、扩图时写"放大中""增强中""重绘中""扩图中"（和工作台底栏一致） */
const SIDE: Record<string, string> = { left: '左', right: '右', top: '上', bottom: '下' };
const busyVerb = (op?: string) =>
  op === 'upscale'
    ? '放大中'
    : op === 'enhance'
      ? '增强中'
      : op === 'inpaint'
        ? '重绘中'
        : op === 'outpaint'
          ? '扩图中'
          : '生成中';
const OP: Record<string, string> = {
  upscale: '放大',
  enhance: '增强',
  inpaint: '局部重绘',
  outpaint: '扩图',
  img2img: '图生图',
};

/** 第几张；扩图按边分块时是第几块（"扩图中 1 / 2"） */
const stepOf = (job: { index: number; count: number; blockIndex?: number; blockCount?: number }) =>
  job.blockCount && job.blockCount > 1
    ? `${Math.max(1, job.blockIndex || 1)} / ${job.blockCount}`
    : `${job.index} / ${job.count}`;

/** 移除以后能撤销的时间；命令层留 10 秒，通知短一点 */
const UNDO_MS = 8000;

/**
 * 队列里一项的张数：说明行里的一个数字，点了原地变成小输入框（回车或移开确定，↑↓ 加减，Esc 取消），
 * 和底栏张数的改法一样。不常驻步进器，免得一行挤满（用户 10-26）。
 */
function CountEdit({
  value,
  min,
  onChange,
}: {
  value: number;
  min: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const done = useRef(false);
  const commit = () => {
    if (done.current || text === null) return;
    done.current = true;
    const n = Math.round(Number(text));
    setText(null);
    if (Number.isFinite(n) && n !== value) onChange(Math.max(min, Math.min(9999, n)));
  };
  if (text === null)
    return (
      <span
        className="q-count"
        role="button"
        tabIndex={0}
        data-tip="点击修改张数"
        onClick={(e) => {
          e.stopPropagation();
          done.current = false;
          setText(String(value));
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          e.stopPropagation();
          done.current = false;
          setText(String(value));
        }}
      >
        {value}
      </span>
    );
  return (
    <input
      className="q-count-in mono"
      autoFocus
      aria-label="张数"
      inputMode="numeric"
      value={text}
      size={Math.max(2, text.length)}
      onFocus={(e) => e.currentTarget.select()}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') commit();
        if (e.key === 'Escape') {
          done.current = true;
          setText(null);
        }
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          const n = (Number(text) || value) + (e.key === 'ArrowUp' ? 1 : -1);
          setText(String(Math.max(min, Math.min(9999, n))));
        }
      }}
    />
  );
}

export function GenerationStatus({ onOpen }: { onOpen: (tabId: string) => void }) {
  const state = useGeneration();
  const notify = useNotifications();
  const [open, setOpen] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const seen = useRef(new Map<string, string>());
  const branchSeen = useRef(new Set<string>());
  const resumeTold = useRef(false);
  // 打开软件之前就有的任务（上次留下的失败、待确认）只记下状态，不再通知（用户 10-21：每次重新打开都弹一遍）
  const opened = useRef(Date.now());
  const relay = state.settings.connection === 'relay';
  useEffect(() => {
    // 重启后队列是暂停的（不会一启动就花钱）：说一声，点"查看"打开队列
    const left = state.jobs.filter((j) => j.state === 'queued');
    if (!resumeTold.current && state.paused && left.length) {
      resumeTold.current = true;
      notify({
        text: `上次退出时还有 ${left.length} 个任务没生成，队列已暂停`,
        action: { label: '查看', onClick: () => setOpen(true) },
        source: 'background',
      });
    }
    for (const job of state.jobs) {
      if (!seen.current.has(job.id) && Date.parse(job.createdAt) < opened.current) {
        seen.current.set(job.id, job.state);
        branchSeen.current.add(job.id);
        continue;
      }
      if (job.branchNotice && !branchSeen.current.has(job.id)) {
        branchSeen.current.add(job.id);
        notify({ text: job.branchNotice });
      }
      const previous = seen.current.get(job.id);
      seen.current.set(job.id, job.state);
      if (previous === job.state) continue;
      if (job.state === 'pending' && job.limitReached)
        notify({ text: 'Agent 今天的花费已到上限，之后的生成需要你确认' });
      if (job.state === 'pending')
        notify({
          text: 'Agent 添加了 1 个生成任务，待确认',
          action: { label: '查看', onClick: () => setOpen(true) },
          source: 'background',
        });
      if (job.state === 'failed')
        notify({
          text: relay
            ? `生成失败：${job.error}`
            : `生成失败：${job.error} · ${job.spentKnown ? (job.spent ? `本次已消耗 ${job.spent} Anlas` : '本次未消耗 Anlas') : '无法确认是否消耗了 Anlas'}`,
          tone: 'error',
          action: { label: '重试', onClick: () => void invokeUI('generate.retry', { id: job.id }) },
        });
      if (job.state === 'canceled' && previous === 'generating')
        notify({
          text: job.continuous
            ? `已停止：共完成 ${job.completed} 张`
            : `已停止：完成 ${job.completed} 张，其余已取消`,
        });
      if (job.state === 'skipped')
        notify({ text: `已跳过：完成 ${job.completed} / ${job.count} 张，接着做下一项` });
      // 一次生成 10 张以上（批量、随机块）：完成的通知带"挑图"（1.8.6，2.47）
      if (
        job.state === 'completed' &&
        job.source === 'user' &&
        job.completed >= 10 &&
        job.versionId &&
        !job.failedEdges?.length
      )
        notify({
          text: `已生成 ${job.completed} 张`,
          tone: 'success',
          action: {
            label: '挑图',
            onClick: () => {
              onOpen(job.tabId);
              openPick(job.tabId, job.versionId!);
            },
          },
        });
      // 扩图按边分块中途失败（1.8.5，2.41）：已画好的边存成了新的一版
      if (job.state === 'completed' && job.failedEdges?.length)
        notify({
          text: `扩图没画完：${job.failedEdges.map((k) => SIDE[k]).join('、')}边生成失败${job.failure ? `：${job.failure}` : ''}，已画好的存成了新的一版`,
          tone: 'error',
          action: { label: '查看', onClick: () => onOpen(job.tabId) },
        });
      if (job.state === 'completed' && job.source === 'agent')
        notify({
          text: `Agent 的生成任务已完成：${job.name} 新增 ${job.completed} 张`,
          action: {
            label: '查看',
            onClick: () => {
              onOpen(job.tabId);
              if (job.versionId)
                void invokeUI('version.open', { tabId: job.tabId, versionId: job.versionId });
            },
          },
          source: 'background',
        });
    }
  }, [state.jobs]);

  const pending = state.jobs.filter((j) => j.state === 'pending');
  const running = state.jobs.find((j) => j.state === 'generating');
  const session = (j: GenerationJob) => Date.parse(j.createdAt) >= opened.current;
  // 排队中的和这次打开以后失败的（停在原位写原因），按队列顺序
  const line = state.jobs.filter(
    (j) =>
      j.state === 'queued' || (j.state === 'failed' && session(j) && !dismissed.includes(j.id)),
  );
  const queued = line.filter((j) => j.state === 'queued');
  const recent = state.jobs
    .filter(
      (j) =>
        ['completed', 'canceled', 'skipped'].includes(j.state) &&
        j.finishedAt &&
        Date.parse(j.finishedAt) >= opened.current,
    )
    .slice(-5)
    .reverse();
  const pills = useExitList(pending.length ? [pending.length] : [], () => 'pill');
  // 中转站模式查不到余额（doc/design.md 2.33），不生成、没有排队时这里什么都不放
  const chipKey = running ? 'gen' : queued.length ? 'queue' : relay ? '' : 'anlas';
  const chips = useSwap(chipKey, (k) => k).filter(({ key }) => key);
  const any = !!(running || line.length || pending.length || recent.length);
  useEffect(() => {
    if (open && !any) setOpen(false);
  }, [open, any]);

  // ---------- 拖动排顺序 ----------
  const list = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; order: string[] } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const order = drag
    ? drag.order.map((id) => line.find((j) => j.id === id)!).filter(Boolean)
    : line;
  const move = (id: string, before?: string) =>
    void invokeUI('generate.move', { id, ...(before ? { before } : {}) }).catch((e) =>
      notify({ text: (e as Error).message, tone: 'error' }),
    );
  const startDrag = (id: string) => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const start = line.map((j) => j.id);
    setDrag({ id, order: start });
    const moveAt = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const rows = [...(list.current?.querySelectorAll<HTMLElement>('[data-qid]') || [])].filter(
        (r) => r.dataset.qid !== id,
      );
      let at = rows.findIndex((r) => {
        const b = r.getBoundingClientRect();
        return ev.clientY < b.top + b.height / 2;
      });
      if (at < 0) at = rows.length;
      const rest = rows.map((r) => r.dataset.qid!);
      const next = [...rest.slice(0, at), id, ...rest.slice(at)];
      if (next.join() !== d.order.join()) setDrag({ id, order: next });
    };
    const up = () => {
      window.removeEventListener('pointermove', moveAt);
      window.removeEventListener('pointerup', up);
      const d = dragRef.current;
      setDrag(null);
      if (!d || d.order.join() === start.join()) return;
      move(id, d.order[d.order.indexOf(id) + 1]);
    };
    window.addEventListener('pointermove', moveAt);
    window.addEventListener('pointerup', up);
  };

  // ---------- 每一项的操作 ----------
  const remove = async (job: GenerationJob) => {
    if (job.state === 'failed') {
      setDismissed((d) => [...d, job.id]);
      return;
    }
    try {
      const r = await invokeUI('generate.cancel', { ids: [job.id] });
      if (!r.undo?.length) return;
      notify({
        text: `已移除“${job.name}”的 ${Math.max(0, job.count - job.completed)} 张`,
        duration: UNDO_MS,
        action: {
          label: '撤销',
          onClick: () =>
            void invokeUI('generate.restore', { id: job.id }).catch((e) =>
              notify({ text: (e as Error).message, tone: 'error' }),
            ),
        },
      });
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };
  const run = (p: Promise<unknown>) =>
    void p.catch((e) => notify({ text: (e as Error).message, tone: 'error' }));
  const jobMenu = (job: GenerationJob): MenuEntry[] => {
    const ids = queued.map((j) => j.id);
    const i = ids.indexOf(job.id);
    return [
      {
        label: job.deferred ? '恢复' : '暂缓',
        hint: job.deferred ? undefined : '先不做，留在原位',
        onSelect: () => run(invokeUI('generate.defer', { id: job.id, deferred: !job.deferred })),
      },
      'sep',
      {
        label: '移到最前',
        disabled: i <= 0,
        onSelect: () => move(job.id, ids[0]),
      },
      {
        label: '移到最后',
        disabled: i === ids.length - 1,
        onSelect: () => move(job.id),
      },
      'sep',
      { label: '移除', danger: true, onSelect: () => void remove(job) },
    ];
  };
  const [menu, setMenu] = useState<{ at: [number, number]; items: MenuEntry[] } | null>(null);
  const jump = (job: GenerationJob) => {
    setOpen(false);
    onOpen(job.tabId);
    if (job.versionId)
      void invokeUI('version.open', { tabId: job.tabId, versionId: job.versionId });
  };
  const based = (job: GenerationJob) =>
    job.operation
      ? OP[job.operation] || ''
      : job.parentNumber === 1
        ? '基于原图'
        : job.parentNumber
          ? `基于第 ${job.parentNumber} 版`
          : '';
  const thumb = (job: GenerationJob) => (
    <BlurImg
      image={job.project}
      path={job.project.thumbnail_path || job.project.image_path}
      eye={false}
      alt=""
      draggable={false}
    />
  );
  const head = (job: GenerationJob) => (
    <b>
      <span className="q-name" data-tip-overflow={job.name}>
        {job.name}
      </span>
      {based(job) && <span> · {based(job)}</span>}
      {job.source === 'agent' && <span className="q-tag">Agent</span>}
    </b>
  );
  const anlas = (n?: number) =>
    relay || n == null ? '' : n ? ` · ${Math.round(n)} Anlas` : ' · 免费';

  const runRow = (job: GenerationJob) => {
    const left = Math.max(0, job.count - job.completed);
    return (
      <div
        className="q-item q-run"
        style={
          {
            '--p': `${Math.round((job.progress ?? (job.index - 1) / Math.max(1, job.count)) * 100)}%`,
          } as React.CSSProperties
        }
        role="button"
        tabIndex={0}
        onClick={() => jump(job)}
        onKeyDown={(e) => e.key === 'Enter' && jump(job)}
      >
        {thumb(job)}
        <div className="q-main">
          {head(job)}
          {job.summary && <small>{job.summary}</small>}
          <small className="q-meta">
            {job.continuous ? (
              `生成中 · 第 ${job.index} 张 · 持续生成`
            ) : job.operation || job.stop || (job.blockCount || 0) > 1 ? (
              `${busyVerb(job.operation)} · ${stepOf(job)}`
            ) : (
              <>
                {busyVerb(job.operation)} · {job.index} /{' '}
                <CountEdit
                  value={job.count}
                  min={job.completed + 1}
                  onChange={(count) => run(invokeUI('generate.set-count', { id: job.id, count }))}
                />{' '}
                张
              </>
            )}
            {job.hasRandomBlocks ? ' · 随机块' : ''}
            {job.stop ? ' · 完成当前这张后停止' : ''}
          </small>
        </div>
        <div className="q-side" onClick={(e) => e.stopPropagation()}>
          {!job.continuous && !job.operation && left > 1 && !job.stop && (
            <button
              className="btn quiet sm icon"
              aria-label="跳过这一项"
              data-tip="这张做完就停，剩下的不发，接着做下一项"
              onClick={() => run(invokeUI('generate.skip', { id: job.id }))}
            >
              <Icon name="skip-forward-line" />
            </button>
          )}
          <button
            className="btn quiet sm icon"
            aria-label={job.stop ? '正在停止' : '停止'}
            disabled={job.stop}
            onClick={() => run(invokeUI('generate.stop', { id: job.id }))}
          >
            <Icon name="stop-line" />
          </button>
        </div>
      </div>
    );
  };
  const queueRow = (job: GenerationJob) => {
    const failed = job.state === 'failed';
    const dragging = drag?.id === job.id;
    return (
      <div
        key={job.id}
        className={`q-item q-job ${job.deferred ? 'deferred' : ''} ${failed ? 'failed' : ''} ${dragging ? 'dragging' : ''}`}
        data-qid={failed ? undefined : job.id}
        data-key={`q-${job.id}`}
        data-flip=""
        role="button"
        tabIndex={0}
        onClick={() => jump(job)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') jump(job);
          if (failed || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          // Alt ↑↓：上移、下移一位（和工作台移动 Tag 同一个键）
          e.preventDefault();
          const ids = queued.map((j) => j.id);
          const i = ids.indexOf(job.id);
          if (e.key === 'ArrowUp' && i > 0) move(job.id, ids[i - 1]);
          if (e.key === 'ArrowDown' && i < ids.length - 1) move(job.id, ids[i + 2]);
        }}
        onContextMenu={(e) => {
          if (failed) return;
          e.preventDefault();
          setMenu({ at: [e.clientX, e.clientY], items: jobMenu(job) });
        }}
      >
        {failed ? (
          <span className="q-grip off" />
        ) : (
          <span
            className="q-grip"
            data-tip="拖动排顺序"
            onPointerDown={startDrag(job.id)}
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="draggable" />
          </span>
        )}
        {thumb(job)}
        <div className="q-main">
          {head(job)}
          {job.summary && <small>{job.summary}</small>}
          {failed ? (
            <small className="q-meta q-err">生成失败：{job.error || '未知原因'}</small>
          ) : (
            <small className="q-meta">
              {job.deferred ? '已暂缓 · ' : ''}
              {job.hasRandomBlocks ? '随机块 · ' : ''}
              {job.continuous ? (
                '持续生成'
              ) : (
                <>
                  {job.completed ? `已完成 ${job.completed} / ` : ''}
                  <CountEdit
                    value={job.count}
                    min={job.completed + 1}
                    onChange={(count) => run(invokeUI('generate.set-count', { id: job.id, count }))}
                  />{' '}
                  张
                </>
              )}
              {anlas(job.estimate)}
              {job.resumedAfterExit ? ' · 上次没发完' : ''}
            </small>
          )}
        </div>
        <div className="q-side" onClick={(e) => e.stopPropagation()}>
          {failed ? (
            <>
              <button
                className="btn quiet sm"
                onClick={() => {
                  setDismissed((d) => [...d, job.id]);
                  run(invokeUI('generate.retry', { id: job.id }));
                }}
              >
                重试
              </button>
              <button
                className="btn quiet sm icon"
                aria-label="移除"
                onClick={() => void remove(job)}
              >
                <Icon name="close-line" />
              </button>
            </>
          ) : (
            <>
              {job.deferred ? (
                <button
                  className="btn quiet sm"
                  onClick={() => run(invokeUI('generate.defer', { id: job.id, deferred: false }))}
                >
                  恢复
                </button>
              ) : null}
              <MenuButton label="这一项的操作" items={() => jobMenu(job)} menuKey={`q-${job.id}`} />
            </>
          )}
        </div>
      </div>
    );
  };

  // ---------- 合计 ----------
  const live = [...(running ? [running] : []), ...queued.filter((j) => !j.deferred)];
  const leftImages = live.reduce(
    (n, j) => n + (j.continuous ? 0 : Math.max(0, j.count - j.completed)),
    0,
  );
  const leftCost = live.reduce(
    (n, j) =>
      n +
      (j.estimate && !j.continuous
        ? (j.estimate * Math.max(0, j.count - j.completed)) / Math.max(1, j.count)
        : 0),
    0,
  );
  const endless = live.some((j) => j.continuous);
  const today = state.today;
  const todayText = relay
    ? `今天生成了 ${today?.images ?? state.settings.spentImagesToday ?? 0} 张`
    : `今天已花 ${(today?.anlas ?? state.spentToday ?? 0).toLocaleString('en-US')} Anlas${today?.estimated ? '*' : ''}${today ? ` · ${today.images} 张` : ''}`;
  const pendTotal = pending.reduce((n, j) => n + j.count, 0);
  const pendCost = pending.reduce((n, j) => n + (j.estimate || 0), 0);
  const usage = state.subscription?.usage?.percent || 0;
  const doneText = (j: GenerationJob) =>
    j.state === 'skipped'
      ? `已跳过：完成 ${j.completed} / ${j.count} 张`
      : j.state === 'canceled'
        ? j.completed
          ? `已停止：完成 ${j.completed} 张`
          : '已取消'
        : `${j.completed} 张`;
  const clock = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const busy = !!running || line.length > 0;
  // 队列和待确认都空的时候，最近完成直接展开；有任务时折叠成一行
  const recentShown = recentOpen || (!busy && !pending.length);

  if (!state.settings.hasToken && !running) return null;
  return (
    <>
      {pills.map(({ leaving }) => (
        <button
          key="pill"
          className={`btn sm agent-pill ${leaving ? 'leaving' : ''}`}
          data-enter="fade"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="dot" />
          Agent 待确认 · {pending.length || ''}
        </button>
      ))}
      <span className="swap">
        {chips.map(({ key, leaving }) =>
          key === 'gen' || key === 'queue' ? (
            <button
              key={key}
              className={`field sm mono gen-chip ${key === 'queue' ? 'idle' : ''} ${open ? 'open' : ''} ${leaving ? 'leaving' : ''}`}
              data-enter="fade"
              data-trigger="queue"
              aria-expanded={open}
              data-tip="生成队列"
              style={
                {
                  '--p': running
                    ? `${Math.round((running.progress ?? (running.index - 1) / Math.max(1, running.count)) * 100)}%`
                    : '0%',
                } as React.CSSProperties
              }
              onClick={() => setOpen(!open)}
            >
              {running
                ? `${running.continuous ? `生成中 · 第 ${running.index} 张` : `${busyVerb(running.operation)} · ${stepOf(running)}`}${queued.length ? ` · 还有 ${queued.length} 个` : ''}`
                : state.paused
                  ? `队列已暂停 · ${queued.length} 个`
                  : queued.every((j) => j.deferred)
                    ? `已暂缓 · ${queued.length} 个`
                    : `排队中 · ${queued.length} 个`}
              {state.paused && running && ' · 将暂停'}
            </button>
          ) : (
            <button
              key={key}
              className={`field sm mono anlas-chip ${open ? 'open' : ''} ${leaving ? 'leaving' : ''}`}
              data-enter="fade"
              data-trigger={any ? 'queue' : undefined}
              data-tip={
                any
                  ? '生成队列'
                  : state.subscription?.active
                    ? 'Anlas 余额与 V5 免费用量'
                    : 'Anlas 余额'
              }
              onClick={() => any && setOpen(!open)}
            >
              {state.balance.toLocaleString('en-US')} Anlas
              {state.subscription?.active ? ` · 用量 ${usage}%` : ''}
            </button>
          ),
        )}
      </span>
      <Pop
        open={open && any}
        onClose={() => setOpen(false)}
        anchor={chipKey ? '[data-trigger="queue"]' : '.tb-end .agent-pill'}
        trigger=".tb-end .agent-pill, [data-trigger='queue']"
        place="below-right"
        className="popover queue"
        label="生成队列"
        deps={[line.length, pending.length, !!running, recentShown]}
      >
        <div className="q-top">
          <b>生成队列</b>
          <span className="q-today mono" data-tip={today?.estimated ? '带 * 的含估算' : undefined}>
            {todayText}
          </span>
        </div>
        {!busy && !pending.length && <div className="q-empty">没有在生成或排队的任务</div>}
        {state.paused && (running || queued.length > 0) && (
          <div className="q-paused">
            <Icon name="pause-circle-line" />
            {running
              ? '队列已暂停：正在生成的这张做完就停，后面的先不发'
              : `队列已暂停，${queued.length} 个任务在等，点“继续”接着生成`}
          </div>
        )}
        {(running || line.length > 0) && (
          <div className="q-sec">
            {running && runRow(running)}
            <div className="q-list" ref={list}>
              <FlipScope root={list}>{order.map(queueRow)}</FlipScope>
            </div>
          </div>
        )}
        {pending.length > 0 && (
          <div className="q-sec q-agent">
            <div className="q-h">
              Agent 添加了 {pending.length} 个生成任务，待确认
              <small>
                确认后排进队列，逐张发送。未确认的不会发送，{relay ? '也不计费' : '也不消耗 Anlas'}
                。
              </small>
            </div>
            {pending.map((job) => (
              <div className="q-item" key={job.id}>
                {thumb(job)}
                <div className="q-main">
                  {head(job)}
                  {job.summary && <small>{job.summary}</small>}
                  <small className="q-meta">
                    {job.count} 张 · {job.project.metadata.width} × {job.project.metadata.height} ·
                    Seed {job.fixedSeed ? '固定' : '随机'}
                    {anlas(job.estimate)}
                  </small>
                </div>
                <button
                  className="btn quiet sm icon"
                  aria-label="移除"
                  onClick={() => run(invokeUI('generate.cancel', { ids: [job.id] }))}
                >
                  <Icon name="close-line" />
                </button>
              </div>
            ))}
            <div className="q-agent-acts">
              <span className="sp" />
              <button
                className="btn quiet sm"
                onClick={() => run(invokeUI('generate.cancel', { ids: pending.map((j) => j.id) }))}
              >
                全部取消
              </button>
              <button
                className="btn seal sm"
                onClick={() => run(invokeUI('generate.confirm', { ids: pending.map((j) => j.id) }))}
              >
                生成 {pendTotal} 张{relay || !pendCost ? '' : ` · ${pendCost} Anlas`}
              </button>
            </div>
          </div>
        )}
        {busy && (
          <div className="q-foot">
            <span className="q-left">
              {endless
                ? '持续生成中'
                : leftImages
                  ? `剩余 ${leftImages} 张${relay ? '' : leftCost ? ` · 约 ${Math.round(leftCost)} Anlas` : ' · 免费'}`
                  : '没有要发的了'}
            </span>
            {(running || queued.length > 0) &&
              (state.paused ? (
                <button className="btn ink sm" onClick={() => run(invokeUI('generate.resume', {}))}>
                  <Icon name="play-line" />
                  继续
                </button>
              ) : (
                <button
                  className="btn sm"
                  data-tip="正在生成的这张做完就停，后面的先不发"
                  onClick={() => run(invokeUI('generate.pause', {}))}
                >
                  <Icon name="pause-line" />
                  暂停队列
                </button>
              ))}
          </div>
        )}
        {recent.length > 0 && (
          <div className={`q-recent ${recentShown ? 'open' : ''}`}>
            {busy || pending.length ? (
              <button className="q-recent-h" onClick={() => setRecentOpen(!recentOpen)}>
                <Icon name={recentOpen ? 'arrow-down-s-line' : 'arrow-right-s-line'} />
                最近完成 {recent.length} 个
              </button>
            ) : (
              <div className="q-recent-h label">最近完成</div>
            )}
            {recentShown &&
              recent.map((j) => (
                <div
                  key={j.id}
                  className="q-item q-done"
                  role="button"
                  tabIndex={0}
                  onClick={() => jump(j)}
                  onKeyDown={(e) => e.key === 'Enter' && jump(j)}
                >
                  {j.images.length ? <Thumb id={j.images.at(-1)!} tab={j.tabId} /> : thumb(j)}
                  <div className="q-main">
                    {head(j)}
                    <small className="q-meta">{doneText(j)}</small>
                  </div>
                  <span className="q-time mono">{clock(j.finishedAt)}</span>
                </div>
              ))}
          </div>
        )}
      </Pop>
      <ContextMenu at={menu?.at || null} onClose={() => setMenu(null)} items={menu?.items || []} />
    </>
  );
}
