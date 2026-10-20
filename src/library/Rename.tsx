import { useEffect, useState, type RefObject } from 'react';
import { Button, Dialog, Input, Popover } from '../ui';
import { numberedImageNames } from '../lib/imageNaming.js';
import type { LibraryProps } from './types';

export function LibraryRename({
  open,
  p,
  ids,
  currentId,
  initialName = '',
  anchor,
  onClose,
}: {
  open: boolean;
  p: LibraryProps;
  ids: string[];
  currentId?: string;
  initialName?: string;
  anchor?: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setName(initialName);
      setBusy(false);
    }
  }, [open, initialName]);
  const targets = ids;
  const names = numberedImageNames(name, targets.length);
  const hintNames = numberedImageNames(name.trim() || '名称', targets.length);
  const save = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      if (await p.onRenameMany(targets, name.trim())) onClose();
    } finally {
      setBusy(false);
    }
  };
  if (anchor)
    return (
      <Popover
        open={open}
        anchor={anchor}
        onClose={onClose}
        label={`给 ${targets.length} 张图片起名`}
        className="library-batch-name"
      >
        <h6>给 {targets.length} 张图片起名</h6>
        <div className="library-batch-name-row">
          <Input
            size="small"
            aria-label="图片名称"
            placeholder="名称"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void save();
              }
            }}
          />
          <Button
            size="small"
            variant="ink"
            disabled={!name.trim() || busy}
            onClick={() => void save()}
          >
            确定
          </Button>
        </div>
        <span className="library-help">
          {targets.length > 1
            ? `按当前顺序编号：${hintNames[0]}、${hintNames[1]}……`
            : '只有一张，不加编号'}
        </span>
      </Popover>
    );
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
    </Dialog>
  );
}
