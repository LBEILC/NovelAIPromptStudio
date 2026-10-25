import { useState, type ReactNode } from 'react';
import { Seg, Stepper, Switch } from '../kit/controls';
import { Expand } from '../settings/parts';
import type { CommandTab } from '../shared/commands';
import {
  FREE_STEPS,
  MEDIUM_FIXED,
  MODEL_CAPS,
  MODEL_ORDER,
  NEW_WORK_DEFAULTS,
  NOISE_SCHEDULES,
  PARAMETER_LIMITS,
  SAMPLERS,
  type GenerationSettings,
  type GridCell,
} from '../shared/params';
import type { ImageProject } from '../shared/types';
import { useGeneration } from '../state/generation';
import { Drop, Row, modelName, same, samplerName, useEdit } from './parameterControls';

export const COLS = ['A', 'B', 'C', 'D', 'E'] as const;

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
  // 中转站只挂了部分模型（doc/design.md 2.33）；读不到列表时是 null，不限制
  const gen = useGeneration().settings;
  const offered = gen.connection === 'relay' ? gen.relay?.models : null;
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
                : offered && !offered.includes(m)
                  ? '中转站没有这个模型'
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
          min={PARAMETER_LIMITS.steps.min}
          max={PARAMETER_LIMITS.steps.max}
          digits={0}
          fallback={FREE_STEPS}
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
          min={PARAMETER_LIMITS.scale.min}
          max={PARAMETER_LIMITS.scale.max}
          digits={1}
          fallback={NEW_WORK_DEFAULTS.scale}
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
            min={PARAMETER_LIMITS.rescale.min}
            max={PARAMETER_LIMITS.rescale.max}
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
