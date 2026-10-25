// 放大和增强（doc/design.md 2.34，1.8）：舞台下面操作条上的两个按钮，各自一个小浮层。
// 放大不用调东西，只写结果尺寸和价格；增强选幅度（1–5）和放大档位（这张图能用的才列出来）。
// 结果都是新的一版，接在这张图所在那一版下面；进度走生成队列。
import { useEffect, useState } from 'react';
import { Icon, Seg } from '../kit/controls';
import { Pop } from '../kit/layer';
import { useNotifications } from '../kit/toast';
import { invokeUI } from '../lib/commands';
import type { EnhanceScale } from '../shared/generation';
import { useGeneration } from '../state/generation';

type Op = 'upscale' | 'enhance';
type Estimate = Awaited<ReturnType<typeof invokeUI<'generate.estimate-op'>>>;
const SCALE_NAME: Record<string, string> = { '1': '1x', '1.5': '1.5x', '2': '2x', max: 'Max' };
const SCALE_TIP: Record<string, string> = {
  '1': '不放大',
  '1.5': '宽高各 1.5 倍',
  '2': '宽高各 2 倍',
  max: '尽量放大到 300 万像素左右',
};
const MAGNITUDE_TIP = ['强度 0.2', '强度 0.4', '强度 0.5', '强度 0.6', '强度 0.7，噪声 0.1'];

export function ImageOps({
  tabId,
  imageId,
  width,
  height,
  off,
  open,
  onOpen,
}: {
  tabId: string;
  imageId: string;
  width?: number;
  height?: number;
  /** 图片文件找不到时不可用（和旁边几个按钮一样） */
  off?: string;
  open: Op | '';
  onOpen: (op: Op | '') => void;
}) {
  const notify = useNotifications();
  const relay = useGeneration().settings.connection === 'relay';
  const [magnitude, setMagnitude] = useState<'1' | '2' | '3' | '4' | '5'>('2');
  const [scale, setScale] = useState<string>('1.5');
  const [est, setEst] = useState<Estimate | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const scaleValue = (s: string): EnhanceScale =>
    s === 'max' ? 'max' : (Number(s) as 1 | 1.5 | 2);
  useEffect(() => {
    if (!open) return;
    let live = true;
    setError('');
    void invokeUI('generate.estimate-op', {
      tabId,
      imageId,
      op: open,
      ...(open === 'enhance'
        ? { magnitude: Number(magnitude) as 1 | 2 | 3 | 4 | 5, scale: scaleValue(scale) }
        : {}),
    })
      .then((r) => {
        if (!live) return;
        setEst(r);
        // 这张图没有选中的档位（例如 2x）时退到能用的最大一档
        const list = (r.scales || []).map(String);
        if (open === 'enhance' && list.length && !list.includes(scale))
          setScale(list.includes('1.5') ? '1.5' : list[list.length - 1]);
      })
      .catch((e) => live && setError((e as Error).message));
    return () => {
      live = false;
    };
  }, [open, tabId, imageId, magnitude, scale]);
  useEffect(() => {
    if (!open) setEst(null);
  }, [open]);
  const go = async () => {
    if (busy || !est || est.unavailable) return;
    setBusy(true);
    try {
      if (open === 'upscale') await invokeUI('generate.upscale', { tabId, imageId });
      else
        await invokeUI('generate.enhance', {
          tabId,
          imageId,
          magnitude: Number(magnitude) as 1 | 2 | 3 | 4 | 5,
          scale: scaleValue(scale),
        });
      onOpen('');
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const price = !est
    ? '…'
    : relay || est.relay
      ? '中转站按张计费'
      : est.free
        ? '免费'
        : `${est.anlas} Anlas`;
  const size = est ? `${est.width} × ${est.height}` : '…';
  const from = width && height ? `${width} × ${height}` : '';
  const button = (op: Op, icon: string, label: string) => (
    <button
      className={`btn quiet sm ${off ? 'is-off' : ''} ${open === op ? 'open' : ''}`}
      data-trigger={`op-${op}`}
      aria-expanded={open === op}
      aria-label={label}
      {...(off
        ? { 'aria-disabled': true, 'data-tip': off, onClick: () => {} }
        : { 'data-tip': label, onClick: () => onOpen(open === op ? '' : op) })}
    >
      <Icon name={icon} />
      <span className="lbl">{label}</span>
    </button>
  );
  const foot = (label: string) => (
    <div className="row op-foot">
      <span className="op-price">
        <b>{price}</b>
        {est?.unavailable ? (
          <span className="help danger">{est.unavailable}</span>
        ) : error ? (
          <span className="help danger">{error}</span>
        ) : null}
      </span>
      <span className="sp" />
      <button
        className={`btn ink sm ${busy ? 'loading' : ''}`}
        disabled={busy || !est || !!est.unavailable}
        onClick={() => void go()}
      >
        {busy && <Icon name="loader-4-line" />}
        {label}
      </button>
    </div>
  );
  return (
    <>
      {button('upscale', 'expand-diagonal-line', '放大')}
      {button('enhance', 'magic-line', '增强')}
      <Pop
        open={open === 'upscale'}
        onClose={() => onOpen('')}
        anchor='[data-trigger="op-upscale"]'
        trigger='[data-trigger="op-upscale"]'
        place="above-left"
        enter="pop-up"
        className="popover op-pop"
        label="放大"
      >
        <div className="op-h">
          <b>放大</b>
          <span className="help">宽高各放大 2 倍，画面不变，结果是新的一版</span>
        </div>
        <div className="op-size">
          {from && <span className="mono muted">{from}</span>}
          {from && <Icon name="arrow-right-line" />}
          <span className="mono">{size}</span>
        </div>
        {foot('放大')}
      </Pop>
      <Pop
        open={open === 'enhance'}
        onClose={() => onOpen('')}
        anchor='[data-trigger="op-enhance"]'
        trigger='[data-trigger="op-enhance"]'
        place="above-left"
        enter="pop-up"
        className="popover op-pop"
        label="增强"
      >
        <div className="op-h">
          <b>增强</b>
          <span className="help">
            用这张图那一版的提示词和参数重新细化一遍，种子随机，结果是新的一版
          </span>
        </div>
        <div className="frow">
          <span className="label">幅度</span>
          <Seg
            label="幅度"
            items={(['1', '2', '3', '4', '5'] as const).map(
              (k, i) => [k, k, MAGNITUDE_TIP[i]] as const,
            )}
            value={magnitude}
            onChange={setMagnitude}
          />
        </div>
        <div className="frow">
          <span className="label">放大</span>
          <Seg
            label="放大"
            items={(est?.scales?.map(String) || [scale]).map(
              (k) => [k, SCALE_NAME[k] || k, SCALE_TIP[k] || ''] as const,
            )}
            value={scale}
            onChange={setScale}
          />
        </div>
        <div className="op-size">
          {from && <span className="mono muted">{from}</span>}
          {from && <Icon name="arrow-right-line" />}
          <span className="mono">{size}</span>
        </div>
        {foot('增强')}
      </Pop>
    </>
  );
}
