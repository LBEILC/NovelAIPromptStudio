import { useEffect, useRef, useState } from 'react';
import { Banner, Button, Input, Popover, useNotifications } from '../ui';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';
import type { CommandTab } from '../shared/commands';
import type { GenerationEstimate } from '../shared/generation';
import './generation.css';

const norm = (n: string) => Math.min(2048, Math.max(64, Math.round(Number(n) / 64) * 64));
const presets = [
  ['竖图', 832, 1216],
  ['横图', 1216, 832],
  ['方图', 1024, 1024],
] as const;
export function GenerationBar({ tab, before }: { tab: CommandTab; before?: () => Promise<void> }) {
  const state = useGeneration(),
    notify = useNotifications();
  const [count, setCount] = useState(1),
    [input, setInput] = useState<string | null>(null),
    [continuous, setContinuous] = useState(false),
    [fixed, setFixed] = useState(false);
  const [estimate, setEstimate] = useState<GenerationEstimate | null>(null),
    [menu, setMenu] = useState(false),
    [custom, setCustom] = useState(false),
    [size, setSize] = useState({ width: '', height: '' });
  const anchor = useRef<HTMLButtonElement>(null),
    [starting, setStarting] = useState(false);
  const [customEstimate, setCustomEstimate] = useState<GenerationEstimate | null>(null),
    [originalSize, setOriginalSize] = useState<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (state.settings.hasToken)
      void invokeUI('version.list', { tabId: tab.id }).then((r) =>
        setOriginalSize(r.versions[0]?.project.metadata),
      );
  }, [tab.id, state.settings.hasToken]);
  useEffect(() => {
    if (!custom) return;
    let active = true;
    void invokeUI('generate.estimate', {
      tabId: tab.id,
      count: 1,
      width: norm(size.width),
      height: norm(size.height),
    }).then((r) => {
      if (active) setCustomEstimate(r);
    });
    return () => {
      active = false;
    };
  }, [custom, size, tab.id, state.subscription]);
  const job = state.jobs.find(
    (j) => j.tabId === tab.id && ['generating', 'queued'].includes(j.state),
  );
  const metadata = tab.project?.metadata;
  const w = metadata?.width || 832,
    h = metadata?.height || 1216;
  useEffect(() => {
    if (!state.settings.continuous) setContinuous(false);
  }, [state.settings.continuous]);
  useEffect(() => {
    let active = true;
    if (state.settings.hasToken)
      void Promise.resolve(before?.())
        .then(() => invokeUI('generate.estimate', { tabId: tab.id, count: continuous ? 1 : count }))
        .then((e) => {
          if (active && e) setEstimate(e);
        })
        .catch(() => {});
    return () => {
      active = false;
    };
  }, [tab.project, tab.id, count, continuous, state.subscription, state.settings.hasToken]);
  if (!state.settings.hasToken) return null;
  const choose = async (width: number, height: number) => {
    try {
      await before?.();
      await invokeUI('prompt.set-size', { tabId: tab.id, width, height });
      setMenu(false);
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };
  const commitCount = () => {
    if (
      input !== null &&
      /^\d+$/.test(input) &&
      Number.isSafeInteger(Number(input)) &&
      Number(input) > 0
    )
      setCount(Number(input));
    setInput(null);
  };
  const freeSize = presets.find(([, pw, ph]) => Math.sign(pw - ph) === Math.sign(w - h))!;
  return (
    <>
      {!!estimate && !estimate.free && !estimate.unavailable && w * h > 1048576 && (
        <Banner tone="warn">
          超出免费范围，每张 {estimate.perImage} Anlas
          <Button size="small" onClick={() => void choose(freeSize[1], freeSize[2])}>
            改成 {freeSize[1]}×{freeSize[2]}
          </Button>
        </Banner>
      )}
      <div className="wb-generation-bar">
        {job ? (
          <>
            <span className="wb-generation-now">
              {job.stop
                ? '完成当前这张后停止'
                : job.continuous
                  ? `生成中 第 ${job.index} 张 · 持续生成`
                  : `生成中 ${job.index} / ${job.count} · 已消耗 ${job.spent} Anlas`}
            </span>
            <Button disabled>
              <i className="ri-loader-4-line nps-spinner" />
              生成中
            </Button>
            <Button
              disabled={job.stop}
              onClick={() => void invokeUI('generate.stop', { id: job.id })}
            >
              {job.stop ? '正在停止' : '停止'}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="small"
              data-tip={fixed ? `固定 Seed ${metadata?.seed}` : '随机 Seed'}
              onClick={() => setFixed(!fixed)}
            >
              <span className="wb-seed-label">Seed</span>
              {fixed ? '固定' : '随机'}
            </Button>
            <Button
              size="small"
              ref={anchor}
              className="wb-size-button"
              onClick={() => {
                setMenu(!menu);
                setCustom(false);
              }}
            >
              <i className="ri-aspect-ratio-line" />
              {w}×{h}
            </Button>
            <div
              className="wb-count-step"
              data-tip="张数：没有上限，点数字可以直接输入。请求逐张发送；张数多时相当于连续生成，NovelAI 要求生成由人的操作发起，风险由你自行判断"
            >
              <Button
                size="small"
                aria-label="减少张数"
                onClick={() => {
                  setContinuous(false);
                  setCount(Math.max(1, count - 1));
                }}
              >
                −
              </Button>
              {input === null ? (
                <Button size="small" aria-label="张数" onClick={() => setInput(String(count))}>
                  {continuous ? '持续' : count}
                </Button>
              ) : (
                <Input
                  aria-label="输入张数"
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onBlur={commitCount}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitCount();
                    if (e.key === 'Escape') setInput(null);
                  }}
                />
              )}
              <Button
                size="small"
                aria-label="增加张数"
                onClick={() => {
                  setContinuous(false);
                  setCount(count + 1);
                }}
              >
                +
              </Button>
              {state.settings.continuous && (
                <Button
                  size="small"
                  aria-label="持续生成"
                  aria-pressed={continuous}
                  onClick={() => setContinuous(!continuous)}
                >
                  ∞
                </Button>
              )}
            </div>
            <span
              className={`wb-generation-cost ${(estimate?.anlas || 0) > state.balance ? 'is-insufficient' : ''}`}
            >
              <strong>
                {estimate?.anlas ?? '…'} Anlas{continuous ? ' / 张' : ''}
              </strong>
              <small>
                {estimate?.free
                  ? `用量 ${state.subscription?.usage?.percent || 0}%`
                  : `余额 ${state.balance.toLocaleString('en-US')}`}
              </small>
            </span>
            <span
              data-tip={
                estimate?.unavailable ||
                ((estimate?.anlas || 0) > state.balance
                  ? 'Anlas 不足'
                  : state.jobs.some((j) => j.state === 'generating')
                    ? '已有任务在生成，将排在其后'
                    : '')
              }
            >
              <Button
                variant="cinnabar"
                disabled={
                  starting || !estimate || !!estimate.unavailable || estimate.anlas > state.balance
                }
                onClick={async () => {
                  setStarting(true);
                  try {
                    await before?.();
                    await invokeUI('generate.start', {
                      tabId: tab.id,
                      count,
                      continuous,
                      fixedSeed: fixed,
                    });
                  } catch (e) {
                    notify({ text: (e as Error).message, tone: 'error' });
                  } finally {
                    setStarting(false);
                  }
                }}
              >
                {state.jobs.some((j) => j.state === 'generating') ? '排队生成' : '生成'}
              </Button>
            </span>
          </>
        )}
      </div>
      <Popover open={menu} anchor={anchor} onClose={() => setMenu(false)} label="尺寸">
        {custom ? (
          <>
            <div
              className="wb-custom-size"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && Number(size.width) > 0 && Number(size.height) > 0)
                  void choose(norm(size.width), norm(size.height));
              }}
            >
              <Input
                aria-label="宽"
                value={size.width}
                onChange={(e) => setSize({ ...size, width: e.target.value })}
              />
              <Button
                aria-label="交换宽高"
                variant="quiet"
                onClick={() => setSize({ width: size.height, height: size.width })}
              >
                ×
              </Button>
              <Input
                aria-label="高"
                value={size.height}
                onChange={(e) => setSize({ ...size, height: e.target.value })}
              />
            </div>
            <p className="nps-help">
              {norm(size.width) !== Number(size.width) || norm(size.height) !== Number(size.height)
                ? `将使用 ${norm(size.width)}×${norm(size.height)} · `
                : ''}
              {customEstimate?.free
                ? '在免费范围内'
                : `超出免费范围，每张 ${customEstimate?.perImage ?? '…'} Anlas`}
            </p>
            <p className="nps-help">宽和高取 64 的倍数</p>
            <div className="settings-actions">
              <Button onClick={() => setMenu(false)}>取消</Button>
              <Button
                variant="ink"
                disabled={
                  !/^\d+$/.test(size.width) ||
                  !/^\d+$/.test(size.height) ||
                  Number(size.width) <= 0 ||
                  Number(size.height) <= 0
                }
                onClick={() => void choose(norm(size.width), norm(size.height))}
              >
                确定
              </Button>
            </div>
          </>
        ) : (
          <div className="wb-size-menu">
            {originalSize &&
              !presets.some(
                ([, pw, ph]) => pw === originalSize.width && ph === originalSize.height,
              ) && (
                <Button
                  variant="quiet"
                  onClick={() => void choose(originalSize.width, originalSize.height)}
                >
                  原图 {originalSize.width}×{originalSize.height}
                  {originalSize.width === w && originalSize.height === h ? ' ✓' : ''}
                  {originalSize.width * originalSize.height > 1048576 ? ' · 收费' : ''}
                </Button>
              )}
            {!presets.some(([, pw, ph]) => pw === w && ph === h) && (
              <Button variant="quiet" onClick={() => setMenu(false)}>
                当前 {w}×{h} ✓
              </Button>
            )}
            {presets.map(([label, pw, ph]) => (
              <Button variant="quiet" key={label} onClick={() => void choose(pw, ph)}>
                {label} {pw}×{ph}
                {pw === w && ph === h ? ' ✓' : ''}
              </Button>
            ))}
            <Button
              variant="quiet"
              onClick={() => {
                setCustom(true);
                setSize({ width: String(w), height: String(h) });
              }}
            >
              自定义…
            </Button>
          </div>
        )}
      </Popover>
    </>
  );
}
