import { useEffect, useRef, useState } from 'react';
import { Button, Popover, Progress, useNotifications } from '../ui';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';
import './generation.css';
import { mediaUrl } from '../lib/imageStage.js';
export function GenerationTitle({ onOpen }: { onOpen: (tabId: string) => void }) {
  const state = useGeneration(),
    [open, setOpen] = useState(false),
    anchor = useRef<HTMLButtonElement>(null),
    notify = useNotifications();
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
  const pending = state.jobs.filter((j) => j.state === 'pending'),
    running = state.jobs.find((j) => j.state === 'generating');
  if (!state.settings.hasToken) return null;
  const total = pending.reduce((n, job) => n + job.count, 0);
  const cost = pending.reduce((n, job) => n + (job.estimate || 0), 0);
  return (
    <div className="wb-generation-title">
      {!!pending.length && (
        <Button
          size="small"
          ref={anchor}
          className="wb-agent-pill"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="wb-agent-dot" />
          Agent 待确认 · {pending.length}
        </Button>
      )}
      <button
        className="nps-field nps-small wb-balance-chip"
        onClick={() => {
          if (running) onOpen(running.tabId);
        }}
        data-tip="Anlas 余额与 V5 免费用量"
      >
        {running
          ? running.continuous
            ? `生成中 · 第 ${running.index} 张`
            : `生成中 · ${running.index} / ${running.count}`
          : `${state.balance.toLocaleString('en-US')} Anlas${state.subscription?.active ? ` · 用量 ${state.subscription.usage?.percent || 0}%` : ''}`}
        {running &&
          (running.progress == null ? (
            <span className="wb-title-progress" aria-label="生成中">
              <i />
            </span>
          ) : (
            <Progress label="生成进度" value={running.progress * 100} />
          ))}
      </button>
      <Popover
        open={open && !!pending.length}
        anchor={anchor}
        label="Agent 待确认"
        className="wb-agent-queue"
        align="end"
        onClose={() => setOpen(false)}
      >
        <header className="wb-queue-head">
          Agent 添加了 {pending.length} 个生成任务，待确认
          <small>确认后逐张发送。未确认的任务不会发送，也不消耗 Anlas。</small>
        </header>
        {pending.map((job) => (
          <div className="wb-pending-item" key={job.id}>
            <img src={mediaUrl(job.project.thumbnail_path || job.project.image_path)} alt="" />
            <div>
              <b>
                {job.name} · {job.parentNumber === 1 ? '原图' : `基于第 ${job.parentNumber} 版`}
              </b>
              {job.summary && <small>{job.summary}</small>}
              <small>
                {job.count} 张 · {job.project.metadata.width} × {job.project.metadata.height} · Seed{' '}
                {job.fixedSeed ? '固定' : '随机'}
              </small>
            </div>
            <Button
              variant="quiet"
              size="small"
              aria-label="移除"
              onClick={() => void invokeUI('generate.cancel', { ids: [job.id] })}
            >
              <i className="ri-close-line" />
            </Button>
          </div>
        ))}
        <footer className="wb-queue-foot">
          <span className="wb-generation-cost">
            <strong>
              共 {total} 张 · {cost} Anlas
            </strong>
            <small>
              {cost
                ? `余额 ${state.balance.toLocaleString('en-US')}`
                : `用量 ${state.subscription?.usage?.percent || 0}%`}
            </small>
          </span>
          <Button
            variant="quiet"
            size="small"
            onClick={() => void invokeUI('generate.cancel', { ids: pending.map((job) => job.id) })}
          >
            全部取消
          </Button>
          <Button
            variant="cinnabar"
            size="small"
            onClick={() => {
              void invokeUI('generate.confirm', { ids: pending.map((job) => job.id) });
              setOpen(false);
            }}
          >
            生成 {total} 张
          </Button>
        </footer>
      </Popover>
    </div>
  );
}
