// 工作台的舞台（doc/design.md 2.14、2.23）：中间是这一版的图，像放在纸上的照片；点了打开大图。
// 标题行：起了名的写"名称 · 第 3 版"，没起名的只写"第 3 版"（原图写"原图"）；提示词改过以后淡入"已修改"和"恢复"，
// 标题行固定高度，出现消失都不挤动图片。下面一行是尺寸、模型和参数；没起名时再一行"文件"。V4.5 的图另有一行 Vibe。
// 右键图片：作为新作品打开、移入回收站。焦点不在输入框时 ← → 在这一版的图之间切换，到头停住。
import { useEffect, useMemo, useRef, useState } from 'react';
import type { WorkbenchTab } from '../state/workbench';
import type { ImageProject, ImageRecord, Vibe } from '../shared/types';
import type { WorkVersion } from '../shared/generation';
import { hasImageName, imageFileName } from '../lib/imageNaming.js';
import { mediaUrl } from '../lib/imageStage.js';
import { workbenchTabHasChanges } from '../lib/workbenchSession.js';
import { invokeUI } from '../lib/commands';
import { generationParameters, modelDisplayName } from '../library/presentation';
import { useGeneration } from '../state/generation';
import { Icon } from '../kit/controls';
import { ContextMenu, type MenuEntry } from '../kit/menu';
import { Pop } from '../kit/layer';
import { useNotifications } from '../kit/toast';
import { useDecoded, usePresence, useSwap } from '../kit/motion';
import { Viewer } from '../kit/Viewer';
import { markLoaded } from '../kit/alpha';
import { trashNotice } from '../lib/trashNotice';
import { originGone, originMenu, trashImage } from './original';
import { useSharedTrash } from '../shell/SharedTrash';
import { ImageOps } from './ImageOps';
import { Inpaint, rerunInpaint } from './Inpaint';
import { CompareHost, openCompare } from './Compare';
import { BlurImg, nsfwMenu, type BlurImage } from '../kit/blur';
import { useNsfwState } from '../state/blur';

export interface ImageProps {
  tab: WorkbenchTab;
  /** 切换标签页时图片朝新标签页的方向换内容：-1 往左、1 往右 */
  dir?: number;
  onSaveLibrary: () => void;
  onReveal: () => void;
  onCopyImage: (project: ImageProject) => void;
  onDownloadImage: (project: ImageProject) => void;
  onReset: () => void;
  onRevealVibe: (vibe: Vibe) => void;
  /** 1.4：有参考页签时，点 Vibe 小块切到"参考"并高亮这一个（第几个 Vibe） */
  onShowReference?: (index: number) => void;
}
const midEll = (s: string, max: number) =>
  s.length <= max
    ? s
    : `${s.slice(0, Math.ceil((max - 1) * 0.6))}…${s.slice(-Math.floor((max - 1) * 0.4))}`;

export function WorkbenchImage({ tab, dir = 0, ...p }: ImageProps) {
  const notify = useNotifications();
  const generation = useGeneration();
  const image = tab.project as (ImageProject & { vibes?: Vibe[] }) | null;
  const [missing, setMissing] = useState(!!tab.error);
  const [sharedDialog, askShared] = useSharedTrash();
  // 图片文件找不到时，舞台下面这几个按钮不可用并说明原因，不再弹出 ENOENT（用户 10-22：剪贴板打开的图被临时清理删掉了）
  const saveWork = () =>
    // 按钮变成"已存入图片库"就是反馈，不另外通知
    invokeUI('work.save', { tabId: tab.id }).catch((e) =>
      notify({ text: `保存失败：${(e as Error).message}`, tone: 'error' }),
    );
  const lost = (run: () => void) =>
    missing
      ? { 'aria-disabled': true, 'data-tip': '图片文件找不到了', onClick: () => {} }
      : { onClick: run };
  const [version, setVersion] = useState<WorkVersion | null>(null);
  const [members, setMembers] = useState<ImageRecord[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const [menu, setMenu] = useState<[number, number] | null>(null);
  const [vibe, setVibe] = useState<number | null>(null);
  const [op, setOp] = useState<'' | 'upscale' | 'enhance'>('');
  // 局部重绘（1.8.1）：编辑层开在哪张图上
  const [inpaint, setInpaint] = useState<{ id: string; path: string; image: BlurImage } | null>(
    null,
  );
  useEffect(() => setMissing(!!tab.error), [image?.image_path, tab.error]);
  useEffect(() => {
    if (!generation.settings.hasToken) {
      setVersion(null);
      setMembers([]);
      return;
    }
    let live = true;
    void invokeUI('version.list', { tabId: tab.id }).then(async (r) => {
      const v = r.versions.find((x) => x.id === tab.versionId) || r.versions[0];
      if (!v) return;
      const list = await Promise.all(
        v.images
          .filter((i) => !i.deleted)
          .map((i) => invokeUI('library.get', { id: i.projectId }).then((x) => x.project)),
      );
      if (!live) return;
      setVersion(v);
      setMembers(
        (v.parentId ? list : [v.project as unknown as ImageRecord, ...list]).filter(Boolean),
      );
    });
    return () => {
      live = false;
    };
  }, [
    tab.id,
    tab.versionId,
    tab.versionImageId,
    tab.revision,
    generation.jobs,
    refresh,
    generation.settings.hasToken,
  ]);
  useEffect(
    () =>
      window.studio?.onCommandEvent((e) => {
        if (e.type === 'workbench' && e.libraryChanged) setRefresh((n) => n + 1);
      }),
    [],
  );
  const allTrashed =
    !!version?.parentId && version.images.length > 0 && !version.images.some((i) => !i.deleted);
  const stageId = tab.versionImageId || (!version?.parentId ? version?.project.id : '') || '';
  const index = Math.max(
    0,
    members.findIndex((m) => m.id === stageId),
  );
  const show = (i: number) => {
    const m = members[i];
    if (version && m)
      void invokeUI('version.open', { tabId: tab.id, versionId: version.id, imageId: m.id });
  };
  // ← → 在这一版的图之间走（焦点在输入框、菜单、对话框里时不算）
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      const t = e.target as HTMLElement;
      if (
        t.closest?.(
          'input, textarea, [contenteditable="true"], [role="menu"], [role="dialog"], [role="tablist"], .segc, [role="slider"]',
        )
      )
        return;
      if (!members.length || viewer != null) return;
      if (!document.querySelector('.wb-body:not(.leaving)')?.checkVisibility?.()) return;
      const next = Math.max(
        0,
        Math.min(members.length - 1, index + (e.key === 'ArrowLeft' ? -1 : 1)),
      );
      if (next === index) return;
      e.preventDefault();
      show(next);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  const dirty = workbenchTabHasChanges(tab);
  // 停在原图上（不是生成出来的某一张）
  const atOrigin =
    !!version &&
    !version.parentId &&
    !version.isStart &&
    (!tab.versionImageId || tab.versionImageId === version.project.id);
  // 原图移入回收站或从作品里去掉以后（1.5.1），第一行是"起点"，舞台和空白作品一样是虚线框
  const gone = atOrigin && originGone(version);
  // 空白作品还没有图（2.26a）：舞台是按尺寸比例的虚线框，第一行版本是"起点"
  const blank = (!!image && !image.image_path) || gone;
  const blankText = gone
    ? version?.originState === 'trashed'
      ? '原图在回收站'
      : '已去掉原图'
    : '写好提示词后生成第一张';
  const vlabel =
    version?.isStart || originGone(version)
      ? '起点'
      : version?.parentId
        ? `第 ${version.number} 版`
        : '原图';
  const title =
    image && hasImageName(image)
      ? `${image.name} · ${vlabel}`
      : blank && !gone
        ? `空白作品 · ${vlabel}`
        : vlabel;
  const m = image?.metadata;
  // 占位图：和作品一样大的透明图，缩放和真图一样
  const blankSrc = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${m?.width || 832}" height="${m?.height || 1216}"/>`,
  )}`;
  // 换标签页、换版本时新图解码好了再换，不然淡入时图还没画出来，看着像闪一下（用户 10-25）
  const pics = useSwap(
    useDecoded(
      {
        src: image && !missing ? mediaUrl(image.image_path) : '',
        path: image && !missing ? image.image_path : '',
        image,
        key: `${tab.id}:${image?.image_path}:${allTrashed}:${blank}`,
        blank,
      },
      (v) => v.key,
      (v) => v.src,
    ),
    (v) => v.key,
  );
  const enter = dir < 0 ? 'left' : dir > 0 ? 'right' : 'fade';
  // "已修改""恢复"：同一版里改回原样（点了恢复）时淡出；换标签页、换版本时随标题一起直接换，
  // 不让上一个的"已修改"挂在新标题旁边淡出（用户 10-25）
  const dirtyAt = `${tab.id}:${image?.image_path}`;
  const lastDirtyAt = useRef(dirtyAt);
  if (dirty) lastDirtyAt.current = dirtyAt;
  const dirtyPresence = usePresence(dirty);
  const showDirty = dirty || (dirtyPresence.mounted && lastDirtyAt.current === dirtyAt);
  const dirtyLeaving = !dirty && showDirty;
  // 放大、增强（1.8）：有令牌、这一张有版本时才有
  const canOp = !!version && !!stageId && !gone && !blank && !allTrashed;
  const stageNsfw = useNsfwState(image);
  const openInpaint = (id: string) =>
    void invokeUI('library.get', { id })
      .then((r) => r.project && setInpaint({ id, path: r.project.image_path, image: r.project }))
      .catch((e) => notify({ text: (e as Error).message, tone: 'error' }));
  // 局部重绘生成的那一版：舞台下面多"再来一次"和"和修之前对比"
  const repaint =
    version?.operation?.kind === 'inpaint' && version.parentId && version.operation.sourceProjectId
      ? { parentId: version.parentId, sourceId: version.operation.sourceProjectId }
      : null;
  const again = async () => {
    if (!repaint) return;
    try {
      if (!(await rerunInpaint(tab.id, repaint.sourceId))) openInpaint(repaint.sourceId);
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };
  const menuItems: MenuEntry[] =
    version && stageId && !gone
      ? [
          ...(canOp && !missing
            ? ([
                { label: '放大…', icon: 'expand-diagonal-line', onSelect: () => setOp('upscale') },
                { label: '增强…', icon: 'magic-line', onSelect: () => setOp('enhance') },
                { label: '局部重绘…', icon: 'brush-line', onSelect: () => openInpaint(stageId) },
                {
                  label: '用这张做底图',
                  icon: 'image-edit-line',
                  onSelect: () =>
                    void invokeUI('reference.set-base', { tabId: tab.id, imageId: stageId })
                      .then(() => notify({ text: '已设为底图，生成时按底图出图' }))
                      .catch((e) => notify({ text: (e as Error).message, tone: 'error' })),
                },
                'sep',
              ] as MenuEntry[])
            : []),
          // 图片模糊（1.8.3，2.37）
          ...nsfwMenu([stageId], stageNsfw, (text) => notify({ text, tone: 'error' })),
          'sep',
          {
            label: '作为新作品打开',
            onSelect: () =>
              void invokeUI('work.open-from-image', {
                tabId: tab.id,
                versionId: version.id,
                imageId: stageId,
              }).then(() => notify({ text: '已作为新作品打开' })),
          },
          atOrigin
            ? originMenu(version, tab.id, {
                notify,
                refresh: () => setRefresh((n) => n + 1),
                ask: askShared,
                workId: tab.workId,
              })
            : {
                label: '移入回收站',
                danger: true,
                disabled: tab.source.type !== 'library' ? '请先存入图片库' : false,
                onSelect: () =>
                  void trashImage(stageId, tab.workId, {
                    notify,
                    refresh: () => setRefresh((n) => n + 1),
                    ask: askShared,
                  }),
              },
        ]
      : [];
  const vibes = image?.vibes || [];
  const viewerItems = useMemo(
    () =>
      (members.length ? members : image ? [image as unknown as ImageRecord] : []).map((x) => ({
        id: x.id,
        path: x.image_path,
        image: x,
        tab: tab.id,
      })),
    [members, image?.image_path, tab.id],
  );
  return (
    <div className="col stage">
      {(missing || !image) && !gone && (
        <div className="stage-banner">
          <div className="banner warn">
            <Icon name="alert-line" />
            <span>
              这张图片已被移动或删除。提示词还在，可以继续编辑和复制；关闭这个标签页不影响其他标签页。
            </span>
          </div>
        </div>
      )}
      <div className="canvas swap">
        {pics.map(({ key, value, leaving }) =>
          value.blank ? (
            <div key={key} className={`canvas-blank ${leaving ? 'leaving' : ''}`} data-enter="fade">
              <img src={blankSrc} alt="" draggable={false} />
              <span>{blankText}</span>
            </div>
          ) : allTrashed && !leaving ? (
            <div key={key} className="canvas-empty" data-enter="fade">
              <Icon name="delete-bin-line" />
              这一版的图片都在回收站
            </div>
          ) : value.src ? (
            <BlurImg
              key={key}
              image={value.image}
              path={value.path}
              tab={tab.id}
              eye={leaving ? false : 'md'}
              className={`alpha-bg ${leaving ? 'leaving' : ''}`}
              data-enter={enter}
              data-stage=""
              alt="当前图片"
              draggable={false}
              role="button"
              tabIndex={leaving ? -1 : 0}
              onLoad={markLoaded}
              onError={() => setMissing(true)}
              onClick={() => setViewer(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setViewer(index);
              }}
              onContextMenu={(e) => {
                if (!menuItems.length) return;
                e.preventDefault();
                setMenu([e.clientX, e.clientY]);
              }}
            />
          ) : (
            <div key={key} className="canvas-empty" data-enter="fade">
              <Icon name="image-line" />
              无法显示图片
            </div>
          ),
        )}
      </div>
      {image && (
        <>
          <div className="caption">
            <div className="cap-title">
              <b data-tip-overflow={title}>{title}</b>
              {showDirty && (
                <span className={`dirty-tag ${dirtyLeaving ? 'leaving' : ''}`} data-enter="fade">
                  已修改
                </span>
              )}
              <span className="sp" />
              {showDirty && (
                <button
                  className={`btn quiet sm ${dirtyLeaving ? 'leaving' : ''}`}
                  data-enter="fade"
                  data-tip={`恢复成${vlabel}的提示词`}
                  onClick={p.onReset}
                >
                  <Icon name="arrow-go-back-line" />
                  恢复
                </button>
              )}
            </div>
            <span className="meta mono selectable">
              {[
                m?.width && m?.height ? `${m.width} × ${m.height}` : '',
                modelDisplayName(m?.model),
                generationParameters(m || {}),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {!hasImageName(image) && !blank && (
              <span className="meta file" data-tip={imageFileName(image)}>
                文件 <span className="mono selectable">{midEll(imageFileName(image), 56)}</span>
              </span>
            )}
            {vibes.length > 0 && (
              <div className="vibes">
                <span className="muted">Vibe</span>
                {vibes.map((v, i) => (
                  <button
                    key={v.id || i}
                    className={`vibe-chip ${vibe === i ? 'on' : ''}`}
                    data-trigger={`vibe-${i}`}
                    data-tip={`Vibe ${i + 1} · 参考强度 ${Number(v.strength).toFixed(2)} · 信息提取 ${v.information_extracted == null ? '未知' : Number(v.information_extracted).toFixed(2)}`}
                    onClick={() =>
                      p.onShowReference ? p.onShowReference(i) : setVibe(vibe === i ? null : i)
                    }
                  >
                    <span className="vph">
                      <Icon name="image-line" />
                    </span>
                    <span className="mono">{Number(v.strength).toFixed(2)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="stage-acts" hidden={blank}>
            {/* "把这个作品存进图片库"（1.5.6）：作为新作品打开、还没存的写"存为新作品"（原图本来就在图片库里） */}
            {tab.source.type === 'library' && tab.workOrigin && !tab.workSaved ? (
              <button
                className={`btn sm ${missing ? 'is-off' : ''}`}
                data-tip="另起的这个作品存进图片库，关掉标签页也能找回来"
                {...lost(() => void saveWork())}
              >
                存为新作品
              </button>
            ) : tab.source.type === 'library' ? (
              <span className="saved" data-enter="fade">
                <Icon name="check-line" />
                已存入图片库
              </span>
            ) : (
              <button className={`btn sm ${missing ? 'is-off' : ''}`} {...lost(p.onSaveLibrary)}>
                存入图片库
              </button>
            )}
            <button
              className={`btn quiet sm ${missing ? 'is-off' : ''}`}
              aria-label="在文件夹中显示"
              data-tip="在文件夹中显示"
              {...lost(p.onReveal)}
            >
              <Icon name="folder-open-line" />
              <span className="lbl">在文件夹中显示</span>
            </button>
            <button
              className={`btn quiet sm ${missing ? 'is-off' : ''}`}
              aria-label="复制图片"
              data-tip="复制图片"
              {...lost(() => p.onCopyImage(image))}
            >
              <Icon name="file-copy-line" />
              <span className="lbl">复制图片</span>
            </button>
            <button
              className={`btn quiet sm ${missing ? 'is-off' : ''}`}
              aria-label="另存为"
              data-tip="另存为"
              {...lost(() => p.onDownloadImage(image))}
            >
              <Icon name="download-2-line" />
              <span className="lbl">另存为</span>
            </button>
            {canOp && (
              <>
                <span className="stage-sep" />
                <ImageOps
                  tabId={tab.id}
                  imageId={stageId}
                  width={Number(members[index]?.metadata?.width) || undefined}
                  height={Number(members[index]?.metadata?.height) || undefined}
                  off={missing ? '图片文件找不到了' : undefined}
                  open={op}
                  onOpen={setOp}
                />
                <button
                  className={`btn quiet sm ${missing ? 'is-off' : ''}`}
                  data-trigger="op-inpaint"
                  aria-label="局部重绘"
                  {...lost(() => openInpaint(stageId))}
                >
                  <Icon name="brush-line" />
                  <span className="lbl">局部重绘</span>
                </button>
              </>
            )}
            {canOp && repaint && (
              <>
                <span className="stage-sep" />
                <button
                  className="btn quiet sm"
                  aria-label="再来一次"
                  data-tip="同样的框和涂抹，再重绘一次"
                  onClick={() => void again()}
                >
                  <Icon name="repeat-line" />
                  <span className="lbl">再来一次</span>
                </button>
                <button
                  className="btn quiet sm"
                  aria-label="和修之前对比"
                  data-tip="和修之前对比"
                  onClick={() =>
                    openCompare(
                      tab.id,
                      { versionId: repaint.parentId, imageId: repaint.sourceId },
                      { versionId: version!.id, imageId: stageId },
                    )
                  }
                >
                  <Icon name="contrast-2-line" />
                  <span className="lbl">和修之前对比</span>
                </button>
              </>
            )}
          </div>
        </>
      )}
      <ContextMenu at={menu} onClose={() => setMenu(null)} items={menuItems} />
      {sharedDialog}
      <Pop
        open={vibe != null && !!vibes[vibe]}
        onClose={() => setVibe(null)}
        anchor={`[data-trigger="vibe-${vibe}"]`}
        trigger={`[data-trigger="vibe-${vibe}"]`}
        place="above-left"
        enter="pop-up"
        className="popover vibe-pop"
        label="Vibe"
      >
        {vibe != null && vibes[vibe] && (
          <>
            <div className="vp-h">
              <b>Vibe {vibe + 1}</b>
            </div>
            <div className="vibe-img">
              <span className="help">原图里只有编码，没有参考图</span>
            </div>
            <div className="frow">
              <span className="label">参考强度</span>
              <span className="mono">{Number(vibes[vibe].strength).toFixed(2)}</span>
            </div>
            <div className="frow">
              <span className="label">信息提取</span>
              <span>
                {vibes[vibe].information_extracted == null ? (
                  <>
                    未知<span className="help"> · 原图里没有记录</span>
                  </>
                ) : (
                  <span className="mono">
                    {Number(vibes[vibe].information_extracted).toFixed(2)}
                  </span>
                )}
              </span>
            </div>
            <div className="frow">
              <span className="label">编码</span>
              <span className="mono path" data-tip={vibes[vibe].name}>
                {vibes[vibe].name}
              </span>
            </div>
            <div className="row vp-acts">
              <button className="btn quiet sm" onClick={() => p.onRevealVibe(vibes[vibe])}>
                <Icon name="folder-open-line" />
                在文件夹中显示
              </button>
            </div>
          </>
        )}
      </Pop>
      <Inpaint
        open={!!inpaint}
        tabId={tab.id}
        imageId={inpaint?.id || ''}
        path={inpaint?.path || ''}
        image={inpaint?.image}
        onClose={() => setInpaint(null)}
      />
      <CompareHost tabId={tab.id} />
      <Viewer
        open={viewer != null}
        items={viewerItems}
        index={viewer ?? 0}
        onIndex={(i) => {
          setViewer(i);
          show(i);
        }}
        onClose={() => setViewer(null)}
        onCopy={() => image && p.onCopyImage(image)}
        onSaveAs={() => image && p.onDownloadImage(image)}
      />
    </div>
  );
}
