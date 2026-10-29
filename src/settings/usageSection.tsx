// 设置 · NovelAI 账号里的"用量"（doc/design.md 2.42，1.8.6）：今天 / 本周 / 本月花了多少、多少张，
// 按操作、按模型分，其中 Agent 多少；最近 30 天每天一根小柱子。中转站不写 Anlas：1.9.12 起只统计当前这一家，
// 查得到扣费的写"额度"（和它网站上的数字一样，不同站不能相加），查不到的只写张数。只在本机，不上传。
import { useEffect, useState } from 'react';
import { Seg } from '../kit/controls';
import { invokeUI } from '../lib/commands';
import { MODEL_CAPS, type ModelId } from '../shared/params';
import type { UsageDaily, UsageSummary, UsageTotals } from '../shared/usage';
import { useGeneration } from '../state/generation';
import { quotaText, relayPresetFor } from '../shared/relayPresets';

type Range = 'today' | 'week' | 'month';
const RANGE: [Range, string][] = [
  ['today', '今天'],
  ['week', '本周'],
  ['month', '本月'],
];
const OP: Record<string, string> = {
  generate: '生成',
  upscale: '放大',
  enhance: '增强',
  img2img: '图生图',
  inpaint: '局部重绘',
  outpaint: '扩图',
  director: '导演工具',
};
const modelName = (id: string) => {
  const base = id.replace(/-inpainting$/, '');
  const name = MODEL_CAPS[base as ModelId]?.name || base;
  return base === id ? name : `${name}（局部重绘）`;
};

const day = (date: string) => {
  const [, m, d] = date.split('-');
  return `${Number(m)} 月 ${Number(d)} 日`;
};

export function Usage() {
  const g = useGeneration();
  const relay = g.settings.connection === 'relay';
  const [range, setRange] = useState<Range>('today');
  const [sum, setSum] = useState<UsageSummary | null>(null);
  const [daily, setDaily] = useState<UsageDaily | null>(null);
  // 生成完一张，今天的数就变：跟着标题栏同一份数据刷新
  const tick = `${g.today?.requests ?? ''}:${g.today?.anlas ?? ''}:${g.settings.connection}`;
  useEffect(() => {
    let live = true;
    void invokeUI('usage.summary', { range })
      .then((r) => live && setSum(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [range, tick]);
  useEffect(() => {
    let live = true;
    void invokeUI('usage.daily', { days: 30 })
      .then((r) => live && setDaily(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [tick]);

  const amount = (t?: UsageTotals | null, short = false) => {
    if (!t) return '…';
    const n = `${t.images} 张`;
    if (relay)
      return t.quota != null
        ? short
          ? `${quotaText(t.quota)} 额度`
          : `${quotaText(t.quota)} 额度 · ${n}`
        : n;
    if (t.anlas == null) return n;
    const a = `${t.anlas.toLocaleString('en-US')} Anlas${t.estimated ? '*' : ''}`;
    return short ? a : `${a} · ${n}`;
  };
  const rows = (map: Record<string, UsageTotals> | undefined, name: (k: string) => string) =>
    Object.entries(map || {})
      .filter(([, t]) => t.requests)
      .sort(
        ([, a], [, b]) =>
          (b.quota ?? b.anlas ?? 0) - (a.quota ?? a.anlas ?? 0) || b.images - a.images,
      )
      .map(([k, t]) => (
        <div className="usage-row" key={k}>
          <span>{name(k)}</span>
          <span className="mono">{amount(t)}</span>
        </div>
      ));
  const ops = rows(sum?.byOperation, (k) => OP[k] || k);
  const models = rows(sum?.byModel, modelName);
  // 柱子：官方按 Anlas、中转站按额度（都没有时按张数）
  const items = daily?.items || [];
  const byAnlas = !relay && items.some((d) => (d.anlas ?? 0) > 0);
  const byQuota = relay && items.some((d) => (d.quota ?? 0) > 0);
  const value = (d: (typeof items)[number]) =>
    byAnlas ? (d.anlas ?? 0) : byQuota ? (d.quota ?? 0) : d.images;
  const relayName = relay
    ? (relayPresetFor(g.settings.relay?.baseUrl || '')?.name ?? '自定义中转站')
    : '';
  const peak = Math.max(1, ...items.map(value));
  const estimated = !!sum?.estimated || items.some((d) => d.estimated);
  return (
    <>
      <h2>用量</h2>
      <div className="usage" data-feature="usage">
        <div className="usage-top">
          <Seg label="统计范围" items={RANGE} value={range} onChange={setRange} />
          <span className="help">
            {relay
              ? `只统计${relayName}；额度和它网站上显示的数字一样，查不到扣费的只记张数`
              : '按每次请求前后的余额统计'}
          </span>
        </div>
        <div className="usage-total">
          <b className="mono">{amount(sum, true)}</b>
          {sum && (!relay || sum.quota != null) && <span className="mono">{sum.images} 张</span>}
          {sum && sum.agent.requests > 0 && (
            <span className="usage-agent">其中 Agent {amount(sum.agent)}</span>
          )}
        </div>
        {sum && sum.requests > 0 ? (
          <div className="usage-split">
            <div>
              <span className="label">按操作</span>
              {ops}
            </div>
            <div>
              <span className="label">按模型</span>
              {models}
            </div>
          </div>
        ) : (
          sum && <p className="help">{RANGE.find((r) => r[0] === range)![1]}还没有生成过。</p>
        )}
        {items.length > 0 && (
          <div className="usage-days">
            <span className="label">
              最近 30 天{byAnlas ? ' · Anlas' : byQuota ? ' · 额度' : ' · 张数'}
            </span>
            <div className="usage-bars">
              {items.map((d) => (
                <span
                  key={d.date}
                  className={value(d) ? '' : 'zero'}
                  style={{ '--h': `${(value(d) / peak) * 100}%` } as React.CSSProperties}
                  data-tip={`${day(d.date)} · ${amount(d)}`}
                />
              ))}
            </div>
          </div>
        )}
        <small className="help">
          从 1.8.6 开始统计，只记在这台电脑上，不上传；以前的生成没有记录。
          {relay ? '中转站从 1.9.12 开始按每一家分开统计和记额度。' : ''}
          {estimated ? '带 * 的含估算：那几次没查到请求前后的余额，按价格估算。' : ''}
        </small>
      </div>
    </>
  );
}
