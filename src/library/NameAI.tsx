import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Input, Banner, useNotifications } from '../ui';
import { invokeUI } from '../lib/commands';
import { mediaUrl } from '../lib/imageStage.js';
import type { LibraryGroup, LibraryProps } from './types';
import '../workbench/tidy.css';

export function NameAI({
  groups,
  p,
  compact = false,
  openRequest = 0,
}: {
  groups: LibraryGroup[];
  p: LibraryProps;
  compact?: boolean;
  openRequest?: number;
}) {
  const [target, setTarget] = useState('');
  const [phase, setPhase] = useState('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<
    { ids: string[]; name: string; original: string; thumbnail: string; done?: boolean }[]
  >([]);
  const request = useRef('');
  const notify = useNotifications();
  const handled = useRef(0);
  useEffect(() => {
    if (openRequest && openRequest !== handled.current && target) {
      handled.current = openRequest;
      if (localStorage.getItem(`nps.name-consent:${target}`)) void start();
      else setPhase('confirm');
    }
  }, [openRequest, target]);
  useEffect(() => {
    let active = true;
    void invokeUI('settings.ai.get', {}).then((s) => {
      if (active) setTarget(s.model ? s.baseUrl : '');
    });
    return () => {
      active = false;
      if (request.current) void invokeUI('ai.cancel', { requestId: request.current });
      request.current = '';
    };
  }, []);
  const close = () => {
    if (request.current) void invokeUI('ai.cancel', { requestId: request.current });
    request.current = '';
    setPhase('');
  };
  const start = async () => {
    localStorage.setItem(`nps.name-consent:${target}`, '1');
    const id = crypto.randomUUID();
    request.current = id;
    setPhase('running');
    setError('');
    const selected = groups.map((g) => g.members.map((m) => m.id));
    try {
      const result = await invokeUI('library.suggest-names', { requestId: id, groups: selected });
      if (request.current !== id) return;
      setRows(
        selected.map((ids) => {
          const first = result.changes.find((x) => x.id === ids[0])!;
          return {
            ids,
            name: ids.length > 1 ? first.name.replace(/-01$/, '') : first.name,
            original: first.original,
            thumbnail: first.thumbnail,
          };
        }),
      );
      setPhase('results');
    } catch (e) {
      if (request.current === id) {
        setError((e as Error).message);
        setPhase('failed');
      }
    } finally {
      if (request.current === id) request.current = '';
    }
  };
  const accept = async (indices: number[]) => {
    try {
      for (const index of indices) {
        if ((await p.onRenameMany(rows[index].ids, rows[index].name.trim())) === false) return;
      }
      setRows((current) =>
        current.map((row, i) => (indices.includes(i) ? { ...row, done: true } : row)),
      );
      if (rows.every((r, i) => r.done || indices.includes(i))) setPhase('');
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };
  return (
    <>
      <Button
        variant="quiet"
        size="small"
        aria-label="根据提示词起名"
        disabled={!target || !groups.length}
        disabledReason="根据提示词起名：请先在设置的“AI 服务”中完成配置"
        onClick={() =>
          localStorage.getItem(`nps.name-consent:${target}`) ? void start() : setPhase('confirm')
        }
      >
        <i className="ri-sparkling-2-line" />
        {!compact && '根据提示词起名'}
      </Button>
      <Dialog
        open={phase === 'confirm'}
        title="根据提示词起名？"
        cancelLabel="取消"
        confirmLabel="开始起名"
        onCancel={close}
        onConfirm={() => void start()}
      >
        <p>会把所选图片的提示词发给你在设置里配置的 AI 服务（{target}），不会发送图片本身。</p>
        <p>名称建议先列出来，由你逐个修改、接受或放弃，不会自动改名。</p>
      </Dialog>
      <Dialog
        open={!!phase && phase !== 'confirm'}
        title="根据提示词起名"
        footerLeading={
          phase === 'results' ? `还有 ${rows.filter((r) => !r.done).length} 项未处理` : undefined
        }
        cancelLabel={phase === 'running' ? '取消' : '放弃'}
        confirmLabel={phase === 'failed' ? '重试' : '全部接受'}
        confirmDisabled={
          phase === 'running' ||
          (phase === 'results' && !rows.some((r) => !r.done && r.name.trim()))
        }
        onCancel={close}
        onConfirm={() =>
          phase === 'failed'
            ? void start()
            : void accept(rows.flatMap((r, i) => (!r.done && r.name.trim() ? [i] : [])))
        }
      >
        {phase === 'running' ? (
          <>
            <p>正在根据提示词生成名称建议…</p>
            <div className="tidy-progress">
              <i />
            </div>
          </>
        ) : phase === 'failed' ? (
          <Banner tone="danger">{error}</Banner>
        ) : (
          <>
            <p>名称可以直接修改，接受后才会生效。</p>
            <div className="ai-name-list">
              {rows.map((row, i) => (
                <div className="ai-name-row" key={row.ids.join(',')}>
                  <span className="ai-name-pic">
                    <img src={mediaUrl(row.thumbnail)} alt="" />
                  </span>
                  <div className="ai-name-content">
                    {row.done ? (
                      <strong>✓ {row.name}</strong>
                    ) : (
                      <Input
                        aria-label={`建议名称 ${i + 1}`}
                        value={row.name}
                        onChange={(e) =>
                          setRows(
                            rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)),
                          )
                        }
                      />
                    )}
                    <span className="nps-help">
                      {row.ids.length > 1
                        ? `${row.ids.length} 张 · 将命名为 ${row.name}-01 至 -${String(row.ids.length).padStart(2, '0')}`
                        : '1 张'}
                    </span>
                  </div>
                  <div className="ai-name-original">
                    <span>原来</span>
                    <span>{row.original || '未起名'}</span>
                  </div>
                  <div className="ai-name-actions">
                    {row.done ? (
                      <span>已起名</span>
                    ) : (
                      <>
                        <Button
                          size="small"
                          aria-label="接受名称"
                          disabled={!row.name.trim()}
                          onClick={() => void accept([i])}
                        >
                          ✓
                        </Button>
                        <Button
                          size="small"
                          variant="quiet"
                          aria-label="去掉"
                          onClick={() => setRows(rows.filter((_, j) => j !== i))}
                        >
                          ✕
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
