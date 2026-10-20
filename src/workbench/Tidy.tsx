import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Tag, useNotifications } from '../ui';
import { parsePrompt } from '../lib/prompt.js';
import { categoryColors, categoryLabel } from './model';
import { invokeUI } from '../lib/commands';
import {
  createPromptDocument,
  editPromptBlockText,
  promptDocumentProject,
  setPromptBlockType,
} from '../lib/promptDocument';
import type { ImageProject } from '../shared/types';
import type { TidyChange } from '../shared/materials';
import './tidy.css';

const signature = (project: ImageProject) =>
  JSON.stringify(
    createPromptDocument(project).scopes.map((s) => [
      s.scope.key,
      s.blocks.map((b) => [b.raw, b.type, b.userType]),
    ]),
  );
export function useTidy(p: {
  tabId?: string;
  project: ImageProject;
  before?: () => Promise<void>;
  onUpdateProject: (p: ImageProject) => void;
  onProposalChange?: (value: boolean) => void;
}) {
  const notify = useNotifications();
  const [target, setTarget] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<(TidyChange & { decision?: boolean })[]>([]);
  const [current, setCurrent] = useState(0);
  const request = useRef('');
  const original = useRef(p.project);
  const latest = useRef(p.project);
  latest.current = p.project;
  useEffect(() => {
    if (items[current])
      document
        .querySelector(`[data-proposal="${items[current].id}"]`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [current, items.length]);
  useEffect(() => {
    let active = true;
    void invokeUI('settings.ai.get', {}).then((s) => {
      if (active) setTarget(s.model ? s.baseUrl : '');
    });
    return () => {
      active = false;
      if (request.current) void invokeUI('ai.cancel', { requestId: request.current });
      request.current = '';
      p.onProposalChange?.(false);
    };
  }, []);
  const cancel = () => {
    if (request.current) void invokeUI('ai.cancel', { requestId: request.current });
    request.current = '';
    setRunning(false);
    setItems([]);
    p.onProposalChange?.(false);
  };
  const start = async () => {
    setConfirm(false);
    localStorage.setItem(`nps.tidy-consent:${target}`, '1');
    const id = crypto.randomUUID();
    request.current = id;
    setRunning(true);
    p.onProposalChange?.(true);
    original.current = latest.current;
    try {
      await p.before?.();
      const result = await invokeUI('prompt.tidy', { tabId: p.tabId!, requestId: id });
      if (request.current !== id) return;
      if (signature(latest.current) !== signature(original.current))
        throw new Error('提示词已改变，请重新整理');
      setItems(result.changes);
      setCurrent(0);
      if (!result.changes.length) {
        notify({ text: '没有需要整理的地方' });
        p.onProposalChange?.(false);
      }
    } catch (error) {
      if (request.current === id) {
        notify({
          text: `整理失败：${error instanceof Error ? error.message : String(error)}`,
          action: { label: '重试', onClick: () => void start() },
        });
        p.onProposalChange?.(false);
      }
    } finally {
      if (request.current === id) {
        request.current = '';
        setRunning(false);
      }
    }
  };
  const decide = (next: typeof items) => {
    setItems(next);
    if (next.some((x) => x.decision === undefined)) {
      const after = next.findIndex((x, i) => i > current && x.decision === undefined);
      setCurrent(after >= 0 ? after : next.findIndex((x) => x.decision === undefined));
      return;
    }
    const accepted = next.filter((x) => x.decision);
    if (accepted.length) {
      if (signature(latest.current) !== signature(original.current)) {
        notify({ text: '整理失败：提示词已改变，请重新整理' });
        cancel();
        return;
      }
      const doc = createPromptDocument(original.current);
      for (const x of [...accepted].sort((a, b) => b.block - a.block)) {
        const si = doc.scopes.findIndex((s) => s.scope.key === x.scope),
          section = doc.scopes[si];
        const edited = editPromptBlockText(section, x.block, x.after);
        const typed = setPromptBlockType(edited, x.block, x.type);
        doc.scopes[si] = { ...section, ...typed };
      }
      const changed = { ...original.current, ...promptDocumentProject(doc) } as ImageProject;
      p.onUpdateProject(changed);
      const before = original.current;
      notify({
        text: `已接受 ${accepted.length} 处修改，放弃 ${next.length - accepted.length} 处`,
        action: {
          label: '撤销',
          onClick: () => {
            if (signature(latest.current) === signature(changed)) p.onUpdateProject(before);
          },
        },
      });
    } else notify({ text: '已放弃 AI 提案' });
    setItems([]);
    p.onProposalChange?.(false);
  };
  const navigate = (index: number) => {
    const at = (index + items.length) % items.length;
    setCurrent(at);
    document
      .querySelector(`[data-proposal="${items[at].id}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };
  const button = (
    <Button
      variant="quiet"
      size="small"
      aria-label="整理"
      disabled={!target || running || !!items.length || !p.tabId}
      disabledReason={!target ? '请先在设置里配置 AI 服务' : '先处理 AI 提案'}
      data-tip="整理（AI）：重新分块、改判块的类型、修正明显的错误"
      onClick={() =>
        localStorage.getItem(`nps.tidy-consent:${target}`) ? void start() : setConfirm(true)
      }
    >
      <i className="ri-sparkling-2-line" />
    </Button>
  );
  const left = items.filter((x) => x.decision === undefined).length;
  const bar = (
    <>
      <Dialog
        open={confirm}
        title="用 AI 整理提示词？"
        cancelLabel="取消"
        confirmLabel="开始整理"
        onCancel={() => setConfirm(false)}
        onConfirm={() => void start()}
      >
        <p>会把这张图的提示词发给你在设置里配置的 AI 服务（{target}）。</p>
        <p>
          只调整分块、块的类型和明显的错误（拼写、没配对的括号和 ::、混进 Tag 里的句子），不增删
          Tag，不改权重。结果先列出来，由你逐处决定是否接受。
        </p>
      </Dialog>
      {(running || !!items.length) && (
        <div className="tidy-bar">
          <div className="tidy-row">
            <i className="ri-sparkling-2-line" />
            <b>{running ? '正在整理提示词' : 'AI 提案'}</b>
            <span className="nps-help">
              {running
                ? `发给 ${target}`
                : `整理 · ${items.length} 处${left < items.length ? ` · 还剩 ${left}` : ''}`}
            </span>
            <span className="tidy-space" />
            {running ? (
              <Button size="small" variant="quiet" onClick={cancel}>
                取消
              </Button>
            ) : (
              <>
                <Button
                  size="small"
                  variant="quiet"
                  aria-label="上一处"
                  onClick={() => navigate(current - 1)}
                >
                  <i className="ri-arrow-up-s-line" />
                </Button>
                <span>
                  {current + 1} / {items.length}
                </span>
                <Button
                  size="small"
                  variant="quiet"
                  aria-label="下一处"
                  onClick={() => navigate(current + 1)}
                >
                  <i className="ri-arrow-down-s-line" />
                </Button>
                <Button
                  size="small"
                  onClick={() =>
                    decide(items.map((x) => ({ ...x, decision: x.decision ?? false })))
                  }
                >
                  {left < items.length ? '放弃其余' : '放弃'}
                </Button>
                <Button
                  size="small"
                  variant="ink"
                  onClick={() => decide(items.map((x) => ({ ...x, decision: x.decision ?? true })))}
                >
                  {left < items.length ? '接受其余' : '接受'}
                </Button>
              </>
            )}
          </div>
          {running && (
            <div className="tidy-progress">
              <i />
            </div>
          )}
        </div>
      )}
    </>
  );
  const render = (scope: string, block: number) => {
    const x = items.find((x) => x.scope === scope && x.block === block);
    if (!x) return null;
    const i = items.indexOf(x);
    const tags = (text: string, state: 'default' | 'added' | 'removed') =>
      parsePrompt(text).map((t, index) => (
        <Tag
          key={`${state}-${index}`}
          text={t.tag}
          category={categoryColors[t.category]}
          categoryLabel={categoryLabel(t.category)}
          weight={t.weight === 1 ? undefined : String(t.weight)}
          state={state}
          interactive={false}
        />
      ));
    return (
      <div data-proposal={x.id}>
        <div className="wb-tags">
          {x.before === x.after ? (
            <>
              <span className="nps-help">原来是{x.type === 'tags' ? '段落' : 'Tag 块'}</span>
              {x.type === 'tags' ? (
                tags(x.after, x.decision === undefined ? 'added' : 'default')
              ) : (
                <span className="tidy-new">{x.after}</span>
              )}
            </>
          ) : x.decision === false ? (
            <>{tags(x.before, 'default')}</>
          ) : (
            <>
              {x.decision === undefined && tags(x.before, 'removed')}
              {tags(x.after, x.decision === undefined ? 'added' : 'default')}
            </>
          )}
        </div>
        <div className={`tidy-why ${i === current ? 'current' : ''}`} onClick={() => setCurrent(i)}>
          <span>{i + 1}</span>
          <span className="tidy-reason">
            <b>{x.title}</b>
            <span>{x.reason}</span>
          </span>
          {x.decision !== undefined ? (
            <span className="tidy-decision">
              <span>{x.decision ? '✓ 已接受' : '已放弃'}</span>
              <Button
                size="small"
                variant="quiet"
                onClick={() =>
                  setItems(items.map((y) => (y === x ? { ...y, decision: undefined } : y)))
                }
              >
                撤回
              </Button>
            </span>
          ) : (
            <>
              <Button
                size="small"
                variant="quiet"
                aria-label="放弃这一处"
                onClick={() => decide(items.map((y) => (y === x ? { ...y, decision: false } : y)))}
              >
                ✕
              </Button>
              <Button
                size="small"
                aria-label="接受这一处"
                onClick={() => decide(items.map((y) => (y === x ? { ...y, decision: true } : y)))}
              >
                ✓
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };
  return { button, bar, render, active: running || !!items.length };
}
