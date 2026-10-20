// 整理提示词（doc/design.md 2.25）：AI 给出修改提案，在提示词里原位显示（去掉的红底加删除线，新加的绿底），
// 每一处下面一行写编号、类别和理由，可以逐处接受或放弃；每一处都定了，提案收起，接受的写进草稿。
// 第一次用先说明会把提示词发给谁，确认后才发。
import { useEffect, useRef, useState } from 'react';
import { parsePrompt } from '../lib/prompt.js';
import { invokeUI } from '../lib/commands';
import {
  createPromptDocument,
  editPromptBlockText,
  promptDocumentProject,
  setPromptBlockType,
} from '../lib/promptDocument';
import { CAT_VAR } from '../kit/categories';
import { Icon } from '../kit/controls';
import { Confirm } from '../kit/dialog';
import { useNotifications } from '../kit/toast';
import { useSwap } from '../kit/motion';
import type { ImageProject, TagCategory } from '../shared/types';
import type { TidyChange } from '../shared/materials';

const signature = (project: ImageProject) =>
  JSON.stringify(
    createPromptDocument(project).scopes.map((s) => [
      s.scope.key,
      s.blocks.map((b) => [b.raw, b.type, b.userType]),
    ]),
  );
const consentKey = (target: string) => `nps.tidy-consent:${target}`;

export function useTidy(p: {
  tabId?: string;
  project: ImageProject;
  before?: () => Promise<void>;
  onUpdateProject: (p: ImageProject) => void;
  onProposalChange?: (value: boolean) => void;
}) {
  const notify = useNotifications();
  const [target, setTarget] = useState('');
  const [ask, setAsk] = useState(false);
  const [running, setRunning] = useState(false);
  const [items, setItems] = useState<(TidyChange & { decision?: boolean })[]>([]);
  const [current, setCurrent] = useState(0);
  const request = useRef('');
  const original = useRef(p.project);
  const latest = useRef(p.project);
  latest.current = p.project;
  const scrollTo = (i: number) =>
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-proposal="${items[i]?.id}"]`)
        ?.scrollIntoView({ block: 'nearest' }),
    );
  useEffect(() => {
    let live = true;
    void invokeUI('settings.ai.get', {}).then((s) => live && setTarget(s.model ? s.baseUrl : ''));
    return () => {
      live = false;
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
    try {
      localStorage.setItem(consentKey(target), '1');
    } catch {
      /* 记不住就下次再问 */
    }
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
          tone: 'error',
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
      const at = after >= 0 ? after : next.findIndex((x) => x.decision === undefined);
      setCurrent(at);
      scrollTo(at);
      return;
    }
    const accepted = next.filter((x) => x.decision);
    if (accepted.length) {
      if (signature(latest.current) !== signature(original.current)) {
        notify({ text: '整理失败：提示词已改变，请重新整理', tone: 'error' });
        cancel();
        return;
      }
      const doc = createPromptDocument(original.current);
      for (const x of [...accepted].sort((a, b) => b.block - a.block)) {
        const si = doc.scopes.findIndex((s) => s.scope.key === x.scope),
          section = doc.scopes[si];
        const typed = setPromptBlockType(
          editPromptBlockText(section, x.block, x.after),
          x.block,
          x.type,
        );
        doc.scopes[si] = { ...section, ...typed };
      }
      const changed = { ...original.current, ...promptDocumentProject(doc) } as ImageProject;
      p.onUpdateProject(changed);
      const before = original.current,
        no = next.length - accepted.length;
      notify({
        text: no
          ? `已接受 ${accepted.length} 处修改，放弃 ${no} 处`
          : `已接受 ${accepted.length} 处修改`,
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
  const go = (i: number) => {
    const at = (i + items.length) % items.length;
    setCurrent(at);
    scrollTo(at);
  };
  const open = !!items.length;
  const button = (
    <button
      className={`btn quiet sm icon ${running ? 'loading' : ''} ${open ? 'on' : ''} ${!target ? 'is-off' : ''}`}
      aria-label="整理"
      aria-disabled={!target || running || open || !p.tabId || undefined}
      data-tip={
        !target
          ? '整理（AI）：请先在设置的"AI 服务"中完成配置'
          : running
            ? '正在整理'
            : open
              ? '先处理 AI 提案'
              : '整理（AI）：重新分块、改判块的类型、修正明显的错误'
      }
      onClick={() => {
        if (!target || running || open || !p.tabId) return;
        let ok = false;
        try {
          ok = !!localStorage.getItem(consentKey(target));
        } catch {
          /* 读不到就问一次 */
        }
        if (ok) void start();
        else setAsk(true);
      }}
    >
      <Icon name={running ? 'loader-4-line' : 'sparkling-2-line'} />
    </button>
  );
  const left = items.filter((x) => x.decision === undefined).length;
  const phase = running ? 'run' : open ? 'ready' : '';
  const bars = useSwap(phase, (k) => k);
  const bar = (
    <>
      <Confirm
        options={
          ask
            ? {
                title: '用 AI 整理提示词？',
                body: `会把这张图的提示词发给你在设置里配置的 AI 服务（${target}）。`,
                tail: '只调整分块、块的类型和明显的错误（拼写、没配对的括号和 ::、混进 Tag 里的句子），不增删 Tag，不改权重。结果先列出来，由你逐处决定是否接受。',
                ok: '开始整理',
              }
            : null
        }
        onAnswer={(ok) => {
          setAsk(false);
          if (ok) void start();
        }}
      />
      {bars.map(({ key, leaving }) =>
        key === 'run' ? (
          <div key={key} className={`prop-bar ${leaving ? 'leaving' : ''}`} data-enter="down">
            <div className="pb-row">
              <span className="spin" />
              <b>正在整理提示词</b>
              <span className="muted">发给 {target}</span>
              <span className="sp" />
              <button className="btn quiet sm" onClick={cancel}>
                取消
              </button>
            </div>
            <div className="progress ink indet">
              <i />
            </div>
          </div>
        ) : key === 'ready' ? (
          <div key={key} className={`prop-bar ${leaving ? 'leaving' : ''}`} data-enter="down">
            <div className="pb-row">
              <Icon name="sparkling-2-line" />
              <b>AI 提案</b>
              <span className="muted">
                整理 · {items.length} 处{left < items.length ? ` · 还剩 ${left}` : ''}
              </span>
              <span className="sp" />
              <button
                className="btn quiet sm icon"
                aria-label="上一处"
                onClick={() => go(current - 1)}
              >
                <Icon name="arrow-up-s-line" />
              </button>
              <span className="mono pb-n">
                {current + 1} / {items.length}
              </span>
              <button
                className="btn quiet sm icon"
                aria-label="下一处"
                onClick={() => go(current + 1)}
              >
                <Icon name="arrow-down-s-line" />
              </button>
              <button
                className="btn sm"
                onClick={() => decide(items.map((x) => ({ ...x, decision: x.decision ?? false })))}
              >
                {left < items.length ? '放弃其余' : '放弃'}
              </button>
              <button
                className="btn ink sm"
                onClick={() => decide(items.map((x) => ({ ...x, decision: x.decision ?? true })))}
              >
                {left < items.length ? '接受其余' : '接受'}
              </button>
            </div>
          </div>
        ) : null,
      )}
    </>
  );
  const tags = (text: string, cls: '' | 'new' | 'gone') =>
    parsePrompt(text).map((t, i) => (
      <span key={`${cls}-${i}`} className={`tag ro ${cls}`}>
        <span
          className="dot"
          style={{
            background: `var(--cat-${CAT_VAR[(t.category as TagCategory) || 'Unsorted'] || 'unsorted'})`,
          }}
        />
        <span className="t">
          <span className="en">{t.tag}</span>
          {t.translation && <span className="zh">{t.translation}</span>}
        </span>
        {t.weight !== 1 && <span className="w">{t.weight}</span>}
      </span>
    ));
  /** 一块的提案：原位显示改动，下面一行写理由；没有提案的块返回 null */
  const render = (scope: string, block: number) => {
    const x = items.find((y) => y.scope === scope && y.block === block);
    if (!x) return null;
    const i = items.indexOf(x);
    const pending = x.decision === undefined;
    const retype = x.before === x.after;
    return (
      <div data-proposal={x.id}>
        {retype ? (
          x.type === 'tags' ? (
            <div className={`tags ${pending ? 'prop-new' : ''}`}>
              {tags(x.after, pending ? 'new' : '')}
            </div>
          ) : (
            <div className="para-view ro">
              <p className="prose">{x.after}</p>
            </div>
          )
        ) : (
          <div className="tags">
            {x.decision === false ? (
              tags(x.before, '')
            ) : (
              <>
                {pending && tags(x.before, 'gone')}
                {tags(x.after, pending ? 'new' : '')}
              </>
            )}
          </div>
        )}
        <div
          className={`prop-why ${i === current ? 'pw-on' : ''} ${pending ? '' : 'done'}`}
          onClick={() => setCurrent(i)}
        >
          <span className="pn mono">{i + 1}</span>
          <span className="pw-t">
            <b>
              {x.title}
              {retype && pending ? ` · 原来是${x.type === 'tags' ? '段落' : 'Tag 块'}` : ''}
            </b>
            <span>{x.reason}</span>
          </span>
          <span className="swap pw-acts">
            {pending ? (
              <span className="row" key="todo" data-enter="fade">
                <button
                  className="btn quiet sm icon"
                  aria-label="放弃这一处"
                  onClick={(e) => (
                    e.stopPropagation(),
                    decide(items.map((y) => (y === x ? { ...y, decision: false } : y)))
                  )}
                >
                  <Icon name="close-line" />
                </button>
                <button
                  className="btn sm icon"
                  aria-label="接受这一处"
                  onClick={(e) => (
                    e.stopPropagation(),
                    decide(items.map((y) => (y === x ? { ...y, decision: true } : y)))
                  )}
                >
                  <Icon name="check-line" />
                </button>
              </span>
            ) : (
              <span className="pw-st" key="done" data-enter="fade">
                {x.decision ? (
                  <>
                    <Icon name="check-line" />
                    已接受
                  </>
                ) : (
                  '已放弃'
                )}
                <button
                  className="btn quiet sm"
                  data-tip="改回待定"
                  onClick={(e) => (
                    e.stopPropagation(),
                    setItems(items.map((y) => (y === x ? { ...y, decision: undefined } : y)))
                  )}
                >
                  撤回
                </button>
              </span>
            )}
          </span>
        </div>
      </div>
    );
  };
  return { button, bar, render, active: running || open };
}
