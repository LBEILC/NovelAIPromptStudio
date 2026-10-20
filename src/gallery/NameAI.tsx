// 根据提示词起名（doc/design.md 2.15、2.25）：对选中的图片或一组图片，按提示词的内容各起一个简短的中文名，
// 同一组用同一个名字加编号。结果先列出来，可以逐个改、接受或去掉，"全部接受""放弃"；不自动改名。
// 第一次用先说明会把提示词发给谁，确认后才发。
import { useEffect, useRef, useState } from 'react';
import { Dialog, Confirm } from '../kit/dialog';
import { Icon } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { FlipScope, useExitList } from '../kit/motion';
import { invokeUI } from '../lib/commands';
import { mediaUrl } from '../lib/imageStage.js';
import type { LibraryGroup, LibraryProps } from '../library/types';

type Row = {
  key: string;
  ids: string[];
  imgs: string[];
  name: string;
  original: string;
  state: 'open' | 'done' | 'gone';
};
const consentKey = (target: string) => `nps.name-consent:${target}`;
const consented = (target: string) => {
  try {
    return !!localStorage.getItem(consentKey(target));
  } catch {
    return false;
  }
};

export function NameAI({
  p,
  request,
  onDone,
}: {
  p: LibraryProps;
  request: { groups: LibraryGroup[]; seq: number } | null;
  onDone: () => void;
}) {
  const notify = useNotifications();
  const [target, setTarget] = useState('');
  const [ask, setAsk] = useState(false);
  const [phase, setPhase] = useState<'' | 'run' | 'fail' | 'list'>('');
  const [error, setError] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const job = useRef('');
  const groups = useRef<LibraryGroup[]>([]);
  useEffect(() => {
    let live = true;
    void invokeUI('settings.ai.get', {}).then((s) => live && setTarget(s.model ? s.baseUrl : ''));
    return () => {
      live = false;
      if (job.current) void invokeUI('ai.cancel', { requestId: job.current });
    };
  }, []);
  useEffect(() => {
    if (!request?.groups.length) return;
    groups.current = request.groups;
    if (consented(target)) void start();
    else setAsk(true);
  }, [request?.seq]);
  const start = async () => {
    try {
      localStorage.setItem(consentKey(target), '1');
    } catch {
      /* 记不住就下次再问 */
    }
    const id = crypto.randomUUID();
    job.current = id;
    setPhase('run');
    setError('');
    const selected = groups.current.map((g) => g.members.map((m) => m.id));
    try {
      const result = await invokeUI('library.suggest-names', { requestId: id, groups: selected });
      if (job.current !== id) return;
      setRows(
        selected.map((ids, i) => {
          const first = result.changes.find((x) => x.id === ids[0])!;
          const g = groups.current[i];
          return {
            key: `${id}-${i}`,
            ids,
            imgs: g.members.slice(0, 3).map((m) => m.thumbnail_path || m.image_path),
            name: ids.length > 1 ? first.name.replace(/-01$/, '') : first.name,
            original: first.original,
            state: 'open',
          };
        }),
      );
      setPhase('list');
    } catch (e) {
      if (job.current === id) {
        setError((e as Error).message);
        setPhase('fail');
      }
    } finally {
      if (job.current === id) job.current = '';
    }
  };
  const close = (named = 0) => {
    if (job.current) void invokeUI('ai.cancel', { requestId: job.current });
    job.current = '';
    setPhase('');
    onDone();
    if (named) notify({ text: `已为 ${named} 张图片起名` });
  };
  const doneCount = (list: Row[]) =>
    list.filter((r) => r.state === 'done').reduce((k, r) => k + r.ids.length, 0);
  const finishIfDone = (list: Row[]) => {
    if (!list.some((r) => r.state === 'open')) setTimeout(() => close(doneCount(list)), 180);
  };
  const accept = async (keys: string[]) => {
    const next = rows.map((r) => ({ ...r }));
    for (const r of next)
      if (keys.includes(r.key) && r.state === 'open' && r.name.trim()) {
        if ((await p.onRenameMany(r.ids, r.name.trim())) === false) return next;
        r.state = 'done';
      }
    setRows(next);
    return next;
  };
  const open = rows.filter((r) => r.state === 'open');
  const focusRow = (key?: string) =>
    setTimeout(() => {
      const el = key && document.getElementById(`lnm-${key}`);
      if (el instanceof HTMLInputElement) {
        el.focus();
        el.select();
      }
    }, 0);
  useEffect(() => {
    if (phase === 'list') focusRow(rows[0]?.key);
  }, [phase]);
  const list = useExitList(
    rows.filter((r) => r.state !== 'gone'),
    (r) => r.key,
  );
  const box = useRef<HTMLDivElement>(null);
  return (
    <>
      <Confirm
        options={
          ask
            ? {
                title: '根据提示词起名？',
                body: `会把所选图片的提示词发给你在设置里配置的 AI 服务（${target}），不会发送图片本身。`,
                tail: '名称建议先列出来，由你逐个修改、接受或放弃，不会自动改名。',
                ok: '开始起名',
              }
            : null
        }
        onAnswer={(ok) => {
          setAsk(false);
          if (ok) void start();
          else onDone();
        }}
      />
      <Dialog
        open={!!phase}
        onClose={() => close(doneCount(rows))}
        label="根据提示词起名"
        className="lnm"
        backdropClass="lnm-back"
        initialFocus={phase === 'run' ? '.acts button' : undefined}
      >
        <h3>根据提示词起名</h3>
        {phase === 'run' && (
          <>
            <p>正在根据提示词生成名称建议…</p>
            <div className="lnm-run">
              <div className="progress ink indet">
                <i />
              </div>
            </div>
            <div className="acts">
              <button className="btn quiet" onClick={() => close()}>
                取消
              </button>
            </div>
          </>
        )}
        {phase === 'fail' && (
          <>
            <div className="banner warn lnm-err" data-enter="fade">
              <Icon name="error-warning-line" />
              <span className="selectable">起名失败：{error}</span>
            </div>
            <div className="acts">
              <button className="btn quiet" onClick={() => close()}>
                关闭
              </button>
              <button className="btn ink" onClick={() => void start()}>
                重试
              </button>
            </div>
          </>
        )}
        {phase === 'list' && (
          <>
            <p>名称可以直接修改，接受后才会生效。</p>
            <FlipScope root={box}>
              <div className="lnm-list" ref={box}>
                {list.map(({ item: r, leaving }) => (
                  <div
                    key={r.key}
                    data-key={`lnm-${r.key}`}
                    data-flip=""
                    data-exit="lift"
                    className={`lnm-row ${r.state} ${leaving ? 'leaving' : ''}`}
                  >
                    <span className="lnm-pic">
                      {r.imgs.map((src) => (
                        <img key={src} src={mediaUrl(src)} alt="" />
                      ))}
                    </span>
                    <div className="lnm-main">
                      {r.state === 'done' ? (
                        <span className="lnm-done">
                          <Icon name="check-line" />
                          <b>{r.name}</b>
                        </span>
                      ) : (
                        <label className="field sm lnm-in">
                          <input
                            id={`lnm-${r.key}`}
                            value={r.name}
                            aria-label="建议的名称"
                            autoComplete="off"
                            spellCheck={false}
                            onChange={(e) =>
                              setRows(
                                rows.map((x) =>
                                  x.key === r.key ? { ...x, name: e.target.value } : x,
                                ),
                              )
                            }
                            onKeyDown={(e) => {
                              if (e.nativeEvent.isComposing || e.key !== 'Enter') return;
                              e.preventDefault();
                              void accept([r.key]).then((next) => {
                                const i = next.findIndex((x) => x.key === r.key);
                                const after =
                                  next.slice(i + 1).find((x) => x.state === 'open') ||
                                  next.find((x) => x.state === 'open');
                                if (after) focusRow(after.key);
                                finishIfDone(next);
                              });
                            }}
                          />
                        </label>
                      )}
                      <span className="meta">
                        {r.ids.length > 1
                          ? `一组 ${r.ids.length} 张，依次命名为 ${r.name.trim() || '…'}-01 至 -${String(r.ids.length).padStart(2, '0')}`
                          : '1 张'}
                      </span>
                    </div>
                    <div className="lnm-orig">
                      <span className="label">原来</span>
                      {r.original ? (
                        <span data-tip-overflow={r.original}>{r.original}</span>
                      ) : (
                        <span className="muted">未起名</span>
                      )}
                    </div>
                    <div className="lnm-acts">
                      {r.state === 'done' ? (
                        <span className="lnm-state">已起名</span>
                      ) : (
                        <>
                          <button
                            className="btn quiet sm icon"
                            aria-label="接受"
                            disabled={!r.name.trim()}
                            onClick={() => void accept([r.key]).then(finishIfDone)}
                          >
                            <Icon name="check-line" />
                          </button>
                          <button
                            className="btn quiet sm icon"
                            aria-label="去掉"
                            onClick={() => {
                              const next = rows.map((x) =>
                                x.key === r.key ? { ...x, state: 'gone' as const } : x,
                              );
                              setRows(next);
                              finishIfDone(next);
                            }}
                          >
                            <Icon name="close-line" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </FlipScope>
            <div className="acts">
              <span className="help">
                {open.length ? `还有 ${open.length} 项未处理` : '全部处理完毕'}
              </span>
              <span className="sp" />
              <button className="btn quiet" onClick={() => close(doneCount(rows))}>
                放弃
              </button>
              <button
                className="btn ink"
                disabled={!open.some((r) => r.name.trim())}
                onClick={() =>
                  void accept(open.map((r) => r.key)).then((next) => close(doneCount(next)))
                }
              >
                全部接受
              </button>
            </div>
          </>
        )}
      </Dialog>
    </>
  );
}
