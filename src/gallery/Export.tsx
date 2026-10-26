// 导出图片分享（doc/design.md 2.39，1.8.4）：多选、一组或整个收藏集导出成 ZIP 或文件夹。导出的是图片库里的原文件，
// 提示词和参数都在图里，对方拖进本软件或别的能读元数据的工具就能看到；不附带软件自己的数据，图片模糊不影响导出。
// 对话框只问格式；"导出…"打开系统的保存对话框，选好位置开始写以后对话框关掉，进度在底部（和导入一样），可以取消。
// 完成后通知"已导出 N 张"，带"打开所在位置"。
import { useEffect, useRef, useState } from 'react';
import { Icon, Seg } from '../kit/controls';
import { Dialog } from '../kit/dialog';
import { useNotifications } from '../kit/toast';
import { invokeUI } from '../lib/commands';
import { bytes, errorText } from '../settings/parts';

/** 导出什么：界面展开好的图片 ID，或者一个收藏集（主进程按规则查） */
export type ExportSource =
  | { ids: string[]; collectionId?: undefined; label?: string }
  | { collectionId: string; ids?: undefined; label: string };
type Format = 'zip' | 'folder';
type Est = { count: number; bytes: number; name: string };

const FORMAT_KEY = 'novelai-prompt-studio.export-format.v1';
const readFormat = (): Format => {
  try {
    return localStorage.getItem(FORMAT_KEY) === 'folder' ? 'folder' : 'zip';
  } catch {
    return 'zip';
  }
};
const n = (v: number) => v.toLocaleString('en-US');

export function useExport() {
  const notify = useNotifications();
  const [source, setSource] = useState<ExportSource | null>(null);
  const [open, setOpen] = useState(false);
  const [est, setEst] = useState<Est | null>(null);
  const [error, setError] = useState('');
  const [format, setFormat] = useState<Format>(readFormat);
  const [waiting, setWaiting] = useState(false);
  const [job, setJob] = useState<{ done: number; total: number } | null>(null);
  const running = useRef(false);
  // 写到哪一步了：run 是异步的，读最新的值
  const started = useRef(false);
  const shown = useRef(open);
  shown.current = open;

  // 开始写以后（第一次有进度）对话框关掉，进度交给底部
  useEffect(
    () =>
      window.studio?.onCommandEvent((e) => {
        const ev = e as { type: string; topic?: string; data?: { done: number; total: number } };
        if (ev.type !== 'progress' || ev.topic !== 'library.export-progress' || !ev.data) return;
        if (!running.current) return;
        started.current = true;
        setOpen(false);
        setJob(ev.data);
      }),
    [],
  );

  const start = (s: ExportSource) => {
    if (running.current) return notify({ text: '正在导出图片，完成后再导出别的', tone: 'info' });
    setSource(s);
    setEst(null);
    setError('');
    setOpen(true);
    const input = s.collectionId ? { collectionId: s.collectionId } : { ids: s.ids };
    void invokeUI('library.export.estimate', input).then(
      (r) => (r.ok ? setEst(r) : setError(r.error)),
      (e) => setError(errorText(e)),
    );
  };

  const run = async () => {
    if (!source || !est?.count || running.current) return;
    running.current = true;
    started.current = false;
    setWaiting(true);
    setError('');
    try {
      localStorage.setItem(FORMAT_KEY, format);
    } catch {
      /* 记不住格式不影响导出 */
    }
    const input = source.collectionId
      ? { collectionId: source.collectionId, format }
      : { ids: source.ids, format };
    try {
      const r = await invokeUI('library.export', input);
      if ('canceled' in r) {
        // 保存对话框里点了取消：留在这个对话框；写到一半取消的，说一声
        if (started.current) notify({ text: '已取消导出', tone: 'info' });
        return;
      }
      if (!r.ok) throw new Error(r.error);
      setOpen(false);
      notify({
        text: r.skipped
          ? `已导出 ${n(r.count)} 张，${n(r.skipped)} 张找不到原文件，已跳过`
          : `已导出 ${n(r.count)} 张`,
        tone: 'success',
        duration: 6000,
        action: {
          label: '打开所在位置',
          onClick: () => void invokeUI('file.reveal', { path: r.path }),
        },
      });
    } catch (e) {
      // 还没开始写（比如空间不够）就写在对话框里，写到一半出错发通知
      if (shown.current && !started.current) setError(errorText(e));
      else notify({ text: `导出失败：${errorText(e)}`, tone: 'error' });
    } finally {
      running.current = false;
      setWaiting(false);
      setJob(null);
    }
  };

  const title = !est
    ? '导出图片'
    : source?.collectionId
      ? `导出收藏集「${source.label}」· ${n(est.count)} 张`
      : source?.label
        ? `导出「${source.label}」· ${n(est.count)} 张`
        : `导出 ${n(est.count)} 张图片`;
  const dialog = (
    <Dialog
      open={open}
      onClose={() => !waiting && setOpen(false)}
      sticky={waiting}
      label="导出图片"
      className="export-dlg"
      data={{ 'data-export-dialog': '' }}
    >
      <h3>{title}</h3>
      <p>
        导出的是原图，提示词和参数会一起带走。对方把图拖进本软件，或者别的能读 NovelAI
        图片信息的工具，就能看到。
      </p>
      <div className="export-row">
        <span>格式</span>
        <Seg
          label="导出格式"
          items={[
            ['zip', 'ZIP 压缩包'],
            ['folder', '文件夹'],
          ]}
          value={format}
          onChange={setFormat}
        />
      </div>
      <small className="help">
        {format === 'zip'
          ? '一个文件，方便发给别人'
          : `在选的位置新建「${est?.name || '…'}」文件夹，图片放在里面`}
        {est ? ` · 约 ${bytes(est.bytes)}` : ''}
      </small>
      {error && (
        <div className="banner danger">
          <Icon name="error-warning-line" />
          <span className="selectable">{error}</span>
        </div>
      )}
      {est && !est.count && !error && (
        <div className="banner">
          <Icon name="information-line" />
          <span>没有可以导出的图片：回收站里的图不导出</span>
        </div>
      )}
      <div className="acts">
        <button className="btn" disabled={waiting} onClick={() => setOpen(false)}>
          取消
        </button>
        <button
          className={`btn ink ${waiting ? 'loading' : ''}`}
          disabled={!est?.count || waiting}
          onClick={() => void run()}
        >
          {waiting && <Icon name="loader-4-line" />}
          导出…
        </button>
      </div>
    </Dialog>
  );
  return {
    start,
    dialog,
    job,
    cancel: () => void invokeUI('library.export.cancel', {}),
  };
}
