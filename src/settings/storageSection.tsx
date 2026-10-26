import { useEffect, useState } from 'react';
import { Icon } from '../kit/controls';
import { invokeUI } from '../lib/commands';
import { useStorage } from '../state/storage';
import { Col, Expand, Row, SetPage, Swap, bytes, errorText } from './parts';
import { Fail } from './sectionShared';

// ---------- 图片库 ----------
export function Storage({
  onLibraryChange,
  onEmptyTrash,
}: {
  onLibraryChange: () => Promise<unknown>;
  onEmptyTrash: () => Promise<unknown>;
}) {
  const s = useStorage(onLibraryChange);
  const [trash, setTrash] = useState(0);
  const [trashBusy, setTrashBusy] = useState(false);
  const [trashError, setTrashError] = useState('');
  const refresh = async () => {
    const r = await invokeUI('trash.summary', {});
    if (r?.ok) setTrash(r.count);
    else if (r) throw new Error(r.error);
  };
  useEffect(() => {
    void refresh().catch((e) => setTrashError(errorText(e)));
    // 图片库里删除或还原后回到这一页，数字要跟着变
    const onFocus = () => void refresh().catch(() => {});
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);
  const emptyTrash = async () => {
    if (trashBusy) return;
    setTrashBusy(true);
    setTrashError('');
    try {
      await onEmptyTrash();
      await refresh();
    } catch (e) {
      setTrashError(errorText(e));
    } finally {
      setTrashBusy(false);
    }
  };
  const sep = s.database?.directory.includes('\\') ? '\\' : '/';
  const progress = s.progress;
  return (
    <SetPage title="图片库" desc="导入的图片、缩略图和生成的图片都保存在这里。">
      <div className="setcol" data-feature="storage">
        <div>图片存放位置</div>
        <Swap k={s.details?.assetsDirectory || ''} className="path">
          <span className="selectable">{s.details?.assetsDirectory || '正在读取…'}</span>
        </Swap>
        <small>
          {(s.details?.fileCount || 0).toLocaleString('en-US')} 个文件 · 占用{' '}
          {bytes(s.details?.totalBytes || 0)}
        </small>
        <div className="row">
          <button className="btn sm" disabled={!s.details} onClick={() => void s.reveal()}>
            打开文件夹
          </button>
          <button
            className="btn sm"
            disabled={!s.details || s.busy}
            data-tip={s.busy ? '正在移动' : undefined}
            onClick={() => void s.change()}
          >
            更改位置
          </button>
        </div>
        <small>更改位置时会把现有文件移到新位置，复制完成前不会删除原文件。</small>
      </div>
      <Expand open={s.busy || s.moved}>
        <Swap k={s.busy ? 'run' : s.moved ? 'done' : 'none'}>
          {s.busy ? (
            <div className="setcol">
              <div>正在移动到新位置</div>
              <div className="progress ink">
                <i
                  style={{
                    width: `${progress?.total ? (progress.completed / progress.total) * 100 : 0}%`,
                  }}
                />
              </div>
              <small>
                已复制 {progress?.completed || 0} / {progress?.total || 0} 个文件 ·
                移动期间可以继续使用，完成前请勿关闭软件
              </small>
            </div>
          ) : s.moved ? (
            <div className="setcol">
              <div className="banner ok">
                <Icon name="check-line" />
                已移动到新位置，原位置的文件已删除
              </div>
            </div>
          ) : null}
        </Swap>
      </Expand>
      <Fail>{s.error}</Fail>
      <Col
        title="数据库"
        help="收藏集、名称、版本记录、翻译词典和设置都在这里"
        after={
          <div className="row">
            <button
              className="btn sm"
              disabled={!s.database}
              onClick={() => s.database && void s.revealDatabase(s.database.fileName)}
            >
              打开文件夹
            </button>
          </div>
        }
      >
        <div className="path">
          <span className="selectable mono">
            {s.database ? `${s.database.directory}${sep}${s.database.fileName}` : '正在读取…'}
          </span>
        </div>
      </Col>
      {s.backups?.length === 0 && (
        <Row
          title="升级前的备份"
          help="还没有升级前的备份。软件在升级数据格式之前会自动留一份，升级出问题时可以用它恢复。"
        />
      )}
      {s.backups?.map((b) => (
        <Row
          key={b.fileName}
          title="升级前的备份"
          help={`${new Date(b.modifiedAt).toLocaleString()} · ${b.fileName} · ${bytes(b.size)}。升级出问题时可以用它恢复`}
        >
          <button className="btn sm" onClick={() => void s.revealDatabase(b.fileName)}>
            打开所在文件夹
          </button>
        </Row>
      ))}
      <Fail>{s.databaseError}</Fail>
      <Row title="回收站" help={`${trash} 张图片 · 永久删除后无法恢复`}>
        <button
          className={`btn line-danger sm ${trashBusy ? 'loading' : ''}`}
          disabled={!trash || trashBusy}
          data-tip={!trash ? '回收站为空' : undefined}
          onClick={() => void emptyTrash()}
        >
          {trashBusy && <Icon name="loader-4-line" />}
          清空回收站
        </button>
      </Row>
      <Fail>{trashError}</Fail>
    </SetPage>
  );
}
