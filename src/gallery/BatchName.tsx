// 批量起名（doc/design.md 2.15）：多选后"起名"向上弹出小浮层；输入框获得焦点，下面一行说明怎么编号（随输入变）；
// 只有一张时写"只有一张，不加编号"。回车确定、Esc 取消；完成后通知带"撤销"（撤销由调用方给）。
import { useEffect, useState } from 'react';
import { Pop } from '../kit/layer';
import { numberedImageNames } from '../lib/imageNaming.js';

export function BatchNamePop({
  open,
  onClose,
  count,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  onSubmit: (name: string) => Promise<boolean>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  const t = text.trim(),
    nm = t || '名称';
  const go = async () => {
    if (!t || busy) return;
    setBusy(true);
    try {
      if (await onSubmit(t)) onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Pop
      open={open}
      onClose={onClose}
      anchor='[data-trigger="lbname"]'
      trigger='[data-trigger="lbname"]'
      place="above-left"
      enter="pop-up"
      className="popover lsp lbname"
      label={`给 ${count} 张图片起名`}
    >
      <h6>给 {count} 张图片起名</h6>
      <span className="row lc-new">
        <label className="field sm grow">
          <input
            autoFocus
            value={text}
            placeholder="名称"
            aria-label="名称"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                void go();
              }
            }}
          />
        </label>
        <button className="btn ink sm" disabled={!t || busy} onClick={() => void go()}>
          确定
        </button>
      </span>
      <span className="help">
        {count > 1
          ? `按当前顺序编号：${numberedImageNames(nm, count).slice(0, 2).join('、')}……`
          : '只有一张，不加编号'}
      </span>
    </Pop>
  );
}
