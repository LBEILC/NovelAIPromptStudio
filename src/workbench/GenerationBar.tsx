// 提示词栏底部的底栏（doc/design.md 2.23）：Seed、尺寸、张数、费用、"生成"。放不下时按顺序收起（src/styles/07-core.css 的 @container），
// "生成"永远完整。生成中左边换成"生成中 2 / 3 · 已消耗 N Anlas"，"生成"换成不可点的"生成中"，旁边"停止"。
// 不在免费范围时上面一条横幅说清原因和要花多少，右边一键改回免费尺寸。没有配置账号时只有"生成"，点了引导去设置。
import { useEffect, useRef, useState } from 'react';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';
import { Icon, Kbd, Seg } from '../kit/controls';
import { Pop } from '../kit/layer';
import { MenuPop } from '../kit/menu';
import { useNotifications } from '../kit/toast';
import { useSwap } from '../kit/motion';
import type { CommandTab } from '../shared/commands';
import type { GenerationEstimate } from '../shared/generation';

const MAX_AREA = 1536 * 2048;
const norm = (n: string) => Math.min(2048, Math.max(64, Math.round(Number(n) / 64) * 64));
const PRESETS = [
  ['竖图', 832, 1216],
  ['横图', 1216, 832],
  ['方图', 1024, 1024],
] as const;
const free = (w: number, h: number) => w * h <= 1024 * 1024;

/** 没有配置 NovelAI 账号时：底栏只有"生成"，点了在按钮上方弹出引导。 */
export function GenerationSetup({ onConfigure }: { onConfigure: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bar gen-bar">
      <span className="sp" />
      <button
        className={`btn seal ${open ? 'is-hover' : ''}`}
        data-trigger="notoken"
        onClick={() => setOpen(!open)}
      >
        生成
      </button>
      <Pop
        open={open}
        onClose={() => setOpen(false)}
        anchor='[data-trigger="notoken"]'
        trigger='[data-trigger="notoken"]'
        place="above-right"
        enter="pop-up"
        className="popover notoken"
        label="配置 NovelAI 账号"
      >
        <p>在"设置 → NovelAI 账号"里填入持久令牌后，就可以在这里生成新的一版。</p>
        <div className="row nt-acts">
          <span className="sp" />
          <button
            className="btn ink sm"
            onClick={() => {
              setOpen(false);
              onConfigure();
            }}
          >
            去设置
          </button>
        </div>
      </Pop>
    </div>
  );
}

/** 放大、增强（1.8）在队列里时写"放大中""增强中"，其余照旧"生成中" */
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

/**
 * 底栏右边生成中的样子："停止"和"加入队列"（1.8.6，2.46：生成中也能接着排，按当时的草稿再存一份）。
 * 加入队列和"生成"一样的条件（余额、AI 提案），不能排时写原因。
 */
function GenBusy({
  job,
  queue,
}: {
  job: { id: string; stop?: boolean; operation?: string };
  queue: { off: boolean; tip: string; onClick: () => void };
}) {
  return (
    <>
      <button
        className="btn quiet sm icon"
        aria-label={job.stop ? '正在停止' : '停止'}
        data-tip={job.stop ? '正在停止：做完这张就停' : '停止：做完这张就停，这一份剩下的不发'}
        disabled={job.stop}
        onClick={() => void invokeUI('generate.stop', { id: job.id })}
      >
        <Icon name="stop-line" />
      </button>
      <button
        className={`btn seal ${queue.off ? 'is-off' : ''}`}
        aria-disabled={queue.off || undefined}
        data-tip={queue.tip}
        onClick={() => !queue.off && queue.onClick()}
      >
        加入队列
      </button>
    </>
  );
}

export function GenerationBar({
  tab,
  before,
  proposal,
}: {
  tab: CommandTab;
  before?: () => Promise<void>;
  proposal?: boolean;
}) {
  const state = useGeneration();
  const notify = useNotifications();
  const [count, setCount] = useState(1);
  const [countText, setCountText] = useState<string | null>(null);
  const [continuous, setContinuous] = useState(false);
  const [seed, setSeed] = useState<number | null>(null);
  const [seedText, setSeedText] = useState<string | null>(null);
  // 底栏最窄时 Seed 只剩一个图标：点开一个小浮层，在里面切随机 / 固定、输入数值
  const [seedPop, setSeedPop] = useState(false);
  const [seedDraft, setSeedDraft] = useState('');
  const seedBtn = useRef<HTMLButtonElement>(null);
  const [estimate, setEstimate] = useState<GenerationEstimate | null>(null);
  const [sizeMenu, setSizeMenu] = useState(false);
  const [custom, setCustom] = useState<{ w: string; h: string } | null>(null);
  const [customEstimate, setCustomEstimate] = useState<GenerationEstimate | null>(null);
  const [original, setOriginal] = useState<{ width: number; height: number } | null>(null);
  const [starting, setStarting] = useState(false);
  const m = tab.project?.metadata;
  const w = m?.width || 832,
    h = m?.height || 1216;
  useEffect(() => {
    if (state.settings.hasToken)
      void invokeUI('version.list', { tabId: tab.id }).then((r) =>
        // 空白作品的起点没有图，尺寸菜单里不列"原图"
        setOriginal(r.versions[0]?.isStart ? null : r.versions[0]?.project.metadata || null),
      );
  }, [tab.id, state.settings.hasToken]);
  useEffect(() => {
    if (!state.settings.continuous) setContinuous(false);
  }, [state.settings.continuous]);
  useEffect(() => {
    let live = true;
    if (state.settings.hasToken)
      void Promise.resolve(before?.())
        .then(() => invokeUI('generate.estimate', { tabId: tab.id, count: continuous ? 1 : count }))
        .then((e) => live && e && setEstimate(e))
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [tab.project, tab.id, count, continuous, state.subscription, state.settings.hasToken]);
  useEffect(() => {
    if (!custom) return;
    let live = true;
    void invokeUI('generate.estimate', {
      tabId: tab.id,
      count: 1,
      width: norm(custom.w),
      height: norm(custom.h),
    }).then((r) => live && setCustomEstimate(r));
    return () => {
      live = false;
    };
  }, [custom, tab.id, state.subscription]);
  const job = state.jobs.find(
    (j) => j.tabId === tab.id && ['generating', 'queued'].includes(j.state),
  );
  const busyElsewhere = state.jobs.some((j) => j.state === 'generating' && j.tabId !== tab.id);
  const left = useSwap('normal', (k) => k);
  // 右边（费用和"生成" ↔ "停止"和"生成中"）也原地换内容；以前直接换（用户 10-25）。
  // 当前这份排在前面，querySelector 先找到它
  const rightSwap = useSwap({ key: job ? 'busy' : 'normal', job }, (v) => v.key);
  const right = [...rightSwap.filter((f) => !f.leaving), ...rightSwap.filter((f) => f.leaving)];
  const setSteps28 = async () => {
    try {
      await before?.();
      await invokeUI('params.set', { tabId: tab.id, patch: { steps: 28 } });
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };
  const choose = async (width: number, height: number) => {
    try {
      await before?.();
      await invokeUI('prompt.set-size', { tabId: tab.id, width, height });
      setSizeMenu(false);
      setCustom(null);
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };
  const commitCount = (text: string | null) => {
    const v = (text || '').trim();
    if (/^\d+$/.test(v) && Number(v) > 0 && Number.isSafeInteger(Number(v))) {
      setCount(Number(v));
      setContinuous(false);
    }
    setCountText(null);
  };
  const commitSeed = (save: boolean) => {
    if (seedText === null) return;
    const v = seedText.trim();
    if (save) {
      if (!v) setSeed(null);
      else if (/^\d+$/.test(v) && Number(v) <= 4294967295) setSeed(Number(v));
      else notify({ text: 'Seed 只能是 0 到 4294967295 的整数', tone: 'error' });
    }
    setSeedText(null);
  };
  const saveSeedDraft = () => {
    const v = seedDraft.trim();
    if (!v) setSeed(null);
    else if (/^\d+$/.test(v) && Number(v) <= 4294967295) setSeed(Number(v));
    else {
      notify({ text: 'Seed 只能是 0 到 4294967295 的整数', tone: 'error' });
      setSeedDraft(seed === null ? '' : String(seed));
    }
  };
  const go = async () => {
    if (proposal) {
      notify({ text: '先接受或放弃 AI 提案，再生成' });
      return;
    }
    setStarting(true);
    try {
      await before?.();
      await invokeUI('generate.start', {
        tabId: tab.id,
        count,
        continuous,
        fixedSeed: seed !== null,
        ...(seed !== null ? { seed } : {}),
      });
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    } finally {
      setStarting(false);
    }
  };
  if (!state.settings.hasToken) return null;
  // 中转站：不查余额、不显示 Anlas，按张计费（doc/design.md 2.33）
  const relay = state.settings.connection === 'relay';
  const cost = estimate?.anlas ?? 0;
  const short = !relay && cost > state.balance;
  const usage = state.subscription?.usage?.percent || 0;
  const sub = estimate?.free ? `用量 ${usage}%` : `余额 ${state.balance.toLocaleString('en-US')}`;
  // 不在免费范围（订阅了的账号才说；未订阅的每次都花，不出横幅）
  // 1.4 起按草稿的参数和参考算（没有参数的旧数据退回元数据）
  const params = tab.project?.params,
    refs = tab.project?.references;
  const steps = Number(params?.steps ?? m?.steps);
  const why = [
    !free(w, h) ? `尺寸 ${w}×${h} 超过 1024×1024` : '',
    steps > 28 ? `步数 ${steps} 超过 28` : '',
    (params
      ? params.model.startsWith('nai-diffusion-5')
      : /(?:^|[^.\d])5(?:[^.\d]|$)/.test(String(m?.model))) && state.subscription?.usage?.isNegative
      ? 'V5 免费用量已用尽'
      : '',
    (refs?.vibes.length || 0) > 4 ? 'Vibe 超过 4 个' : '',
    refs?.vibes.some((v) => v.encode) ? 'Vibe 需要编码' : '',
    refs?.precise.length ? '带精确参考' : '',
  ].filter(Boolean);
  const fix = PRESETS.find(([, pw, ph]) => Math.sign(pw - ph) === Math.sign(w - h))!;
  const banner =
    !relay &&
    !!estimate &&
    !estimate.free &&
    !estimate.unavailable &&
    !job &&
    !!state.subscription?.active &&
    state.subscription.tier >= 3;
  const unavailable = estimate?.unavailable || '';
  const goTip =
    unavailable || (short ? '余额不够' : busyElsewhere ? '已有任务在生成，将排在其后' : '');
  const sizeItems = [
    ...(original && !PRESETS.some(([, pw, ph]) => pw === original.width && ph === original.height)
      ? [['原图', original.width, original.height] as const]
      : []),
    ...PRESETS,
  ];
  const listed = sizeItems.some(([, pw, ph]) => pw === w && ph === h);
  const cw = custom ? norm(custom.w) : 0,
    ch = custom ? norm(custom.h) : 0,
    cOk =
      !!custom &&
      /^\d+$/.test(custom.w.trim()) &&
      /^\d+$/.test(custom.h.trim()) &&
      Number(custom.w) > 0 &&
      Number(custom.h) > 0,
    cFixed = cOk && (String(cw) !== custom!.w.trim() || String(ch) !== custom!.h.trim()),
    // NovelAI 的上限是面积（047 实测：2048×1536 可以，2112×1536 被拒，"Maximum allowed resolution is 1536x2048"）
    cBig = cOk && cw * ch > MAX_AREA,
    cGo = cOk && !cBig;
  return (
    <>
      {banner && (
        <div className="gen-banner" data-enter="fade">
          <div className="banner warn">
            <Icon name="alert-line" />
            <span>
              本次生成不在免费范围内：{why.join('；') || '超出免费范围'}，
              {short
                ? `需要 ${cost} Anlas，当前余额 ${state.balance}`
                : continuous
                  ? `每张 ${cost} Anlas`
                  : `将消耗 ${cost} Anlas`}
              。
            </span>
            {!free(w, h) && (
              <button className="btn sm" onClick={() => void choose(fix[1], fix[2])}>
                改成 {fix[1]}×{fix[2]}
              </button>
            )}
            {steps > 28 && params && (
              <button className="btn sm" onClick={() => void setSteps28()}>
                改成 28 步
              </button>
            )}
          </div>
        </div>
      )}
      <div className="bar gen-bar">
        <span className="swap">
          {left.map(({ key, leaving }) => (
            <span
              key={key}
              className={`row ${leaving ? 'leaving' : ''}`}
              data-enter="fade"
              style={{ flexWrap: 'nowrap' }}
            >
              <span className={`field sm seedf ${seedText !== null ? 'editing' : ''}`}>
                <button
                  ref={seedBtn}
                  className={`seed-t ${seedPop ? 'is-hover' : ''}`}
                  aria-label={seed === null ? '固定 Seed' : '改为随机'}
                  data-tip={
                    seedPop
                      ? undefined
                      : seed === null
                        ? 'Seed 随机 · 点击固定为上一张图的 Seed'
                        : `Seed ${seed} · 点击改为随机`
                  }
                  onPointerEnter={(e) => {
                    // 数值收起来了的时候，点它是打开浮层
                    const val = e.currentTarget.parentElement?.querySelector('.seed-val');
                    if (seedPop) return;
                    e.currentTarget.dataset.tip =
                      val && getComputedStyle(val).display === 'none'
                        ? `Seed ${seed ?? '随机'} · 点击修改`
                        : seed === null
                          ? 'Seed 随机 · 点击固定为上一张图的 Seed'
                          : `Seed ${seed} · 点击改为随机`;
                  }}
                  onClick={(e) => {
                    // 数值收起来了（最窄的时候）：打开浮层，不直接切换
                    const val = e.currentTarget.parentElement?.querySelector('.seed-val');
                    if (val && getComputedStyle(val).display === 'none') {
                      setSeedDraft(seed === null ? '' : String(seed));
                      setSeedPop(!seedPop);
                      return;
                    }
                    setSeedText(null);
                    setSeed(seed === null ? Number(m?.seed || 0) : null);
                  }}
                >
                  <Icon name={seed === null ? 'shuffle-line' : 'lock-line'} />
                </button>
                <span className="muted seed-lbl">Seed</span>
                {seedText !== null ? (
                  <input
                    className="seed-val mono"
                    autoFocus
                    inputMode="numeric"
                    value={seedText}
                    placeholder="随机"
                    aria-label="Seed"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setSeedText(e.target.value)}
                    onBlur={() => commitSeed(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Escape') {
                        e.preventDefault();
                        e.stopPropagation();
                        commitSeed(e.key === 'Enter');
                      }
                    }}
                  />
                ) : (
                  <button
                    className={`seed-val mono ${seed === null ? 'rand' : ''}`}
                    data-tip="点击输入 Seed，清空就是随机"
                    onClick={() => setSeedText(seed === null ? '' : String(seed))}
                  >
                    {seed ?? '随机'}
                  </button>
                )}
              </span>
              <Pop
                open={seedPop}
                onClose={() => {
                  saveSeedDraft();
                  setSeedPop(false);
                }}
                anchor={seedBtn}
                trigger={seedBtn}
                place="above-left"
                enter="pop-up"
                className="popover seed-pop"
                label="Seed"
                restoreFocus
              >
                <div className="frow">
                  <span className="label">Seed</span>
                  <Seg
                    label="Seed"
                    items={[
                      ['rand', '随机'],
                      ['fixed', '固定'],
                    ]}
                    value={seed === null ? 'rand' : 'fixed'}
                    onChange={(k) => {
                      const next = k === 'rand' ? null : Number(m?.seed || 0);
                      setSeed(next);
                      setSeedDraft(next === null ? '' : String(next));
                    }}
                  />
                </div>
                <label className="field sm mono">
                  <input
                    autoFocus
                    inputMode="numeric"
                    value={seedDraft}
                    placeholder="随机"
                    aria-label="Seed 数值"
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setSeedDraft(e.target.value)}
                    onBlur={saveSeedDraft}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        saveSeedDraft();
                        setSeedPop(false);
                      }
                    }}
                  />
                </label>
                <span className="help">
                  固定时用这里的数值，清空就是随机。只收 0 到 4294967295 的整数。
                </span>
              </Pop>
              <button
                className="field sm size-btn"
                data-trigger="size"
                data-tip="尺寸"
                onClick={() => setSizeMenu(!sizeMenu)}
              >
                <Icon name="aspect-ratio-line" />
                <span className="mono">
                  {w}×{h}
                </span>
              </button>
              <span
                className={`stepper count-step ${continuous ? 'cont' : ''}`}
                data-tip={
                  continuous
                    ? '持续生成，直到点"停止"。请求仍逐张发送'
                    : '张数：没有上限，点数字可以直接输入。请求逐张发送；张数多时相当于连续生成，NovelAI 要求生成由人的操作发起，风险由你自行判断'
                }
              >
                <span
                  role="button"
                  aria-label="减少张数"
                  onClick={() => {
                    setContinuous(false);
                    setCount(Math.max(1, count - 1));
                  }}
                >
                  −
                </span>
                {countText !== null ? (
                  <b className="count-in">
                    <input
                      className="mono"
                      autoFocus
                      inputMode="numeric"
                      value={countText}
                      aria-label="张数"
                      autoComplete="off"
                      onChange={(e) => setCountText(e.target.value)}
                      onBlur={() => commitCount(countText)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitCount(countText);
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setCountText(null);
                        }
                      }}
                    />
                  </b>
                ) : (
                  <b
                    className="count-n mono"
                    role="button"
                    onClick={() => setCountText(String(count))}
                  >
                    {continuous ? (
                      '持续'
                    ) : (
                      <>
                        {count}
                        <span className="cunit"> 张</span>
                      </>
                    )}
                  </b>
                )}
                <span
                  role="button"
                  aria-label="增加张数"
                  onClick={() => {
                    setContinuous(false);
                    setCount(count + 1);
                  }}
                >
                  +
                </span>
                {state.settings.continuous && (
                  <span
                    className={`cont-btn ${continuous ? 'on' : ''}`}
                    role="button"
                    aria-label="持续生成"
                    aria-pressed={continuous}
                    onClick={() => setContinuous(!continuous)}
                  >
                    ∞
                  </span>
                )}
              </span>
            </span>
          ))}
        </span>
        <span className="sp" />
        <span className="swap gen-acts">
          {right.map(({ key, value, leaving }) => (
            <span
              key={key}
              className={`gen-act ${leaving ? 'leaving' : ''}`}
              data-feature={leaving ? undefined : 'cost'}
              inert={leaving || undefined}
              data-enter="fade"
            >
              {(() => {
                // 生成中：费用的第二行写进度（左边照常能改张数，加入队列的是几张一眼看得到，用户 10-26）
                const j = value.job;
                const progress = j
                  ? j.stop
                    ? `${busyVerb(j.operation)} ${stepOf(j)} · 做完这张停`
                    : j.continuous
                      ? `生成中 · 第 ${j.index} 张`
                      : `${busyVerb(j.operation)} ${stepOf(j)}`
                  : '';
                const off = starting || !estimate || !!unavailable || short;
                return (
                  <>
                    {relay ? (
                      <span className="cost" data-tip="中转站按它自己的价格计费">
                        <b>中转站</b>
                        <span>{progress || '按张计费'}</span>
                      </span>
                    ) : (
                      <span
                        className={`cost ${short ? 'short' : ''}`}
                        data-tip={
                          short
                            ? '余额不够'
                            : j
                              ? `${progress} · 这一份已消耗 ${j.spentKnown ? `${j.spent} Anlas` : '未知'} · ${sub}`
                              : sub
                        }
                      >
                        <b>
                          {estimate ? cost : '…'} Anlas{continuous ? ' / 张' : ''}
                        </b>
                        <span>{progress || sub}</span>
                      </span>
                    )}
                    {j ? (
                      <GenBusy
                        job={j}
                        queue={{
                          off,
                          tip:
                            unavailable ||
                            (short ? '余额不够' : '按现在的草稿和张数再排一份，排在后面'),
                          onClick: () => void go(),
                        }}
                      />
                    ) : (
                      <button
                        className={`btn seal ${off ? 'is-off' : ''}`}
                        aria-disabled={off || undefined}
                        data-tip={goTip || undefined}
                        onClick={() => {
                          if (off) return;
                          void go();
                        }}
                      >
                        {busyElsewhere ? '排队生成' : '生成'}
                      </button>
                    )}
                  </>
                );
              })()}
            </span>
          ))}
        </span>
      </div>
      <MenuPop
        open={sizeMenu && !custom}
        onClose={() => setSizeMenu(false)}
        anchor='[data-trigger="size"]'
        place="above-left"
        items={[
          ...(!listed
            ? [
                {
                  label: (
                    <>
                      当前
                      <span className="mono size-v">
                        {w}×{h}
                      </span>
                    </>
                  ),
                  checked: true,
                  onSelect: () => {},
                },
              ]
            : []),
          ...sizeItems.map(([label, pw, ph]) => ({
            label: (
              <>
                {label}
                <span className="mono size-v">
                  {pw}×{ph}
                </span>
              </>
            ),
            checked: pw === w && ph === h,
            hint: pw === w && ph === h ? undefined : free(pw, ph) ? undefined : '收费',
            onSelect: () => void choose(pw, ph),
          })),
          'sep',
          { label: '自定义…', onSelect: () => setCustom({ w: String(w), h: String(h) }) },
        ]}
      />
      <Pop
        open={!!custom}
        onClose={() => setCustom(null)}
        anchor='[data-trigger="size"]'
        place="above-left"
        enter="pop-up"
        className="popover size-pop"
        label="自定义尺寸"
      >
        {custom && (
          <>
            <div className="size-row">
              <label className="field sm">
                <span className="muted">宽</span>
                <input
                  className="mono"
                  autoFocus
                  inputMode="numeric"
                  value={custom.w}
                  aria-label="宽"
                  onChange={(e) =>
                    /^\d*$/.test(e.target.value) && setCustom({ ...custom, w: e.target.value })
                  }
                  onKeyDown={(e) => e.key === 'Enter' && cGo && void choose(cw, ch)}
                />
              </label>
              <button
                className="btn quiet sm icon"
                aria-label="交换宽和高"
                onClick={() => setCustom({ w: custom.h, h: custom.w })}
              >
                <Icon name="arrow-left-right-line" />
              </button>
              <label className="field sm">
                <span className="muted">高</span>
                <input
                  className="mono"
                  inputMode="numeric"
                  value={custom.h}
                  aria-label="高"
                  onChange={(e) =>
                    /^\d*$/.test(e.target.value) && setCustom({ ...custom, h: e.target.value })
                  }
                  onKeyDown={(e) => e.key === 'Enter' && cGo && void choose(cw, ch)}
                />
              </label>
            </div>
            <div className="size-note">
              {!cOk ? (
                <span className="help danger">填写宽和高</span>
              ) : cBig ? (
                <span className="help danger">
                  {cFixed ? `将使用 ${cw}×${ch} · ` : ''}超过 NovelAI 的上限：面积最大 1536×2048
                </span>
              ) : relay ? (
                cFixed ? (
                  <span className="help">将使用 {`${cw}×${ch}`}</span>
                ) : null
              ) : free(cw, ch) ? (
                <span className="help">{cFixed ? `将使用 ${cw}×${ch} · ` : ''}在免费范围内</span>
              ) : (
                <span className="help warn">
                  {cFixed ? `将使用 ${cw}×${ch} · ` : ''}超出免费范围，每张{' '}
                  {customEstimate?.perImage ?? '…'} Anlas
                </span>
              )}
              <span className="help">宽和高取 64 的倍数</span>
            </div>
            <div className="row">
              <span className="help key-hint">
                <Kbd keys="Enter" />
                <span>确定</span>
                <Kbd keys="Esc" />
                <span>取消</span>
              </span>
              <span className="sp" />
              <button className="btn quiet sm" onClick={() => setCustom(null)}>
                取消
              </button>
              <button
                className={`btn ink sm ${cGo ? '' : 'is-off'}`}
                data-tip={cBig ? '面积最大 1536×2048' : undefined}
                onClick={() => cGo && void choose(cw, ch)}
              >
                确定
              </button>
            </div>
          </>
        )}
      </Pop>
    </>
  );
}
