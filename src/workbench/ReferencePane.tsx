import { useEffect, useRef, useState } from 'react';
import { Icon, Seg, Slider } from '../kit/controls';
import { MenuPop, type MenuEntry } from '../kit/menu';
import { invokeUI } from '../lib/commands';
import { BlurImg } from '../kit/blur';
import type { CommandTab } from '../shared/commands';
import {
  MAX_VIBES,
  MODEL_CAPS,
  PRECISE_COST,
  VIBE_ENCODE_COST,
  VIBE_EXTRA_COST,
  VIBE_EXTRA_FREE,
  type ModelId,
  type PreciseReference,
  type PreciseReferenceType,
  type VibeLibraryItem,
  type VibeReference,
} from '../shared/params';
import type { ImageProject } from '../shared/types';
import { useGeneration } from '../state/generation';
import { modelName, useEdit } from './parameterControls';

// ---------- 参考 ----------
/** 参考图的滑块：拖动跟手（显示本地的值），松手才保存；原图里没有记录（未知）时不显示圆点和填充 */
export function RefSlider({
  label,
  value,
  changed,
  off,
  tip,
  onCommit,
  min = 0,
  max = 1,
}: {
  label: string;
  value: number | null;
  changed?: boolean;
  off?: boolean;
  tip?: string;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
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
        min={min}
        max={max}
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

export const TYPES: [PreciseReferenceType, string][] = [
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
  // 中转站编不了 Vibe 的码，也不按 Anlas 计费（doc/design.md 2.33）
  const relay = useGeneration().settings.connection === 'relay';
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
  // ---------- 底图（图生图，1.8，doc/design.md 2.34）----------
  const rev0 = { tabId: tab.id, expectedRevision: tab.revision };
  const baseImg = tab.project?.references?.base || null;
  const wasBase = base?.project.references?.base || null;
  const canBase = !!caps?.img2img;
  const tw = Number(tab.project?.metadata?.width) || 0,
    th = Number(tab.project?.metadata?.height) || 0;
  const stretched =
    !!baseImg &&
    tw > 0 &&
    th > 0 &&
    Math.abs(baseImg.width / baseImg.height - tw / th) / (tw / th) > 0.02;
  /** 面积不变、比例换成底图的，宽高贴 64 */
  const fitBase = () => {
    if (!baseImg) return;
    const area = tw * th,
      r = baseImg.width / baseImg.height;
    const snap = (n: number) => Math.max(64, Math.round(n / 64) * 64);
    void run(() =>
      invokeUI('prompt.set-size', {
        tabId: tab.id,
        width: snap(Math.sqrt(area * r)),
        height: snap(Math.sqrt(area / r)),
      }),
    );
  };
  const setBase = (input: { imageId?: string; strength?: number; noise?: number }) =>
    void run(() => invokeUI('reference.set-base', { ...rev0, ...input }));
  const baseBlock = (
    <>
      <div className="sec-h">
        底图<span className="muted">图生图</span>
        <span className="acts" style={{ marginLeft: 'auto' }}>
          {baseImg ? (
            <button
              className="btn quiet sm icon"
              aria-label="移除底图"
              data-tip="移除底图，回到只按提示词生成"
              onClick={() => void run(() => invokeUI('reference.remove', { ...rev0, id: 'base' }))}
            >
              <Icon name="close-line" />
            </button>
          ) : (
            <>
              <button
                className={`btn quiet sm ${!canBase || !tab.versionImageId ? 'is-off' : ''}`}
                aria-disabled={!canBase || !tab.versionImageId || undefined}
                data-tip={
                  !canBase
                    ? `${modelName(model)} 不能用底图`
                    : !tab.versionImageId
                      ? '先在舞台上选一张图'
                      : '用舞台上正在看的这张'
                }
                onClick={() =>
                  canBase && tab.versionImageId && setBase({ imageId: tab.versionImageId })
                }
              >
                用当前这张
              </button>
              <button
                className={`btn quiet sm ${!canBase ? 'is-off' : ''}`}
                aria-disabled={!canBase || undefined}
                data-tip={!canBase ? `${modelName(model)} 不能用底图` : undefined}
                onClick={() => canBase && setBase({})}
              >
                <Icon name="add-line" />
                从文件选…
              </button>
            </>
          )}
        </span>
      </div>
      {baseImg ? (
        <div className="vrow base-row" data-enter="fade">
          <span className="vthumb">
            {baseImg.thumbnail.startsWith('data:') ? (
              <img src={baseImg.thumbnail} alt="" draggable={false} />
            ) : (
              <BlurImg
                image={baseImg.projectId ? { id: baseImg.projectId } : null}
                path={baseImg.thumbnail}
                tab={tab.id}
                eye={false}
                alt=""
                draggable={false}
              />
            )}
          </span>
          <div className="vmain">
            <div className="vh">
              {/* 没起名的图名字是一长串 ID / 哈希，不显示（和图片库一样） */}
              <b>{/^[0-9a-f-]{16,}(\.\w+)?$/i.test(baseImg.name) ? '底图' : baseImg.name}</b>
              {!wasBase && <span className="src">新加</span>}
              <span className="mono muted vfile">
                {baseImg.width} × {baseImg.height}
              </span>
            </div>
            <RefSlider
              label="强度"
              value={baseImg.strength}
              min={0.01}
              max={0.99}
              changed={!!wasBase && wasBase.strength !== baseImg.strength}
              onCommit={(strength) => setBase({ strength })}
            />
            <RefSlider
              label="噪声"
              value={baseImg.noise}
              max={0.99}
              changed={!!wasBase && wasBase.noise !== baseImg.noise}
              onCommit={(noise) => setBase({ noise })}
            />
            {!canBase ? (
              <span className="help warn vnote" data-enter="fade">
                {modelName(model)} 不能用底图，生成前换成 V5 或 V4.5，或者移除底图
              </span>
            ) : stretched ? (
              <span className="help warn vnote base-fit" data-enter="fade">
                底图比例和要生成的 {tw} × {th} 不一样，会被拉伸
                <button className="btn quiet sm" onClick={fitBase}>
                  改成底图的比例
                </button>
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="help pnote">
          {canBase
            ? '有底图时按底图出图：强度越大越不像底图，噪声越大细节越多。图片库里右键一张图也能放进来。'
            : `${modelName(model)} 不能用底图，V5 和 V4.5 可以。`}
        </p>
      )}
    </>
  );
  if (!caps?.references)
    return (
      <div className="doc pdoc">
        {canBase && baseBlock}
        {canBase ? (
          <>
            <div className="sec-h">Vibe 和精确参考</div>
            <p className="help pnote">
              {modelName(model)} 没有这两项，NovelAI 只在 V4.5 上提供。
              <button
                className="btn quiet sm"
                onClick={() => void setParams({ model: 'nai-diffusion-4-5-full' })}
              >
                换成 V4.5 Full
              </button>
            </p>
          </>
        ) : (
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
        )}
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
            <BlurImg
              image={null}
              path={v.thumbnail}
              tab={tab.id}
              eye={false}
              alt=""
              draggable={false}
            />
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
              {relay
                ? '中转站不能给 Vibe 编码，这样生成会失败。换回官方连接，或者改用 Vibe 库里编过码的'
                : v.encode === 'changed'
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
          <BlurImg
            image={null}
            path={r.thumbnail}
            tab={tab.id}
            eye={false}
            alt=""
            draggable={false}
          />
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
      hint: relay ? '中转站不能编码' : `首次编码 ${VIBE_ENCODE_COST} Anlas`,
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
            : relay
              ? '中转站不能编码'
              : `要编码 ${VIBE_ENCODE_COST} Anlas`,
          onSelect: () =>
            void run(() => invokeUI('reference.add-vibe', { ...rev, libraryId: item.id })),
        }))
      : [{ label: 'Vibe 库里还没有。生成时编码过的 Vibe 会存进来', disabled: true }]),
  ];
  const extra = Math.max(0, vibes.length - VIBE_EXTRA_FREE);
  return (
    <div className="doc pdoc" ref={box}>
      {baseBlock}
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
          {relay
            ? '暂无 Vibe。可以从 Vibe 库里选编过码的；中转站不能给新图编码。'
            : `暂无 Vibe。可以从 Vibe 库里选，也可以用一张图片新建（首次编码 ${VIBE_ENCODE_COST} Anlas）。`}
        </p>
      )}
      {vibes.length > 0 && !relay && (
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
          {relay
            ? '暂无精确参考。用一张图指定角色或画风。'
            : `暂无精确参考。用一张图指定角色或画风，每个参考每张加 ${PRECISE_COST} Anlas。`}
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
