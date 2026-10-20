import { useEffect, useRef, useState } from 'react';
import { Button, Popover, Progress, useNotifications } from '../ui';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';
import './generation.css';
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
          text: `生成失败：${job.error} · ${job.spentKnown ? (job.spent ? `本次已消耗 ${job.spent} Anlas` : '本次未消耗 Anlas') : '【文案待定：无法查询实际消耗】'}`,
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
  return (
    <div className="wb-generation-title">
      {!!pending.length && (
        <Button variant="quiet" ref={anchor} onClick={() => setOpen(!open)}>
          Agent 待确认 · {pending.length}
        </Button>
      )}
      <Button
        variant="quiet"
        onClick={() => {
          if (running) onOpen(running.tabId);
        }}
      >
        {running
          ? running.continuous
            ? `生成中 · 第 ${running.index} 张`
            : `生成中 · ${running.index} / ${running.count}`
          : `${state.balance.toLocaleString('en-US')} Anlas${state.subscription?.active ? ` · 用量 ${state.subscription.usage?.percent || 0}%` : ''}`}
      </Button>
      {running &&
        (running.progress == null ? (
          <span className="wb-title-progress" aria-label="生成中">
            <i />
          </span>
        ) : (
          <Progress label="生成进度" value={running.progress * 100} />
        ))}
      <Popover
        open={open && !!pending.length}
        anchor={anchor}
        label="Agent 待确认"
        onClose={() => setOpen(false)}
      >
        {pending.map((job) => (
          <div className="wb-pending-item" key={job.id}>
            <strong>
              {job.name} · 基于第 {job.parentNumber} 版
            </strong>
            <small>{job.summary || '没有改动'}</small>
            <small>
              {job.count} 张 · {job.project.metadata.width}×{job.project.metadata.height} · Seed{' '}
              {job.fixedSeed ? '固定' : '随机'}
            </small>
            <Button
              variant="quiet"
              onClick={() => void invokeUI('generate.cancel', { ids: [job.id] })}
            >
              移除
            </Button>
          </div>
        ))}
        <p>合计 {pending.reduce((n, j) => n + (j.estimate || 0), 0)} Anlas</p>
        <div className="settings-actions">
          <Button
            onClick={() => void invokeUI('generate.cancel', { ids: pending.map((j) => j.id) })}
          >
            全部取消
          </Button>
          <Button
            variant="cinnabar"
            onClick={() => {
              void invokeUI('generate.confirm', { ids: pending.map((j) => j.id) });
              setOpen(false);
            }}
          >
            生成 {pending.reduce((n, j) => n + j.count, 0)} 张
          </Button>
        </div>
      </Popover>
    </div>
  );
}
