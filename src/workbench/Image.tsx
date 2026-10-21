// 工作台的舞台（doc/design.md 2.14、2.23）：中间是这一版的图，像放在纸上的照片；点了打开大图。
// 标题行：起了名的写"名称 · 第 3 版"，没起名的只写"第 3 版"（原图写"原图"）；提示词改过以后淡入"已修改"和"恢复"，
// 标题行固定高度，出现消失都不挤动图片。下面一行是尺寸、模型和参数；没起名时再一行"文件"。V4.5 的图另有一行 Vibe。
// 右键图片：作为新作品打开、移入回收站。焦点不在输入框时 ← → 在这一版的图之间切换，到头停住。
import { useEffect, useMemo, useState } from 'react';
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
import { useSwap } from '../kit/motion';
import { Viewer } from '../kit/Viewer';

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
  const [version, setVersion] = useState<WorkVersion | null>(null);
  const [members, setMembers] = useState<ImageRecord[]>([]);
  const [refresh, setRefresh] = useState(0);
  const [viewer, setViewer] = useState<number | null>(null);
  const [menu, setMenu] = useState<[number, number] | null>(null);
  const [vibe, setVibe] = useState<number | null>(null);
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
  // 空白作品还没有图（2.26a）：舞台是按尺寸比例的虚线框，第一行版本是"起点"
  const blank = !!image && !image.image_path;
  const vlabel = version?.isStart ? '起点' : version?.parentId ? `第 ${version.number} 版` : '原图';
  const title =
    image && hasImageName(image)
      ? `${image.name} · ${vlabel}`
      : blank
        ? `空白作品 · ${vlabel}`
        : vlabel;
  const m = image?.metadata;
  // 占位图：和作品一样大的透明图，缩放和真图一样
  const blankSrc = `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${m?.width || 832}" height="${m?.height || 1216}"/>`,
  )}`;
  const pics = useSwap(
    {
      src: image && !missing ? mediaUrl(image.image_path) : '',
      key: `${tab.id}:${image?.image_path}:${allTrashed}:${blank}`,
      blank,
    },
    (v) => v.key,
  );
  const enter = dir < 0 ? 'left' : dir > 0 ? 'right' : 'fade';
  const menuItems: MenuEntry[] =
    version && stageId
      ? [
          {
            label: '作为新作品打开',
            onSelect: () =>
              void invokeUI('work.open-from-image', {
                tabId: tab.id,
                versionId: version.id,
                imageId: stageId,
              }).then(() => notify({ text: '已作为新作品打开' })),
          },
          {
            label: '移入回收站',
            danger: true,
            disabled: tab.source.type !== 'library' ? '请先存入图片库' : false,
            onSelect: () =>
              void invokeUI('library.trash', { ids: [stageId] }).then(() => {
                setRefresh((n) => n + 1);
                notify({
                  text: '已移入回收站',
                  action: {
                    label: '撤销',
                    onClick: () =>
                      void invokeUI('library.restore', { ids: [stageId] }).then(() =>
                        setRefresh((n) => n + 1),
                      ),
                  },
                });
              }),
          },
        ]
      : [];
  const vibes = image?.vibes || [];
  const viewerItems = useMemo(
    () =>
      (members.length ? members : image ? [image as unknown as ImageRecord] : []).map((x) => ({
        id: x.id,
        src: mediaUrl(x.image_path),
      })),
    [members, image?.image_path],
  );
  return (
    <div className="col stage">
      {(missing || !image) && (
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
              <span>写好提示词后生成第一张</span>
            </div>
          ) : allTrashed && !leaving ? (
            <div key={key} className="canvas-empty" data-enter="fade">
              <Icon name="delete-bin-line" />
              这一版的图片都在回收站
            </div>
          ) : value.src ? (
            <img
              key={key}
              className={leaving ? 'leaving' : ''}
              data-enter={enter}
              data-stage=""
              src={value.src}
              alt="当前图片"
              draggable={false}
              role="button"
              tabIndex={leaving ? -1 : 0}
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
              {dirty && (
                <span className="dirty-tag" data-enter="fade">
                  已修改
                </span>
              )}
              <span className="sp" />
              {dirty && (
                <button
                  className="btn quiet sm"
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
            {tab.source.type === 'library' ? (
              <span className="saved">
                <Icon name="check-line" />
                已存入图片库
              </span>
            ) : (
              <button className="btn sm" onClick={p.onSaveLibrary}>
                存入图片库
              </button>
            )}
            <button className="btn quiet sm" onClick={p.onReveal}>
              <Icon name="folder-open-line" />
              在文件夹中显示
            </button>
            <button className="btn quiet sm" onClick={() => p.onCopyImage(image)}>
              <Icon name="file-copy-line" />
              复制图片
            </button>
            <button className="btn quiet sm" onClick={() => p.onDownloadImage(image)}>
              <Icon name="download-2-line" />
              另存为
            </button>
          </div>
        </>
      )}
      <ContextMenu at={menu} onClose={() => setMenu(null)} items={menuItems} />
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
