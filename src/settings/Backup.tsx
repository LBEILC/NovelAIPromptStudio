// 备份与恢复（doc/design.md 2.29，1.7.0）：导出成一个 .npsbackup 文件，可以选包含图库；恢复是替换，
// 替换前自动留一份，一直可以撤回到下一次恢复。恢复和撤回完成后主进程会重新载入窗口，
// 载入前在 sessionStorage 记一笔，回来时直接打开这一页（App 里读）。
import { useEffect, useState } from 'react';
import { Icon, Switch } from '../kit/controls';
import { useAsk } from '../kit/dialog';
import { invokeUI } from '../lib/commands';
import type { BackupInfo } from '../shared/types';
import { Col, Expand, Row, SetPage, Swap, bytes, errorText } from './parts';
import { Fail } from './sectionShared';

export const AFTER_RESTORE = 'nps.after-restore';
const n = (v: number) => v.toLocaleString('en-US');
const when = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
type Progress = { op: 'export' | 'restore'; done: number; total: number };
type Status = Awaited<ReturnType<typeof invokeUI<'backup.status'>>>['lastRestore'];

export function Backup() {
  const [dialog, ask] = useAsk();
  const [estimate, setEstimate] = useState<{
    dataBytes: number;
    libraryBytes: number;
    libraryFiles: number;
  } | null>(null);
  const [withLibrary, setWithLibrary] = useState(false);
  const [busy, setBusy] = useState<'' | 'export' | 'restore' | 'undo' | 'pick'>('');
  const [progress, setProgress] = useState<Progress | null>(null);
  const [exported, setExported] = useState<{ path: string; bytes: number } | null>(null);
  const [picked, setPicked] = useState<BackupInfo | null>(null);
  const [last, setLast] = useState<Status>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void invokeUI('backup.estimate', {})
      .then((r) => r.ok && setEstimate(r))
      .catch(() => {});
    void invokeUI('backup.status', {})
      .then((r) => setLast(r.lastRestore))
      .catch(() => {});
    return window.studio?.onCommandEvent((e) => {
      const ev = e as { type: string; topic?: string; data?: Progress };
      if (ev.type === 'progress' && String(ev.topic).startsWith('backup') && ev.data)
        setProgress(ev.data);
    });
  }, []);
  const run = async (kind: typeof busy, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(kind);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
      setProgress(null);
    }
  };
  const exportNow = () =>
    run('export', async () => {
      setExported(null);
      const r = await invokeUI('backup.export', { includeLibrary: withLibrary });
      if (!('ok' in r)) return;
      if (!r.ok) throw new Error(r.error);
      setExported({ path: r.path, bytes: r.bytes });
    });
  const pick = () =>
    run('pick', async () => {
      const r = await invokeUI('backup.inspect', {});
      if (!('ok' in r)) return;
      if (!r.ok) throw new Error(r.error);
      setPicked(r);
    });
  const restore = () =>
    picked &&
    run('restore', async () => {
      sessionStorage.setItem(AFTER_RESTORE, '1');
      const r = await invokeUI('backup.restore', { path: picked.path });
      if (!r.ok) {
        sessionStorage.removeItem(AFTER_RESTORE);
        throw new Error(r.error);
      }
      // 成功后窗口会重新载入；万一没有，也把页面更新到"已恢复"
      setPicked(null);
      void invokeUI('backup.status', {}).then((s) => setLast(s.lastRestore));
    });
  const undo = async () => {
    if (
      !(await ask({
        title: '撤回这次恢复？',
        body: '回到恢复备份之前的数据：图片库记录、作品、收藏集、词典、标签页和设置。恢复之后新做的改动会丢掉。',
        ok: '撤回',
      }))
    )
      return;
    void run('undo', async () => {
      sessionStorage.setItem(AFTER_RESTORE, '1');
      const r = await invokeUI('backup.undo', {});
      if (!r.ok) {
        sessionStorage.removeItem(AFTER_RESTORE);
        throw new Error(r.error);
      }
      setLast(null);
    });
  };
  const pct = progress?.total ? (progress.done / progress.total) * 100 : 0;
  const size = estimate ? estimate.dataBytes + (withLibrary ? estimate.libraryBytes : 0) : 0;
  return (
    <SetPage
      title="备份与恢复"
      desc="把提示词、版本、收藏集、词典和设置存成一个文件。换电脑或重装系统时，用它恢复。"
    >
      <Expand open={!!last}>
        {last && (
          <div className="setcol">
            <div className="banner ok bk-done">
              <Icon name="check-line" />
              <span>
                已恢复 {last.fileName}（备份于 {when(last.createdAt)}）
                {last.missingImages
                  ? `。${n(last.missingImages)} 张图片在这台电脑上没找到，图片库里显示为"图片缺失"`
                  : ''}
              </span>
              <span className="sp" />
              <button
                className={`btn sm ${busy === 'undo' ? 'loading' : ''}`}
                disabled={!!busy}
                onClick={() => void undo()}
              >
                {busy === 'undo' && <Icon name="loader-4-line" />}
                撤回这次恢复
              </button>
            </div>
          </div>
        )}
      </Expand>
      <h2>导出备份</h2>
      <Row
        title="包含图库"
        help={
          estimate
            ? [
                `连图片文件一起打包：${n(estimate.libraryFiles)} 个文件，约 ${bytes(estimate.libraryBytes)}。换电脑请选包含图库。`,
                `不包含时只有约 ${bytes(estimate.dataBytes)}，恢复时按内容在图片存放位置里找图。`,
              ]
            : '连图片文件一起打包。换电脑请选包含图库。'
        }
      >
        <Switch label="包含图库" on={withLibrary} onChange={setWithLibrary} />
      </Row>
      <Col
        feature="backup"
        title="导出"
        help="持久令牌、中转站 Key、AI 服务的 API Key 和 ChatGPT 登录不会放进备份（它们用这台电脑的系统加密保存，换电脑也解不开），恢复后要重新填。"
        after={
          <div className="row">
            <button
              className={`btn ink sm ${busy === 'export' ? 'loading' : ''}`}
              disabled={!!busy}
              onClick={() => void exportNow()}
            >
              {busy === 'export' && <Icon name="loader-4-line" />}
              导出备份…
            </button>
            {estimate && <span className="help">约 {bytes(size)}</span>}
          </div>
        }
      />
      <Expand open={busy === 'export' || !!exported}>
        <Swap k={busy === 'export' ? 'run' : exported ? `done-${exported.path}` : ''}>
          {busy === 'export' ? (
            <BackupProgress label="正在导出" pct={pct} p={progress} />
          ) : exported ? (
            <div className="setcol">
              <div className="banner ok">
                <Icon name="check-line" />
                <span className="selectable">
                  已导出 {bytes(exported.bytes)} · {exported.path}
                </span>
                <span className="sp" />
                <button
                  className="btn sm"
                  onClick={() => void invokeUI('file.reveal', { path: exported.path })}
                >
                  打开所在文件夹
                </button>
              </div>
            </div>
          ) : null}
        </Swap>
      </Expand>
      <h2>从备份恢复</h2>
      <Col
        title="恢复"
        help={[
          '恢复会替换现在的数据：图片库记录、作品和版本、收藏集、词典、打开的标签页和设置。不会合并。',
          '替换前自动留一份现在的数据，下一次恢复之前都可以撤回。图片文件一个都不会删除。',
        ]}
        after={
          <div className="row">
            <button
              className={`btn sm ${busy === 'pick' ? 'loading' : ''}`}
              disabled={!!busy}
              onClick={() => void pick()}
            >
              {busy === 'pick' && <Icon name="loader-4-line" />}
              选择备份文件…
            </button>
          </div>
        }
      />
      <Expand open={!!picked}>
        <Swap k={picked ? `${picked.path}-${busy === 'restore'}` : ''}>
          {picked ? (
            busy === 'restore' ? (
              <BackupProgress label="正在恢复" pct={pct} p={progress} cancel={false} />
            ) : (
              <div className="setcol bk-card">
                <div className="bk-name">
                  <Icon name="archive-line" />
                  <b className="selectable">{picked.fileName}</b>
                  <span className="help">{bytes(picked.bytes)}</span>
                </div>
                <small>
                  备份于 {when(picked.createdAt)} · 来自 {picked.appVersion} 版 ·{' '}
                  {picked.includesLibrary ? '包含图库' : '不含图库'}
                </small>
                <small>
                  {n(picked.counts.images)} 张图片 · {n(picked.counts.works)} 个作品 ·{' '}
                  {n(picked.counts.collections)} 个收藏集 · {n(picked.counts.dictionary)} 条词典 ·{' '}
                  {n(picked.counts.materials)} 个素材
                </small>
                {!picked.compatible ? (
                  <div className="banner danger">
                    <Icon name="error-warning-line" />
                    <span>{picked.reason || '不能用这个备份恢复'}</span>
                  </div>
                ) : (
                  !picked.includesLibrary && (
                    <div className="banner info">
                      <Icon name="information-line" />
                      <span>
                        这个备份不含图库：会按内容在图片存放位置里找图，找不到的显示为"图片缺失"。
                      </span>
                    </div>
                  )
                )}
                <div className="row">
                  <button
                    className="btn ink sm"
                    disabled={!picked.compatible || !!busy}
                    onClick={() => void restore()}
                  >
                    用这个备份替换现在的数据
                  </button>
                  <button className="btn quiet sm" onClick={() => setPicked(null)}>
                    取消
                  </button>
                </div>
              </div>
            )
          ) : null}
        </Swap>
      </Expand>
      <Fail>{error}</Fail>
      {dialog}
    </SetPage>
  );
}

function BackupProgress({
  label,
  pct,
  p,
  cancel = true,
}: {
  label: string;
  pct: number;
  p: Progress | null;
  /** 恢复到一半不能停（会留下一半新一半旧的数据），只有导出可以取消 */
  cancel?: boolean;
}) {
  return (
    <div className="setcol">
      <div className="row">
        <div>{label}</div>
        <span className="sp" />
        {cancel && (
          <button className="btn quiet sm" onClick={() => void invokeUI('backup.cancel', {})}>
            取消
          </button>
        )}
      </div>
      <div className={`progress ink ${p?.total ? '' : 'indet'}`}>
        <i style={p?.total ? { width: `${pct}%` } : undefined} />
      </div>
      <small>
        {p?.total ? `${bytes(p.done)} / ${bytes(p.total)}` : '正在准备'} · 完成前请勿关闭软件
      </small>
    </div>
  );
}
