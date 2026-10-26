// 随机池和随机块（doc/design.md 2.44）：提示词里的 __池名__ 记号在块方式下画成虚线框，
// 点开浮层选池子、抽几个、能不能重复、权重随机；每张图生成前各抽一次，抽到什么记在图上。
import { useEffect, useState } from 'react';
import { Icon, Stepper, Switch } from '../kit/controls';
import { Pop } from '../kit/layer';
import type { MenuEntry } from '../kit/menu';
import { invokeUI } from '../lib/commands';
import { serializePromptSection, type PromptBlock } from '../lib/promptDocument';
import {
  formatRandomMarker,
  parseRandomMarker,
  type RandomOptions,
  type RandomRecord,
} from '../lib/randomPrompt';
import { Dropdown } from '../settings/parts';
import type { Material } from '../shared/materials';

// ---------- 随机池列表：工作台各处共用一份，素材页改了以后通知刷新 ----------
let pools: Material[] | null = null;
const subs = new Set<() => void>();
let loading: Promise<void> | null = null;
export function refreshPools() {
  loading ??= invokeUI('material.list', {})
    .then((r) => {
      pools = r.items.filter((m) => m.kind === 'pool');
      subs.forEach((f) => f());
    })
    .catch(() => {})
    .finally(() => (loading = null));
  return loading;
}
export const POOLS_CHANGED = 'nps:pools-changed';
if (typeof window !== 'undefined') {
  // 回到窗口时也读一遍：Agent 可能刚建了池子
  window.addEventListener(POOLS_CHANGED, () => void refreshPools());
  window.addEventListener('focus', () => subs.size && void refreshPools());
}
export function usePools() {
  const [list, setList] = useState(pools || []);
  useEffect(() => {
    const f = () => setList(pools || []);
    subs.add(f);
    if (!pools) void refreshPools();
    else f();
    return () => void subs.delete(f);
  }, []);
  return list;
}

/** 随机块是不是记号（含写错的）：块方式下都画成随机块，写错的标黄 */
export const isRandomBlock = (b: PromptBlock) =>
  b.content.startsWith('__') && (b.type === 'random' || !!b.syntaxNote);

/** 块里的抽取设置；池子不存在、条目不够时也照写的读出来，修改时保留 */
export function readRandom(b?: PromptBlock): RandomOptions | null {
  if (!b) return null;
  if (b.random) return b.random;
  try {
    return parseRandomMarker(b.content);
  } catch {
    return null;
  }
}

const chanceText = (n: number) => (n === 1 ? '' : ` ×${n}`);
/** 悬停随机块：列出池里的条目（太多时只列前面的） */
export function poolTip(pool: Material | undefined, name: string) {
  if (!pool) return `找不到随机池「${name}」`;
  const list = pool.entries || [];
  if (!list.length) return `${name} · 还没有条目`;
  const shown = list.slice(0, 12).map((e) => `${e.text}${chanceText(e.chance)}`);
  return [
    `${name} · ${list.length} 条`,
    ...shown,
    ...(list.length > shown.length ? [`… 还有 ${list.length - shown.length} 条`] : []),
  ].join('\n');
}

/** 一张图抽到了什么：版本栏、挑图的悬停提示用 */
export function randomSummary(record?: RandomRecord | null) {
  if (!record?.blocks.length) return '';
  return ['抽到的内容', ...record.blocks.map((b) => `${b.pool}：${b.text}`)].join('\n');
}

/** 块方式下的随机块：一个虚线框，点开编辑 */
export function RandomBox({
  block,
  pools,
  trigger,
  onOpen,
}: {
  block: PromptBlock;
  pools: Material[];
  trigger: string;
  onOpen: () => void;
}) {
  const r = block.random;
  if (!r || block.syntaxNote)
    return (
      <button className="rnd-box warn" data-trigger={trigger} data-tip="点击修改" onClick={onOpen}>
        <Icon name="error-warning-line" />
        <span className="mono rnd-src">{block.content}</span>
        <span className="rnd-note">{block.syntaxNote || '随机块格式不正确'}</span>
      </button>
    );
  const pool = pools.find((x) => x.name === r.pool);
  return (
    <button
      className="rnd-box"
      data-trigger={trigger}
      data-tip={poolTip(pool, r.pool)}
      onClick={onOpen}
    >
      <Icon name="dice-line" />
      <b>{r.pool}</b>
      <span>· 抽 {r.count} 个</span>
      {r.repeat && <span className="rnd-opt">可重复</span>}
      {r.weight && (
        <span className="rnd-opt">
          权重 {r.weight.min}～{r.weight.max}
        </span>
      )}
      <span className="sp" />
      {pool && <span className="rnd-n">{pool.entries?.length || 0} 条</span>}
    </button>
  );
}

const DEFAULT_WEIGHT = { min: 0.8, max: 1.2, step: 0.05 };

/** 加一个或修改随机块的浮层 */
export function RandomPop({
  open,
  anchor,
  editing,
  initial,
  pools,
  onClose,
  onSave,
  onManage,
}: {
  open: boolean;
  anchor?: string;
  /** 修改已有的一块（写错的也算）；否则是加一个 */
  editing: boolean;
  /** 修改时原来的设置；写错读不出来时没有 */
  initial?: RandomOptions | null;
  pools: Material[];
  onClose: () => void;
  onSave: (marker: string) => void;
  onManage?: () => void;
}) {
  const [o, setO] = useState<RandomOptions>({ pool: '', count: 1, repeat: false });
  const [weightOn, setWeightOn] = useState(false);
  const [weight, setWeight] = useState(DEFAULT_WEIGHT);
  useEffect(() => {
    if (!open) return;
    void refreshPools();
    const known = initial && pools.some((p) => p.name === initial.pool);
    setO(
      initial
        ? { ...initial, pool: known ? initial.pool : '' }
        : { pool: editing ? '' : pools[0]?.name || '', count: 1, repeat: false },
    );
    setWeightOn(!!initial?.weight);
    setWeight(initial?.weight || DEFAULT_WEIGHT);
  }, [open]);
  const pool = pools.find((p) => p.name === o.pool);
  const n = pool?.entries?.length || 0;
  const max = o.repeat ? 16 : Math.max(1, Math.min(16, n));
  const count = Math.min(o.count, max);
  const opts = { ...o, count, ...(weightOn ? { weight } : { weight: undefined }) };
  let marker = '';
  let error = '';
  try {
    marker = o.pool ? formatRandomMarker(opts) : '';
  } catch (e) {
    error = (e as Error).message;
  }
  if (!error && pool && !n) error = '这个随机池还没有条目';
  const ok = !!marker && !error;
  const poolItems: MenuEntry[] = [
    ...pools.map((p) => ({
      label: p.name,
      hint: `${p.entries?.length || 0} 条`,
      checked: p.name === o.pool,
      onSelect: () => setO({ ...o, pool: p.name }),
    })),
    ...(onManage ? (['sep', { label: '管理随机池…', onSelect: onManage }] as MenuEntry[]) : []),
  ];
  return (
    <Pop
      open={open}
      onClose={onClose}
      anchor={anchor}
      trigger={anchor}
      place="below-left"
      className="popover rnd-pop"
      label="随机块"
      deps={[weightOn, pools.length]}
    >
      <div className="rnd-pop-h">
        <b>{editing ? '随机块' : '加一个随机块'}</b>
        <span className="help">每张图生成前从池子里各抽一次，抽到什么记在那张图上</span>
      </div>
      {!pools.length ? (
        <>
          <p className="help">还没有随机池。先在素材里建一个，一行放一个画师串、动作或背景。</p>
          <div className="foot">
            <span className="sp" />
            <button className="btn quiet sm" onClick={onClose}>
              取消
            </button>
            <button
              className="btn ink sm"
              onClick={() => {
                onClose();
                onManage?.();
              }}
            >
              去建随机池
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="frow">
            <span className="label">随机池</span>
            <Dropdown
              label="随机池"
              value={o.pool || <span className="muted">选一个随机池</span>}
              items={poolItems}
              menuClass="rnd-pools"
            />
          </div>
          <div className="frow">
            <span className="label">抽几个</span>
            <Stepper
              label="抽几个"
              value={count}
              step={1}
              min={1}
              max={max}
              digits={0}
              onChange={(v) => setO({ ...o, count: v })}
            />
          </div>
          <div className="frow rnd-sw">
            <span className="label">重复</span>
            <span className="rnd-sw-r">
              <Switch on={o.repeat} onChange={(v) => setO({ ...o, repeat: v })} label="可以重复" />
              <span className="help">同一张图里可以抽到同一条</span>
            </span>
          </div>
          <div className="frow rnd-sw">
            <span className="label">权重</span>
            <span className="rnd-sw-r">
              <Switch on={weightOn} onChange={setWeightOn} label="权重随机" />
              <span className="help">抽到的每个 Tag 各自随机一个权重</span>
            </span>
          </div>
          {weightOn && (
            <>
              <div className="frow">
                <span className="label">范围</span>
                <span className="rnd-range">
                  <Stepper
                    label="最小权重"
                    value={weight.min}
                    step={0.05}
                    min={0.1}
                    max={3}
                    digits={2}
                    onChange={(v) => setWeight({ ...weight, min: v })}
                  />
                  <span className="muted">～</span>
                  <Stepper
                    label="最大权重"
                    value={weight.max}
                    step={0.05}
                    min={0.1}
                    max={3}
                    digits={2}
                    onChange={(v) => setWeight({ ...weight, max: v })}
                  />
                </span>
              </div>
              <div className="frow">
                <span className="label">步长</span>
                <Stepper
                  label="步长"
                  value={weight.step}
                  step={0.01}
                  min={0.01}
                  max={1}
                  digits={2}
                  onChange={(v) => setWeight({ ...weight, step: v })}
                />
              </div>
            </>
          )}
          <div className="rnd-pop-src">
            {error ? (
              <span className="rnd-err">{error}</span>
            ) : marker ? (
              <>
                <span className="help">文本里写成</span>
                <code className="mono">{marker}</code>
              </>
            ) : (
              <span className="help">先选一个随机池</span>
            )}
          </div>
          <div className="foot">
            {onManage && (
              <button
                className="btn quiet sm"
                onClick={() => {
                  onClose();
                  onManage();
                }}
              >
                管理随机池
              </button>
            )}
            <span className="sp" />
            <button className="btn quiet sm" onClick={onClose}>
              取消
            </button>
            <button className="btn ink sm" disabled={!ok} onClick={() => onSave(marker)}>
              {editing ? '保存' : '加入'}
            </button>
          </div>
        </>
      )}
    </Pop>
  );
}

/**
 * 图上右键"用这张抽到的内容"：草稿里的随机块换成这张图实际用的文字和权重。
 * 草稿里的随机块改过（换了池子、挪了位置）对不上的跳过，通知里写明。
 */
export async function applyRandom({
  tabId,
  versionId,
  imageId,
  before,
  notify,
}: {
  tabId: string;
  versionId: string;
  imageId: string;
  before?: () => Promise<void>;
  notify: ReturnType<typeof import('../kit/toast').useNotifications>;
}) {
  try {
    await before?.();
    // 撤销用：先记下各节原来的文字，撤销时写回去
    const old = await invokeUI('workbench.get', { tabId });
    const r = await invokeUI('version.apply-random', { tabId, versionId, imageId });
    if (!r.applied) {
      notify({ text: '草稿里的随机块已经改过，没有可以替换的', tone: 'error' });
      return;
    }
    const changed = old.document.scopes.filter(
      (s, i) => serializePromptSection(s) !== serializePromptSection(r.document.scopes[i] || s),
    );
    notify({
      text: r.skipped.length
        ? `已换成这张抽到的内容；${r.skipped.length} 个随机块草稿里已经改过，没有换`
        : '已把随机块换成这张抽到的内容',
      tone: 'success',
      action: {
        label: '撤销',
        onClick: () =>
          void (async () => {
            for (const s of changed)
              await invokeUI('prompt.set', {
                tabId,
                scope: s.scope.key,
                text: serializePromptSection(s),
              });
          })().catch((e) => notify({ text: (e as Error).message, tone: 'error' })),
      },
    });
  } catch (e) {
    notify({ text: (e as Error).message, tone: 'error' });
  }
}
