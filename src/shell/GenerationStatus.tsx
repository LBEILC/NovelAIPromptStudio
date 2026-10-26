// 标题栏右边的生成状态（doc/design.md 2.9、2.23）：平时是余额（和 V5 免费用量）；生成时换成"生成中 · 2 / 3"加墨色进度，
// 点它回到那个标签页。Agent 排了生成时多一个"Agent 待确认 · N"，点开是待确认的浮层。没有配置账号时什么都没有。
import { useEffect, useRef, useState } from 'react';
import { Pop } from '../kit/layer';
import { Icon } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { useExitList, useSwap } from '../kit/motion';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';
import { BlurImg } from '../kit/blur';
import { openPick } from '../workbench/Pick';

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

/** 第几张；扩图按边分块时是第几块（"扩图中 1 / 2"） */
const stepOf = (job: { index: number; count: number; blockIndex?: number; blockCount?: number }) =>
  job.blockCount && job.blockCount > 1
    ? `${Math.max(1, job.blockIndex || 1)} / ${job.blockCount}`
    : `${job.index} / ${job.count}`;

export function GenerationStatus({ onOpen }: { onOpen: (tabId: string) => void }) {
  const state = useGeneration();
  const notify = useNotifications();
  const [open, setOpen] = useState(false);
  const seen = useRef(new Map<string, string>());
  const branchSeen = useRef(new Set<string>());
  // 打开软件之前就有的任务（上次留下的失败、待确认）只记下状态，不再通知（用户 10-21：每次重新打开都弹一遍）
  const opened = useRef(Date.now());
  useEffect(() => {
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
  const pills = useExitList(pending.length ? [pending.length] : [], () => 'pill');
  // 中转站模式查不到余额（doc/design.md 2.33），不生成时这里什么都不放
  const relay = state.settings.connection === 'relay';
  const chipKey = running ? 'gen' : relay ? '' : 'anlas';
  const chips = useSwap(chipKey, (k) => k).filter(({ key }) => key);
  if (!state.settings.hasToken && !running) return null;
  const total = pending.reduce((n, j) => n + j.count, 0);
  const cost = pending.reduce((n, j) => n + (j.estimate || 0), 0);
  const usage = state.subscription?.usage?.percent || 0;
  return (
    <>
      {pills.map(({ leaving }) => (
        <button
          key="pill"
          className={`btn sm agent-pill ${open ? 'on' : ''} ${leaving ? 'leaving' : ''}`}
          data-enter="fade"
          data-trigger="queue"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="dot" />
          Agent 待确认 · {pending.length || ''}
        </button>
      ))}
      <span className="swap">
        {chips.map(({ key, leaving }) =>
          key === 'gen' ? (
            <button
              key={key}
              className={`field sm mono gen-chip ${leaving ? 'leaving' : ''}`}
              data-enter="fade"
              style={
                {
                  '--p': `${Math.round((running?.progress ?? (running ? (running.index - 1) / Math.max(1, running.count) : 1)) * 100)}%`,
                } as React.CSSProperties
              }
              onClick={() => running && onOpen(running.tabId)}
            >
              {running
                ? running.continuous
                  ? `生成中 · 第 ${running.index} 张`
                  : `${busyVerb(running.operation)} · ${stepOf(running)}`
                : '生成中'}
            </button>
          ) : (
            <span
              key={key}
              className={`field sm mono ${leaving ? 'leaving' : ''}`}
              data-enter="fade"
              data-tip={state.subscription?.active ? 'Anlas 余额与 V5 免费用量' : 'Anlas 余额'}
            >
              {state.balance.toLocaleString('en-US')} Anlas
              {state.subscription?.active ? ` · 用量 ${usage}%` : ''}
            </span>
          ),
        )}
      </span>
      <Pop
        open={open && pending.length > 0}
        onClose={() => setOpen(false)}
        anchor='[data-trigger="queue"]'
        trigger='[data-trigger="queue"]'
        place="below-right"
        className="popover queue"
        label="Agent 待确认"
        deps={[pending.length]}
      >
        <div className="q-h">
          Agent 添加了 {pending.length} 个生成任务，待确认
          <small>
            确认后逐张发送。未确认的任务不会发送，{relay ? '也不计费' : '也不消耗 Anlas'}。
          </small>
        </div>
        {pending.map((job) => (
          <div className="q-item" key={job.id}>
            <BlurImg
              image={job.project}
              path={job.project.thumbnail_path || job.project.image_path}
              eye={false}
              alt=""
            />
            <div>
              <b>
                <span className="q-name" data-tip={job.name}>
                  {job.name}
                </span>
                <span> · {job.parentNumber === 1 ? '原图' : `基于第 ${job.parentNumber} 版`}</span>
              </b>
              {job.summary && <small>{job.summary}</small>}
              <small>
                {job.count} 张 · {job.project.metadata.width} × {job.project.metadata.height} · Seed{' '}
                {job.fixedSeed ? '固定' : '随机'}
              </small>
            </div>
            <button
              className="btn quiet sm icon"
              aria-label="移除"
              onClick={() => void invokeUI('generate.cancel', { ids: [job.id] })}
            >
              <Icon name="close-line" />
            </button>
          </div>
        ))}
        <div className="q-foot">
          <span className="cost">
            <b>
              共 {total} 张{relay ? '' : ` · ${cost} Anlas`}
            </b>
            <span>
              {relay
                ? '中转站按张计费'
                : cost
                  ? `余额 ${state.balance.toLocaleString('en-US')}`
                  : `用量 ${usage}%`}
            </span>
          </span>
          <button
            className="btn quiet sm"
            onClick={() => void invokeUI('generate.cancel', { ids: pending.map((j) => j.id) })}
          >
            全部取消
          </button>
          <button
            className="btn seal sm"
            onClick={() => {
              void invokeUI('generate.confirm', { ids: pending.map((j) => j.id) });
              setOpen(false);
            }}
          >
            生成 {total} 张
          </button>
        </div>
      </Pop>
    </>
  );
}
