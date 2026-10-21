// 第二层：提示词栏的"参数""参考"页签（doc/design.md 2.26，原型 design/prototype-wb.js 的 paramsPane、refsPane）。
// 参数取自当前这一版，改过的那一行名字变成正文色，右边淡入"已修改"和恢复按钮；生成时只改这些。
// 参考只有 V4.5：Vibe（最多 16 个）和精确参考，两种不能同时用；不支持的模型写原因并给"换成 V4.5 Full"。
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { errorCode, invokeUI } from '../lib/commands';
import { mediaUrl } from '../lib/imageStage.js';
import { Icon, Seg, Slider, Stepper, Switch } from '../kit/controls';
import { useAsk } from '../kit/dialog';
import { MenuPop, type MenuEntry } from '../kit/menu';
import { useIndicator } from '../kit/motion';
import { useNotifications } from '../kit/toast';
import { Expand } from '../settings/parts';
import {
  FREE_STEPS,
  MAX_VIBES,
  MEDIUM_FIXED,
  MODEL_CAPS,
  MODEL_ORDER,
  NOISE_SCHEDULES,
  PRECISE_COST,
  SAMPLERS,
  VIBE_ENCODE_COST,
  VIBE_EXTRA_COST,
  VIBE_EXTRA_FREE,
  type GenerationSettings,
  type GridCell,
  type ModelId,
  type PreciseReference,
  type PreciseReferenceType,
  type VibeLibraryItem,
  type VibeReference,
} from '../shared/params';
import type { CommandTab } from '../shared/commands';
import type { ImageProject } from '../shared/types';

export type PromptTab = 'prompt' | 'params' | 'refs';

const modelName = (m?: string | null) => (m && MODEL_CAPS[m as ModelId]?.name) || m || '未知模型';
const samplerName = (s?: string | null) => SAMPLERS.find((x) => x.id === s)?.name || s || '—';
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** 改过的参数（和这一版比） */
export function changedParams(base?: GenerationSettings, draft?: GenerationSettings) {
  if (!base || !draft) return [];
  return (Object.keys(draft) as (keyof GenerationSettings)[]).filter(
    (k) => !same(base[k], draft[k]),
  );
}
const refCount = (p?: ImageProject | null) =>
  (p?.references?.vibes.length || 0) + (p?.references?.precise.length || 0);

/** 页签那一行：提示词 / 参数（有改动时一个墨色小圆点）/ 参考（参考图的个数） */
export function PromptTabs({
  value,
  onChange,
  tab,
  base,
}: {
  value: PromptTab;
  onChange: (t: PromptTab) => void;
  tab: CommandTab;
  base: ImageProject | null;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const mod = changedParams(base?.params, tab.project?.params).length > 0;
  const caps = MODEL_CAPS[tab.project?.params?.model as ModelId];
  const refs = caps?.references ? refCount(tab.project) : 0;
  useIndicator(box, [value, mod, refs]);
  const item = (k: PromptTab, name: string, extra?: ReactNode) => (
    <button
      className={value === k ? 'on' : ''}
      role="tab"
      aria-selected={value === k}
      onClick={() => onChange(k)}
    >
      {name}
      {extra}
    </button>
  );
  return (
    <div className="ptabs-row">
      <span className="ptabs has-ind" ref={box} role="tablist" aria-label="提示词栏">
        <i className="ind" />
        {item('prompt', '提示词')}
        {item(
          'params',
          '参数',
          mod ? <span className="pt-dot" data-enter="fade" data-tip="有改过的参数" /> : null,
        )}
        {item('refs', '参考', refs ? <span className="pt-n mono">{refs}</span> : null)}
      </span>
    </div>
  );
}

/** 当前这一版（参数和参考都和它比）；没有账号、没有版本时是原图 */
export function useBaseProject(tab: CommandTab | null, hasVersions: boolean) {
  const [base, setBase] = useState<{ project: ImageProject; name: string } | null>(null);
  useEffect(() => {
    if (!tab) return;
    let live = true;
    const fallback = () =>
      tab.originalProject && setBase({ project: tab.originalProject, name: '原图' });
    if (!hasVersions) {
      fallback();
      return;
    }
    void invokeUI('version.list', { tabId: tab.id })
      .then((r) => {
        if (!live) return;
        const v = r.versions.find((x) => x.id === tab.versionId) || r.versions[0];
        if (v)
          setBase({
            project: v.project,
            name: v.isStart ? '起点' : v.parentId ? `第 ${v.number} 版` : '原图',
          });
        else fallback();
      })
      .catch(() => live && fallback());
    return () => {
      live = false;
    };
  }, [tab?.id, tab?.versionId, hasVersions]);
  return base;
}

/** 改参数和参考：先把正在编辑的文字交出去，带上修订号；needs_confirm 时先确认 */
function useEdit(tab: CommandTab, before?: () => Promise<void>) {
  const notify = useNotifications();
  const [dialog, ask] = useAsk();
  const run = async <T,>(fn: () => Promise<T>) => {
    try {
      await before?.();
      return await fn();
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
      return null;
    }
  };
  const setParams = async (patch: Partial<GenerationSettings>) => {
    await before?.();
    const call = (dropReferences?: boolean) =>
      invokeUI('params.set', {
        tabId: tab.id,
        expectedRevision: tab.revision,
        patch,
        ...(dropReferences ? { dropReferences } : {}),
      });
    const tell = (notes: string[]) =>
      notes.length &&
      notify({
        text: patch.model
          ? `已换成 ${modelName(patch.model)}：${notes.join('；')}`
          : notes.join('；'),
      });
    try {
      tell((await call()).notes);
    } catch (e) {
      if (errorCode(e) !== 'needs_confirm') {
        notify({ text: (e as Error).message, tone: 'error' });
        return;
      }
      const n = refCount(tab.project);
      if (
        !(await ask({
          title: `换成 ${modelName(patch.model)}？`,
          body: `${modelName(patch.model)} 不支持 Vibe 和精确参考，这一版会去掉现在的 ${n} 个参考图。`,
          ok: '换模型',
        }))
      )
        return;
      try {
        tell((await call(true)).notes);
      } catch (err) {
        notify({ text: (err as Error).message, tone: 'error' });
      }
    }
  };
  return { setParams, run, dialog };
}

// ---------- 参数 ----------
function Row({
  label,
  help,
  changed,
  baseText,
  baseName,
  onReset,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  changed: boolean;
  baseText: string;
  baseName: string;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`prow ${changed ? 'mod' : ''}`}>
      <div className="pl">
        {label}
        {help && <small>{help}</small>}
      </div>
      <div className="pc">
        {children}
        <span className="pm-slot">
          {changed && (
            <span className="pmod" data-enter="fade">
              已修改
              <button
                className="btn quiet sm icon"
                aria-label="恢复"
                data-tip={`恢复成${baseName}的 ${baseText}`}
                onClick={onReset}
              >
                <Icon name="arrow-go-back-line" />
              </button>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
function Drop({
  label,
  value,
  items,
  off,
  tip,
}: {
  label: string;
  value: ReactNode;
  items: MenuEntry[];
  off?: boolean;
  tip?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={btn}
        className={`field sm pdd ${open ? 'open' : ''} ${off ? 'off' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-disabled={off || undefined}
        data-tip={off ? tip : undefined}
        onClick={() => !off && setOpen(!open)}
      >
        <span className="mono">{value}</span>
        <Icon name="arrow-down-s-line" />
      </button>
      <MenuPop open={open} onClose={() => setOpen(false)} anchor={btn} items={items} />
    </>
  );
}
const COLS = ['A', 'B', 'C', 'D', 'E'] as const;

export function ParamsPane({
  tab,
  base,
  before,
}: {
  tab: CommandTab;
  base: { project: ImageProject; name: string } | null;
  before?: () => Promise<void>;
}) {
  const { setParams, dialog } = useEdit(tab, before);
  const [kept, setKept] = useState(false);
  const p = tab.project?.params;
  const b = base?.project.params || p;
  if (!p || !b) return <p className="help pnote">正在读取参数…</p>;
  const caps = MODEL_CAPS[p.model];
  const med = !!caps?.effort && p.effort === 'Medium';
  const vn = base?.name || '原图';
  const chars = tab.project?.prompt_structure.characters || [];
  const keptList = tab.project?.keptParameters || [];
  const f = (k: keyof GenerationSettings) => !same(p[k], b[k]);
  const reset = (k: keyof GenerationSettings) => () => void setParams({ [k]: b[k] });
  const row = (
    k: keyof GenerationSettings,
    label: ReactNode,
    baseText: string,
    ctl: ReactNode,
    help?: ReactNode,
  ) => (
    <Row
      label={label}
      help={help}
      changed={f(k)}
      baseText={baseText}
      baseName={vn}
      onReset={reset(k)}
    >
      {ctl}
    </Row>
  );
  const originalModel = tab.originalProject?.params?.model;
  return (
    <div className="doc pdoc">
      <p className="help pnote">
        {vn === '起点'
          ? `参数取自${tab.project?.paramsSource === 'defaults' ? '默认设置' : '上次生成的设置'}，改过的会标出来。`
          : `参数取自${vn}，改过的会标出来，生成时只改这些。`}
        {keptList.length > 0 &&
          `原图里还有 ${keptList.length} 项界面上不能改的参数，原样带上，见最下面。`}
      </p>
      <div className="sec-h">模型</div>
      {row(
        'model',
        '模型',
        modelName(b.model),
        <Drop
          label="模型"
          value={modelName(p.model)}
          items={MODEL_ORDER.map((m) => {
            const c = MODEL_CAPS[m];
            const over = chars.length > c.maxCharacters;
            return {
              label: c.name,
              checked: m === p.model,
              disabled: over
                ? `这一版有 ${chars.length} 个角色，${c.name} 最多 ${c.maxCharacters} 个`
                : undefined,
              onSelect: () => m !== p.model && void setParams({ model: m }),
            };
          })}
        />,
        p.model === b.model
          ? '换了模型就是新的一版'
          : originalModel
            ? `原图是 ${modelName(originalModel)}`
            : undefined,
      )}
      <div className="sec-h">采样</div>
      {caps?.effort &&
        row(
          'effort',
          'Effort',
          b.effort || 'High',
          <Seg
            label="Effort"
            items={[
              ['High', 'High'],
              ['Medium', 'Medium'],
            ]}
            value={p.effort || 'High'}
            onChange={(effort) => void setParams({ effort })}
          />,
          med ? '固定 14 步，不用自定义的负面提示词；用量更少' : undefined,
        )}
      {row(
        'steps',
        '步数',
        String(b.steps),
        <Stepper
          label="步数"
          value={med ? MEDIUM_FIXED.steps : p.steps}
          step={1}
          min={1}
          max={50}
          digits={0}
          off={med}
          tip="Medium 固定 14 步"
          onChange={(steps) => void setParams({ steps })}
        />,
        med ? undefined : p.steps > FREE_STEPS ? (
          <span className="warn">超过 {FREE_STEPS} 步不在免费范围</span>
        ) : (
          `${FREE_STEPS} 步以内免费`
        ),
      )}
      {row(
        'scale',
        '引导强度',
        String(b.scale),
        <Stepper
          label="引导强度"
          value={p.scale}
          step={0.1}
          min={0}
          max={10}
          digits={1}
          onChange={(scale) => void setParams({ scale })}
        />,
        '0 到 10',
      )}
      {p.rescale != null &&
        !med &&
        row(
          'rescale',
          'Rescale',
          (b.rescale ?? 0).toFixed(2),
          <Stepper
            label="Rescale"
            value={p.rescale}
            step={0.02}
            min={0}
            max={1}
            digits={2}
            onChange={(rescale) => void setParams({ rescale })}
          />,
          '0 到 1',
        )}
      {row(
        'sampler',
        '采样器',
        samplerName(b.sampler),
        <Drop
          label="采样器"
          value={samplerName(med ? MEDIUM_FIXED.sampler : p.sampler)}
          off={med}
          tip="Medium 固定 Euler Ancestral"
          items={SAMPLERS.map((s) => ({
            label: s.name,
            checked: s.id === p.sampler,
            onSelect: () => void setParams({ sampler: s.id }),
          }))}
        />,
      )}
      {caps?.noise &&
        row(
          'noise',
          '噪声计划',
          b.noise || '—',
          <Drop
            label="噪声计划"
            value={p.noise || '—'}
            items={NOISE_SCHEDULES.map((n) => ({
              label: n,
              checked: n === p.noise,
              onSelect: () => void setParams({ noise: n }),
            }))}
          />,
        )}
      <div className="sec-h">提示词处理</div>
      {row(
        'quality',
        '质量 Tag',
        b.quality,
        <Seg
          label="质量 Tag"
          items={(caps?.qualities || ['None', 'Standard']).map((q) => [q, q] as const)}
          value={p.quality}
          onChange={(quality) => void setParams({ quality })}
        />,
        '加在提示词最后',
      )}
      {row(
        'uc',
        '负面预设',
        b.uc,
        <Drop
          label="负面预设"
          value={med ? MEDIUM_FIXED.uc : p.uc}
          off={med}
          tip="Medium 固定用 Heavy"
          items={(caps?.ucPresets || []).map((u) => ({
            label: u,
            checked: u === p.uc,
            onSelect: () => void setParams({ uc: u }),
          }))}
        />,
        '加在负面提示词最前面',
      )}
      <div className="sec-h">
        角色位置
        <span className="muted">{chars.length ? `${chars.length} 个角色` : '暂无角色'}</span>
      </div>
      {chars.length ? (
        <>
          {row(
            'aiPositions',
            '由 AI 选择位置',
            b.aiPositions ? '开启' : '关闭',
            <Switch
              label="由 AI 选择位置"
              on={p.aiPositions}
              onChange={(aiPositions) => void setParams({ aiPositions })}
            />,
            '关闭后逐个指定',
          )}
          <Expand open={!p.aiPositions}>
            {chars.map((c) => {
              const cur = p.positions[c.id] || 'C3';
              const was = b.aiPositions ? 'AI 选择' : b.positions[c.id] || 'C3';
              return (
                <Row
                  key={c.id}
                  label={c.label}
                  changed={!p.aiPositions && cur !== was}
                  baseText={was}
                  baseName={vn}
                  onReset={() =>
                    void setParams({
                      positions: { ...p.positions, [c.id]: b.positions[c.id] || 'C3' },
                    })
                  }
                >
                  <span className="posgrid" role="radiogroup" aria-label={`${c.label} 的位置`}>
                    {[1, 2, 3, 4, 5].flatMap((r) =>
                      COLS.map((x) => {
                        const cell = `${x}${r}` as GridCell;
                        return (
                          <i
                            key={cell}
                            role="radio"
                            aria-checked={cell === cur}
                            aria-label={cell}
                            data-tip={cell}
                            className={cell === cur ? 'on' : ''}
                            onClick={() =>
                              cell !== cur &&
                              void setParams({ positions: { ...p.positions, [c.id]: cell } })
                            }
                          />
                        );
                      }),
                    )}
                  </span>
                  <span className="mono muted pos-v">{cur}</span>
                </Row>
              );
            })}
          </Expand>
        </>
      ) : (
        <p className="help pnote">在“提示词”里添加角色后，可以指定每个角色在画面里的位置。</p>
      )}
      {keptList.length > 0 && (
        <>
          <div className="sec-h kept-h">
            原样带上的参数<span className="muted">{keptList.length} 项</span>
            <span className="acts" style={{ marginLeft: 'auto' }}>
              <button className="btn quiet sm" aria-expanded={kept} onClick={() => setKept(!kept)}>
                {kept ? '收起' : '显示'}
              </button>
            </span>
          </div>
          <Expand open={kept}>
            <div className="kept mono selectable">
              {keptList.flatMap(([k, v]) => [
                <span key={`k-${k}`}>{k}</span>,
                <span key={`v-${k}`}>{v}</span>,
              ])}
            </div>
          </Expand>
        </>
      )}
      {dialog}
    </div>
  );
}

// ---------- 参考 ----------
/** 参考图的滑块：拖动跟手（显示本地的值），松手才保存；原图里没有记录（未知）时不显示圆点和填充 */
function RefSlider({
  label,
  value,
  changed,
  off,
  tip,
  onCommit,
}: {
  label: string;
  value: number | null;
  changed?: boolean;
  off?: boolean;
  tip?: string;
  onCommit: (v: number) => void;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <div className={`vsl ${off ? 'off' : ''}`} data-tip={off ? tip : undefined}>
      <span className="vsl-l">{label}</span>
      <Slider
        className={`pslider ${v == null ? 'unknown' : ''}`}
        label={label}
        value={v ?? 0}
        min={0}
        max={1}
        step={0.01}
        page={10}
        disabled={off}
        onChange={setV}
        onCommit={(n) => n !== value && onCommit(n)}
      />
      <span className={`mono vval ${changed ? 'mod' : ''}`}>
        {v == null ? '未知' : v.toFixed(2)}
      </span>
    </div>
  );
}
const TYPES: [PreciseReferenceType, string][] = [
  ['character', '角色'],
  ['style', '风格'],
  ['character&style', '角色和风格'],
];

export function RefsPane({
  tab,
  base,
  before,
  highlight,
}: {
  tab: CommandTab;
  base: { project: ImageProject; name: string } | null;
  before?: () => Promise<void>;
  /** 从舞台上的 Vibe 小块点过来：高亮那一行 */
  highlight?: string;
}) {
  const { setParams, run, dialog } = useEdit(tab, before);
  const box = useRef<HTMLDivElement>(null);
  const addBtn = useRef<HTMLButtonElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [library, setLibrary] = useState<VibeLibraryItem[]>([]);
  const model = tab.project?.params?.model;
  const caps = MODEL_CAPS[model as ModelId];
  useEffect(() => {
    if (!highlight) return;
    box.current
      ?.querySelector(`[data-vrow="${CSS.escape(highlight)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);
  useEffect(() => {
    if (addOpen)
      void invokeUI('vibe.library', {})
        .then((r) => setLibrary(r.items))
        .catch(() => setLibrary([]));
  }, [addOpen]);
  if (!caps?.references)
    return (
      <div className="doc pdoc">
        <div className="empty pane-empty">
          <span className="pe-ic">
            <Icon name="image-circle-line" />
          </span>
          <h3>{modelName(model)} 暂不支持 Vibe 和精确参考</h3>
          <p>
            NovelAI 目前只在 V4.5 上提供这两项。可以在“参数”里把模型换成
            V4.5，生成出来的是新的一版。
          </p>
          <div className="acts">
            <button
              className="btn"
              onClick={() => void setParams({ model: 'nai-diffusion-4-5-full' })}
            >
              换成 V4.5 Full
            </button>
          </div>
        </div>
        {dialog}
      </div>
    );
  const refs = tab.project?.references || { vibes: [], precise: [] };
  const was = base?.project.references || { vibes: [], precise: [] };
  const rev = { tabId: tab.id, expectedRevision: tab.revision };
  const set = (
    id: string,
    patch: {
      strength?: number;
      information?: number;
      type?: PreciseReferenceType;
      fidelity?: number;
    },
  ) => void run(() => invokeUI('reference.set', { ...rev, id, ...patch }));
  const remove = (id: string) => void run(() => invokeUI('reference.remove', { ...rev, id }));
  const vibes = refs.vibes,
    precise = refs.precise;
  const used = new Set(vibes.map((v) => v.libraryId).filter(Boolean));
  const vrow = (v: VibeReference) => {
    const o = was.vibes.find((x) => x.id === v.id);
    return (
      <div
        key={v.id}
        className={`vrow ${highlight === v.id ? 'hi' : ''}`}
        data-vrow={v.id}
        data-enter="fade"
      >
        <span className="vthumb">
          {v.thumbnail ? (
            <img src={mediaUrl(v.thumbnail)} alt="" draggable={false} />
          ) : (
            <span className="vph">
              <Icon name="image-line" />
            </span>
          )}
        </span>
        <div className="vmain">
          <div className="vh">
            <b>{v.name}</b>
            {!o && <span className="src">新加</span>}
            <span className="mono muted vfile">{v.file || '尚未编码'}</span>
            <span className="sp" />
            <button
              className="btn quiet sm icon"
              aria-label="移除"
              data-tip="移除这个 Vibe"
              onClick={() => remove(v.id)}
            >
              <Icon name="close-line" />
            </button>
          </div>
          <RefSlider
            label="参考强度"
            value={v.strength}
            changed={!!o && o.strength !== v.strength}
            onCommit={(strength) => set(v.id, { strength })}
          />
          <RefSlider
            label="信息提取"
            value={v.information}
            changed={!!o && o.information !== v.information}
            off={!v.thumbnail}
            tip="原图里只有编码，没有参考图，不能重新编码"
            onCommit={(information) => set(v.id, { information })}
          />
          {v.encode && (
            <span className="help warn vnote" data-enter="fade">
              {v.encode === 'changed'
                ? `改了信息提取，生成前会重新编码，${VIBE_ENCODE_COST} Anlas`
                : `首次编码 ${VIBE_ENCODE_COST} Anlas。编码后存进 Vibe 库，以后再用不收费`}
            </span>
          )}
        </div>
      </div>
    );
  };
  const prow = (r: PreciseReference) => {
    const o = was.precise.find((x) => x.id === r.id);
    return (
      <div key={r.id} className="vrow" data-enter="fade">
        <span className="vthumb">
          <img src={mediaUrl(r.thumbnail)} alt="" draggable={false} />
        </span>
        <div className="vmain">
          <div className="vh">
            <b>{r.name}</b>
            {!o && <span className="src">新加</span>}
            <span className="sp" />
            <button
              className="btn quiet sm icon"
              aria-label="移除"
              data-tip="移除这个参考"
              onClick={() => remove(r.id)}
            >
              <Icon name="close-line" />
            </button>
          </div>
          <div className="vsl">
            <span className="vsl-l">类型</span>
            <Seg
              label="类型"
              items={TYPES}
              value={r.type}
              onChange={(type) => set(r.id, { type })}
            />
          </div>
          <RefSlider
            label="强度"
            value={r.strength}
            changed={!!o && o.strength !== r.strength}
            onCommit={(strength) => set(r.id, { strength })}
          />
          <RefSlider
            label="保真度"
            value={r.fidelity}
            changed={!!o && o.fidelity !== r.fidelity}
            onCommit={(fidelity) => set(r.id, { fidelity })}
          />
        </div>
      </div>
    );
  };
  const addItems: MenuEntry[] = [
    {
      label: '从图片添加…',
      icon: 'image-add-line',
      hint: `首次编码 ${VIBE_ENCODE_COST} Anlas`,
      onSelect: () => void run(() => invokeUI('reference.add-vibe', rev)),
    },
    'sep',
    { header: 'Vibe 库' },
    ...(library.length
      ? library.map((item) => ({
          label: item.name,
          checked: used.has(item.id),
          disabled: used.has(item.id) ? '已经在用' : undefined,
          hint: item.models.includes(model as ModelId)
            ? undefined
            : `要编码 ${VIBE_ENCODE_COST} Anlas`,
          onSelect: () =>
            void run(() => invokeUI('reference.add-vibe', { ...rev, libraryId: item.id })),
        }))
      : [{ label: 'Vibe 库里还没有。生成时编码过的 Vibe 会存进来', disabled: true }]),
  ];
  const extra = Math.max(0, vibes.length - VIBE_EXTRA_FREE);
  return (
    <div className="doc pdoc" ref={box}>
      <p className="help pnote">
        参考图让生成的图接近另一张图的气氛（Vibe）或角色、画风（精确参考）。两种不能同时用。
      </p>
      <div className="sec-h">
        Vibe
        <span className="muted">
          {vibes.length} / {MAX_VIBES}
        </span>
        <span className="acts" style={{ marginLeft: 'auto' }}>
          <button
            ref={addBtn}
            className={`btn quiet sm ${precise.length || vibes.length >= MAX_VIBES ? 'is-off' : ''} ${addOpen ? 'is-hover' : ''}`}
            aria-disabled={precise.length > 0 || vibes.length >= MAX_VIBES || undefined}
            data-tip={
              precise.length
                ? 'Vibe 不能和精确参考一起用，先移除精确参考'
                : vibes.length >= MAX_VIBES
                  ? `最多 ${MAX_VIBES} 个`
                  : undefined
            }
            onClick={() => !precise.length && vibes.length < MAX_VIBES && setAddOpen(!addOpen)}
          >
            <Icon name="add-line" />
            添加 Vibe
            <Icon name="arrow-down-s-line" />
          </button>
        </span>
      </div>
      {vibes.length ? (
        vibes.map(vrow)
      ) : (
        <p className="help pnote">
          暂无 Vibe。可以从 Vibe 库里选，也可以用一张图片新建（首次编码 {VIBE_ENCODE_COST} Anlas）。
        </p>
      )}
      {vibes.length > 0 && (
        <p className={`help pnote ${extra ? 'warn' : ''}`}>
          超过 {VIBE_EXTRA_FREE} 个以后，每多 1 个每张加 {VIBE_EXTRA_COST} Anlas
          {extra ? `；现在多 ${extra} 个，每张加 ${extra * VIBE_EXTRA_COST} Anlas` : ''}。
        </p>
      )}
      <div className="sec-h">
        精确参考<span className="muted">{precise.length} 个</span>
        <span className="acts" style={{ marginLeft: 'auto' }}>
          <button
            className={`btn quiet sm ${vibes.length ? 'is-off' : ''}`}
            aria-disabled={vibes.length > 0 || undefined}
            data-tip={vibes.length ? '精确参考不能和 Vibe 一起用，先移除 Vibe' : undefined}
            onClick={() => !vibes.length && void run(() => invokeUI('reference.add-precise', rev))}
          >
            <Icon name="add-line" />
            添加精确参考
          </button>
        </span>
      </div>
      {precise.length ? (
        precise.map(prow)
      ) : (
        <p className="help pnote">
          暂无精确参考。用一张图指定角色或画风，每个参考每张加 {PRECISE_COST} Anlas。
        </p>
      )}
      <MenuPop
        open={addOpen}
        onClose={() => setAddOpen(false)}
        anchor={addBtn}
        place="below-right"
        items={addItems}
        wide
      />
      {dialog}
    </div>
  );
}
