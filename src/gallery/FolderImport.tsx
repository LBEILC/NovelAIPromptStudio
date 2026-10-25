// 导入文件夹（doc/design.md 2.29，1.7.0）：先看清楚再导入。左边一棵文件夹树，每个文件夹一行：勾选、几张、
// 进哪个收藏集（新建还是并进已有的）；下面一段写清楚会新存几张、占多少、多少已经在图片库里、多少从回收站移回。
// 勾掉父文件夹就勾掉它下面所有的；只勾一部分时父文件夹是一横。
import { useMemo, useState } from 'react';
import { CheckMark, CheckRow, Icon } from '../kit/controls';
import { Dialog } from '../kit/dialog';
import { bytes } from '../settings/parts';
import type { FolderScan, FolderScanItem } from '../shared/types';

const sum = (list: FolderScanItem[], f: (x: FolderScanItem) => number) =>
  list.reduce((n, x) => n + f(x), 0);
const n = (v: number) => v.toLocaleString('en-US');

export function FolderImport({
  scan,
  onCancel,
  onImport,
}: {
  scan: FolderScan | null;
  onCancel: () => void;
  onImport: (folderIds: string[], skipNoMetadata: boolean) => void;
}) {
  // 关闭时内容照原样淡出（kit/dialog 保留 children），这里也留住最后一份
  const [last, setLast] = useState(scan);
  if (scan && scan !== last) setLast(scan);
  const s = scan || last;
  const folders = s?.folders || [];
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [skip, setSkip] = useState(false);
  const [seen, setSeen] = useState(s?.sessionId);
  if (s?.sessionId !== seen) {
    setSeen(s?.sessionId);
    setOff(new Set());
    setSkip(false);
  }
  const { depth, kids } = useMemo(() => {
    const depth = new Map<string, number>(),
      kids = new Map<string, string[]>();
    for (const f of folders) {
      depth.set(f.id, f.parentId ? (depth.get(f.parentId) || 0) + 1 : 0);
      if (f.parentId) kids.set(f.parentId, [...(kids.get(f.parentId) || []), f.id]);
    }
    return { depth, kids };
  }, [folders]);
  const below = (id: string): string[] => (kids.get(id) || []).flatMap((k) => [k, ...below(k)]);
  const withImages = (ids: string[]) =>
    ids.filter((id) => folders.find((f) => f.id === id)?.imageCount);
  /** 一行的勾选状态：有图的看自己，没图的中间层看下面 */
  const state = (f: FolderScanItem): 'on' | 'some' | '' => {
    const ids = withImages([f.id, ...below(f.id)]);
    const on = ids.filter((id) => !off.has(id)).length;
    return on === ids.length ? 'on' : on ? 'some' : '';
  };
  const toggle = (f: FolderScanItem) => {
    const ids = [f.id, ...below(f.id)];
    const next = new Set(off);
    if (state(f) === 'on') ids.forEach((id) => next.add(id));
    else ids.forEach((id) => next.delete(id));
    setOff(next);
  };
  const picked = folders.filter((f) => f.imageCount && !off.has(f.id));
  const noMeta = sum(picked, (f) => f.noMetadataCount);
  const fresh = sum(picked, (f) => f.newCount - (skip ? f.newNoMetadataCount : 0));
  const need = sum(picked, (f) => f.newBytes - (skip ? f.newNoMetadataBytes : 0));
  const total = sum(picked, (f) => f.imageCount) - (skip ? noMeta : 0);
  const known = sum(picked, (f) => f.existingCount + f.trashedCount);
  const trashed = sum(picked, (f) => f.trashedCount);
  const repeat = sum(picked, (f) => f.repeatCount);
  const created = new Set(
    picked.filter((f) => !f.collection?.existingId).map((f) => f.collection?.name),
  );
  const merged = new Set(picked.map((f) => f.collection?.existingId).filter(Boolean));
  const full = !!s && need > s.freeBytes;
  const allImages = sum(folders, (f) => f.imageCount);
  const go = () =>
    total &&
    !full &&
    onImport(
      picked.map((f) => f.id),
      skip,
    );
  const parts = (f: FolderScanItem) =>
    [
      f.newCount && `新图 ${n(f.newCount)}`,
      f.existingCount && `已在图片库 ${n(f.existingCount)}`,
      f.trashedCount && `从回收站移回 ${n(f.trashedCount)}`,
      f.repeatCount && `和别的文件夹相同 ${n(f.repeatCount)}`,
      f.noMetadataCount && `没有生成信息 ${n(f.noMetadataCount)}`,
    ].filter(Boolean);
  return (
    <Dialog
      open={!!scan}
      onClose={onCancel}
      label="导入文件夹"
      className="zipdlg fdlg"
      backdropClass="zipback"
    >
      <h3>导入文件夹</h3>
      <p>
        <span className="mono selectable">{s?.root}</span> · {n(allImages)} 张图片 ·{' '}
        {n(folders.filter((f) => f.imageCount).length)} 个文件夹
      </p>
      <div className="row zbar">
        <span className="help">每个装着图片的文件夹建一个收藏集；已有同名收藏集的并进去</span>
        <span className="sp" />
        <button className="btn quiet sm" disabled={!off.size} onClick={() => setOff(new Set())}>
          全选
        </button>
        <button
          className="btn quiet sm"
          disabled={!picked.length}
          onClick={() => setOff(new Set(folders.map((f) => f.id)))}
        >
          全不选
        </button>
      </div>
      <div className="zipwrap">
        <div className="ftree scroll" role="tree" aria-label="文件夹">
          {folders.map((f) => {
            const st = state(f);
            const c = f.collection;
            return (
              <button
                key={f.id}
                role="treeitem"
                aria-checked={st === 'on' ? true : st === 'some' ? 'mixed' : false}
                className={`frow ${st ? '' : 'off'}`}
                style={{ '--depth': depth.get(f.id) || 0 } as React.CSSProperties}
                onClick={() => toggle(f)}
              >
                <CheckMark state={st} />
                <Icon name={f.imageCount ? 'folder-image-line' : 'folder-line'} />
                <span className="fname">
                  <b>{f.parentId ? f.name : f.name || s?.root}</b>
                  {f.imageCount > 0 && <small>{parts(f).join(' · ')}</small>}
                </span>
                {f.imageCount > 0 && <span className="fcount mono">{n(f.imageCount)} 张</span>}
                {c && (
                  <span
                    className={`fcol ${c.existingId ? 'merge' : ''}`}
                    data-tip={
                      c.existingId ? `并进已有的收藏集「${c.name}」` : `新建收藏集「${c.name}」`
                    }
                  >
                    <Icon name={c.existingId ? 'git-merge-line' : 'add-line'} />
                    <span>{c.name}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="fsum">
        {noMeta > 0 && (
          <CheckRow on={skip} onChange={setSkip}>
            跳过没有生成信息的图（{n(noMeta)} 张）
          </CheckRow>
        )}
        <ul>
          <li>
            新存进图片库 {n(fresh)} 张，占 {bytes(need)}
            <span className={full ? 'danger' : 'muted'}>
              {' '}
              · 磁盘剩余 {bytes(s?.freeBytes || 0)}
              {full ? '，空间不够' : ''}
            </span>
          </li>
          {known > 0 && (
            <li>
              {n(known)} 张已经在图片库里，不再存，只加进收藏集
              {trashed > 0 ? `；其中 ${n(trashed)} 张从回收站移回` : ''}
            </li>
          )}
          {repeat > 0 && <li>{n(repeat)} 张在几个文件夹里都有，只存一份，同时进这几个收藏集</li>}
          {picked.length > 0 && (
            <li>
              新建 {created.size} 个收藏集
              {merged.size ? `，并进 ${merged.size} 个已有的收藏集` : ''}
            </li>
          )}
          {!!s?.zipCount && (
            <li className="muted">
              {s.zipCount} 个 ZIP 不会导入，需要的话用"选择图片或 ZIP"单独导入
            </li>
          )}
        </ul>
        <small className="help">
          复制进图片库，不会修改或移动原文件。导入在后台进行，可以随时取消。
        </small>
      </div>
      <div className="acts">
        <button className="btn quiet" onClick={onCancel}>
          取消
        </button>
        <button
          className="btn ink"
          disabled={!total || full}
          data-tip={full ? '磁盘空间不够' : !total ? '没有选中要导入的图' : undefined}
          onClick={go}
        >
          导入 {n(total)} 张
        </button>
      </div>
    </Dialog>
  );
}
