import { useEffect, useRef, useState } from 'react';
import { Button, Dialog, Input, Menu, MenuItems, Popover, Tag, useNotifications } from '../ui';
import { Collapse, TransitionSurface } from '../ui/transitions';
import { invokeUI } from '../lib/commands';
import { mediaUrl } from '../lib/imageStage.js';
import { categoryColors } from '../workbench/model';
import type { Material } from '../shared/materials';
import type { PromptBlock } from '../lib/promptDocument';
import './materials.css';

export function MaterialContent({
  blocks,
  limit = false,
}: {
  blocks: PromptBlock[];
  limit?: boolean;
}) {
  return (
    <>
      {blocks.map((b, i) => (
        <div key={i}>
          {b.type === 'tags' ? (
            <div className="wb-tags">
              {b.tags.slice(0, limit ? 24 : undefined).map((t, j) => (
                <Tag
                  key={j}
                  text={t.tag}
                  translation={t.translation}
                  weight={t.weight === 1 ? undefined : String(t.weight)}
                  category={categoryColors[t.category]}
                  categoryLabel={t.category}
                  interactive={false}
                />
              ))}
              {limit && b.tags.length > 24 && (
                <span className="nps-help">还有 {b.tags.length - 24} 个</span>
              )}
            </div>
          ) : (
            <div className="wb-prose">
              <p>{b.content}</p>
              {b.translation && <p className="wb-translation">{b.translation}</p>}
            </div>
          )}
        </div>
      ))}
    </>
  );
}
export function MaterialExamples({
  ids,
  onPreview,
  expanded = false,
}: {
  ids: string[];
  onPreview?: (path: string) => void;
  expanded?: boolean;
}) {
  const [images, setImages] = useState<{ id: string; thumbnail: string; image: string }[]>([]);
  useEffect(() => {
    let active = true;
    void Promise.all(
      ids.slice(0, 6).map(async (id) => {
        try {
          const { project } = await invokeUI('library.get', { id });
          return project.deleted_at
            ? null
            : { id, thumbnail: project.thumbnail_path, image: project.image_path };
        } catch {
          return null;
        }
      }),
    ).then((rows) => {
      if (active) setImages(rows.filter((x): x is NonNullable<typeof x> => !!x));
    });
    return () => {
      active = false;
    };
  }, [ids.join(',')]);
  return (
    <span className={`material-examples${expanded ? ' material-examples-expanded' : ''}`}>
      {images.map((x) => (
        <img
          key={x.id}
          src={mediaUrl(x.thumbnail)}
          alt="示例图片"
          onMouseEnter={() => onPreview?.(x.image)}
          onMouseLeave={() => onPreview?.('')}
        />
      ))}
    </span>
  );
}
export function MaterialPicker({
  tabId,
  scope,
  before,
  character = false,
  flush,
  onManage,
}: {
  tabId: string;
  scope?: string;
  before?: number;
  character?: boolean;
  flush?: () => Promise<void>;
  onManage?: () => void;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState(-1);
  const [items, setItems] = useState<Material[]>([]);
  const [peek, setPeek] = useState<Material | null>(null),
    [image, setImage] = useState('');
  const notify = useNotifications();
  const visible = items.filter(
    (x) =>
      x.kind === (character ? 'character' : 'block') &&
      `${x.name} ${x.blocks.map((b) => b.content).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const insert = async (item: Material) => {
    try {
      await flush?.();
      await invokeUI('material.insert', { tabId, id: item.id, scope, before });
      setOpen(false);
      setPeek(null);
      setImage('');
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };
  return (
    <>
      <Button
        size="small"
        variant="quiet"
        ref={anchor}
        aria-label={character ? '从素材添加角色' : '常用块'}
        onClick={async () => {
          try {
            setItems((await invokeUI('material.list', {})).items);
            setQuery('');
            setSelected(-1);
            setOpen(!open);
          } catch (e) {
            notify({ text: (e as Error).message, tone: 'error' });
          }
        }}
      >
        <i className={character ? 'ri-arrow-down-s-line' : 'ri-bookmark-line'} />
        {!character && '常用块'}
      </Button>
      <Popover
        open={open}
        onClose={() => {
          setOpen(false);
          setPeek(null);
          setImage('');
        }}
        anchor={anchor}
        label={character ? '从素材添加角色' : '插入常用块'}
        className={character ? 'nps-menu' : 'material-picker'}
      >
        {character ? (
          <>
            <div className="nps-help library-menu-heading">从素材添加</div>
            <MenuItems
              label="从素材添加角色"
              closeAll={() => setOpen(false)}
              closeLevel={() => setOpen(false)}
              items={[
                ...(visible.length
                  ? visible.map((x) => ({
                      id: x.id,
                      label: x.name,
                      prefix: <i className="ri-user-3-line" />,
                      trailing: `${x.blocks.length} 块`,
                      onSelect: () => void insert(x),
                    }))
                  : [{ id: 'empty', label: '暂无保存的角色', disabled: true }]),
                { id: 'separator', separator: true },
                { id: 'manage', label: '管理角色…', onSelect: onManage },
              ]}
            />
          </>
        ) : (
          <div
            onKeyDown={(e) => {
              if (['ArrowDown', 'ArrowUp'].includes(e.key)) {
                e.preventDefault();
                setSelected(
                  (v) => (v + (e.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length,
                );
              }
              if (e.key === 'Enter' && visible[selected]) {
                e.preventDefault();
                void insert(visible[selected]);
              }
            }}
          >
            <Input
              autoFocus
              aria-label={character ? '搜索角色' : '搜索常用块'}
              placeholder={character ? '搜索角色' : '搜索常用块'}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(-1);
              }}
            />
            <div className="material-insert-list">
              {visible.map((x, i) => (
                <div
                  className={`material-insert-row ${selected === i ? 'on' : ''}`}
                  key={x.id}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => void insert(x)}
                >
                  <div
                    onMouseEnter={() => {
                      setPeek(x);
                      setImage('');
                    }}
                    onMouseLeave={() => setPeek(null)}
                  >
                    <b>{x.name}</b>{' '}
                    <span className="nps-help">
                      {character
                        ? `${x.blocks.length} 块`
                        : x.blocks[0]?.type === 'tags'
                          ? 'Tag 块'
                          : '段落'}{' '}
                      · 用过 {x.uses} 次
                    </span>
                    <div className="material-insert-bottom">
                      <p className="material-preview">
                        {x.blocks.map((b) => b.content).join('\n')}
                      </p>
                      <MaterialExamples
                        ids={x.examples.slice(0, 3)}
                        onPreview={(path) => {
                          setPeek(null);
                          setImage(path);
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {!visible.length && (
              <p className="nps-help">
                {character
                  ? '暂无保存的角色'
                  : query
                    ? '没有找到匹配的常用块'
                    : '暂无常用块。在块的菜单里选“存为常用块”即可添加。'}
              </p>
            )}
            <span className="nps-help">↑ ↓ 选择　Enter 插入</span>
          </div>
        )}
        {(peek || image) && (
          <div className="material-peek">
            {image ? (
              <img src={mediaUrl(image)} alt="示例图片预览" />
            ) : (
              peek && (
                <>
                  <b>{peek.name}</b>
                  <MaterialContent blocks={peek.blocks} limit />
                </>
              )
            )}
          </div>
        )}
      </Popover>
    </>
  );
}

export function MaterialsPage({ initialKind = 'block' }: { initialKind?: string }) {
  const [items, setItems] = useState<Material[]>([]);
  const [vibes, setVibes] = useState<
    { id: string; name: string; sources: { id: string; name: string; thumbnail: string }[] }[]
  >([]);
  const [kind, setKind] = useState('block'),
    [query, setQuery] = useState(''),
    [expanded, setExpanded] = useState('');
  useEffect(() => setKind(initialKind), [initialKind]);
  const [rename, setRename] = useState(''),
    [name, setName] = useState(''),
    [deleting, setDeleting] = useState<Material | null>(null);
  const notify = useNotifications();
  const reload = async () => {
    setItems((await invokeUI('material.list', {})).items);
    setVibes((await invokeUI('material.vibes', {})).items);
  };
  useEffect(() => {
    void reload().catch((e) => notify({ text: e.message, tone: 'error' }));
  }, []);
  const saveName = async () => {
    if (!name.trim()) return;
    try {
      await invokeUI('material.rename', { id: rename, name });
      setRename('');
      await reload();
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };
  const shown = items.filter(
    (x) =>
      x.kind === kind &&
      `${x.name} ${x.blocks.map((b) => b.content).join(' ')}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <main className="library-page materials-page">
      <aside className="library-side">
        {[
          ['block', '常用块', 'ri-stack-line'],
          ['character', '角色', 'ri-user-3-line'],
          ['vibe', 'Vibe', 'ri-palette-line'],
        ].map(([key, label, icon]) => (
          <button
            className={`library-side-item ${key === kind ? 'on' : ''}`}
            aria-label={label}
            key={key}
            onClick={() => {
              setKind(key);
              setQuery('');
              setExpanded('');
            }}
          >
            <i className={icon} />
            <span>{label}</span>
            <span className="library-side-count">
              {key === 'vibe' ? vibes.length : items.filter((x) => x.kind === key).length}
            </span>
          </button>
        ))}
      </aside>
      <section className="library-middle">
        <div className="library-tools">
          <Input
            aria-label="搜索素材"
            prefix={<i className="ri-search-line" />}
            placeholder={`搜索${kind === 'block' ? '常用块' : kind === 'character' ? '角色' : 'Vibe'}的名称或内容`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <TransitionSurface change={kind} className="materials-scroll">
          {kind === 'vibe'
            ? vibes
                .filter((v) => v.name.toLowerCase().includes(query.toLowerCase()))
                .map((v) => (
                  <div className="material-row" key={v.id}>
                    <button
                      className="material-head"
                      onClick={() => setExpanded(expanded === v.id ? '' : v.id)}
                    >
                      <b>{v.name}</b>
                      <span className="nps-help">出自 {v.sources.length} 张图片</span>
                    </button>
                    <Collapse open={expanded === v.id}>
                      <div className="material-body">
                        {/* TODO(design): Imported metadata contains encoded Vibe data, not the original reference image. */}
                        <p className="nps-help">
                          【文案待定：图片中只有 Vibe 编码，无法还原参考图】
                        </p>
                        {v.sources.map((s) => (
                          <div className="material-source" key={s.id}>
                            <img src={mediaUrl(s.thumbnail)} alt="来源图片" />
                            <span>{s.name}</span>
                          </div>
                        ))}
                      </div>
                    </Collapse>
                  </div>
                ))
            : shown.map((x) => (
                <div className="material-row" key={x.id} data-material-id={x.id}>
                  <div
                    className={`material-head ${expanded === x.id ? 'open' : ''}`}
                    role="button"
                    tabIndex={0}
                    aria-expanded={expanded === x.id}
                    onClick={() => setExpanded(expanded === x.id ? '' : x.id)}
                    onKeyDown={(e) => {
                      if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        setExpanded(expanded === x.id ? '' : x.id);
                      }
                    }}
                  >
                    <div className="material-main">
                      <div className="material-title">
                        {rename === x.id ? (
                          <Input
                            autoFocus
                            aria-label="素材名称"
                            value={name}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (e.key === 'Enter') void saveName();
                              if (e.key === 'Escape') setRename('');
                            }}
                            onBlur={() => void saveName()}
                          />
                        ) : (
                          <b>{x.name}</b>
                        )}
                        <span className="material-type">
                          {x.kind === 'character'
                            ? `${x.blocks.length} 块${x.negativeBlocks?.length ? ` · 负面 ${x.negativeBlocks.reduce((n, b) => n + b.tags.length, 0)} 个 Tag` : ''}`
                            : x.blocks[0]?.type === 'tags'
                              ? `Tag 块 · ${x.blocks[0].tags.length} 个`
                              : '段落'}
                        </span>
                      </div>
                      <span className="material-preview">
                        {x.blocks.map((b) => b.content).join('\n')}
                      </span>
                    </div>
                    <MaterialExamples ids={x.examples.slice(0, 3)} />
                    <span className="nps-help">用过 {x.uses} 次</span>
                    <span onClick={(e) => e.stopPropagation()}>
                      <Menu
                        label="素材操作"
                        trigger={<i className="ri-more-2-line" />}
                        items={[
                          {
                            id: 'rename',
                            label: '改名',
                            onSelect: () => {
                              setRename(x.id);
                              setName(x.name);
                            },
                          },
                          {
                            id: 'delete',
                            label: '删除',
                            danger: true,
                            onSelect: () => setDeleting(x),
                          },
                        ]}
                      />
                    </span>
                  </div>
                  <Collapse open={expanded === x.id}>
                    <div className="material-body">
                      <MaterialContent blocks={x.blocks} />
                      {!!x.negativeBlocks?.length && (
                        <>
                          <b>负面提示词</b>
                          <MaterialContent blocks={x.negativeBlocks} />
                        </>
                      )}
                      <span className="nps-help">示例图片</span>
                      <MaterialExamples ids={x.examples} expanded />
                    </div>
                  </Collapse>
                </div>
              ))}
          {!(kind === 'vibe' ? vibes.length : shown.length) && (
            <div className="material-body">
              <h3>暂无{kind === 'block' ? '常用块' : kind === 'character' ? '角色' : 'Vibe'}</h3>
              {kind !== 'vibe' && (
                <p className="nps-help">
                  在工作台中打开{kind === 'block' ? '块' : '角色'}的“更多”菜单，选择“存为
                  {kind === 'block' ? '常用块' : '角色'}”，就可以在这里反复使用。
                </p>
              )}
            </div>
          )}
        </TransitionSurface>
      </section>
      <Dialog
        open={!!deleting}
        title={`删除“${deleting?.name || ''}”？`}
        cancelLabel="取消"
        confirmLabel="删除"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await invokeUI('material.delete', { id: deleting!.id });
            setDeleting(null);
            await reload();
          } catch (e) {
            notify({ text: (e as Error).message, tone: 'error' });
          }
        }}
      >
        <p>已经用过的提示词和图片不变。</p>
      </Dialog>
    </main>
  );
}
