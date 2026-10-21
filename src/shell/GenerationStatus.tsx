// 标题栏右边的生成状态（doc/design.md 2.9、2.23）：平时是余额（和 V5 免费用量）；生成时换成"生成中 · 2 / 3"加墨色进度，
// 点它回到那个标签页。Agent 排了生成时多一个"Agent 待确认 · N"，点开是待确认的浮层。没有配置账号时什么都没有。
import { useEffect, useRef, useState } from 'react';
import { Pop } from '../kit/layer';
import { Icon } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { useExitList, useSwap } from '../kit/motion';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';
import { mediaUrl } from '../lib/imageStage.js';

export function GenerationStatus({ onOpen }: { onOpen: (tabId: string) => void }) {
  const state = useGeneration();
  const notify = useNotifications();
  const [open, setOpen] = useState(false);
  const seen = useRef(new Map<string, string>());
  const branchSeen = useRef(new Set<string>());
  useEffect(() => {
    for (const job of state.jobs) {
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
          text: `生成失败：${job.error} · ${job.spentKnown ? (job.spent ? `本次已消耗 ${job.spent} Anlas` : '本次未消耗 Anlas') : '无法确认是否消耗了 Anlas'}`,
          tone: 'error',
          action: { label: '重试', onClick: () => void invokeUI('generate.retry', { id: job.id }) },
        });
      if (job.state === 'canceled' && previous === 'generating')
        notify({
          text: job.continuous
            ? `已停止：共完成 ${job.completed} 张`
            : `已停止：完成 ${job.completed} 张，其余已取消`,
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
  const chipKey = running ? 'gen' : 'anlas';
  const chips = useSwap(chipKey, (k) => k);
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
                  : `生成中 · ${running.index} / ${running.count}`
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
          <small>确认后逐张发送。未确认的任务不会发送，也不消耗 Anlas。</small>
        </div>
        {pending.map((job) => (
          <div className="q-item" key={job.id}>
            <img src={mediaUrl(job.project.thumbnail_path || job.project.image_path)} alt="" />
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
              共 {total} 张 · {cost} Anlas
            </b>
            <span>{cost ? `余额 ${state.balance.toLocaleString('en-US')}` : `用量 ${usage}%`}</span>
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
