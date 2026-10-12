import { useEffect, useState } from 'react';
import { Checkbox, Dialog, Input } from '../ui';
import { numberedImageNames } from '../lib/imageNaming.js';
import type { LibraryProps } from './types';

export function LibraryRename({
  open,
  p,
  ids,
  currentId,
  initialName = '',
  onClose,
}: {
  open: boolean;
  p: LibraryProps;
  ids: string[];
  currentId?: string;
  initialName?: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [onlyCurrent, setOnlyCurrent] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(initialName);
      setOnlyCurrent(false);
      setBusy(false);
    }
  }, [open, initialName]);
  const targets = onlyCurrent && currentId ? [currentId] : ids;
  const names = numberedImageNames(name, targets.length);
  return (
    <Dialog
      open={open}
      title={`给这 ${targets.length} 张图片起名`}
      cancelLabel="取消"
      confirmLabel="起名"
      confirmDisabled={!name.trim() || busy}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onConfirm={async () => {
        if (busy || !name.trim()) return;
        setBusy(true);
        try {
          if (await p.onRenameMany(targets, name.trim())) onClose();
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="library-rename-description">
        按现在的排列顺序编号。只改软件里显示的名称，图片文件不动。
      </p>
      <label className="library-rename-row">
        <span>名称</span>
        <Input
          aria-label="图片名称"
          value={name}
          disabled={busy}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <div className="library-rename-row">
        <span>结果</span>
        <span className="library-mono library-rename-result">
          {name.trim() ? (targets.length === 1 ? names[0] : `${names[0]} … ${names.at(-1)}`) : ''}
        </span>
      </div>
      {/* TODO(design): 界面稿未展示整摞的单张选项，暂放在结果下方并复用既有 Checkbox。 */}
      {currentId && ids.length > 1 && (
        <label className="library-rename-current">
          <Checkbox
            label="只改这一张"
            checked={onlyCurrent}
            disabled={busy}
            onChange={setOnlyCurrent}
          />
          <span>只改这一张</span>
        </label>
      )}
    </Dialog>
  );
}
