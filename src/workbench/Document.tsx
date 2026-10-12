import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Button,
  Input,
  Menu,
  Popover,
  Select,
  Tag,
  Shortcut,
  useScrollArea,
  type MenuItem,
} from '../ui';
import { CATEGORY_OPTIONS } from '../lib/prompt.js';
import {
  copyPromptDocument,
  copyPromptDocumentScope,
  copyVisiblePromptDocument,
  createPromptDocument,
  promptDocumentProject,
  serializePromptSection,
  setPromptBlockType,
  type PromptDocument,
} from '../lib/promptDocument';
import type { ImageProject } from '../shared/types';
import type { WorkbenchTab } from '../state/workbench';
import {
  categoryColors,
  categoryLabel,
  documentTags,
  replaceSection,
  reparseSection,
  scopeLabel,
  type DocumentTag,
} from './model';
import './workbench.css';

export interface DocumentProps {
  project: ImageProject;
  viewState: WorkbenchTab['viewState'];
  onViewStateChange: (value: WorkbenchTab['viewState']) => void;
  onUpdateProject: (project: ImageProject) => void;
  onCopyText: (
    text: string,
    count: number,
    selected: boolean,
    ignored?: number,
    label?: string,
    automaticIgnored?: number,
  ) => void;
  onTranslateTags: (entries: { scopeKey: string; tag: ImageProject['tags'][number] }[]) => void;
  onNotify: (text: string, tone?: string) => void;
  renderTag?: (entry: DocumentTag, content: ReactNode) => ReactNode;
  renderParagraph?: (section: number, block: number, content: ReactNode) => ReactNode;
  renderAdd?: (section: number, block: number) => ReactNode;
  onRawEdit?: (section: number, initial?: string) => void;
  selectedKeys?: string[];
  children?: ReactNode;
  characterActions?: ReactNode;
  sectionActions?: (section: number) => ReactNode;
  sectionEditor?: { section: number; content: ReactNode };
}
export function WorkbenchDocument(p: DocumentProps) {
  const scroll = useRef<HTMLDivElement>(null);
  useScrollArea(scroll);
  const doc = useMemo(() => createPromptDocument(p.project), [p.project]);
  const entries = useMemo(() => documentTags(doc), [doc]);
  const [query, setQuery] = useState('');
  const [polarity, setPolarity] = useState('all');
  const [category, setCategory] = useState('All');
  const [viewOpen, setViewOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [automatic, setAutomatic] = useState<string[]>([]);
  const viewAnchor = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLElement>(null);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k' &&
        root.current?.getClientRects().length
      ) {
        event.preventDefault();
        root.current.querySelector<HTMLInputElement>('[aria-label="搜索 Tag 或译名"]')?.focus();
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const filtered = !!query || polarity !== 'all' || category !== 'All';
  const matches = (entry: DocumentTag) =>
    (category === 'All' || entry.tag.category === category) &&
    (!query ||
      `${entry.tag.tag}\n${entry.tag.translation}`
        .toLocaleLowerCase()
        .includes(query.toLocaleLowerCase()));
  const update = (next: PromptDocument) =>
    p.onUpdateProject({ ...p.project, ...promptDocumentProject(next) } as ImageProject);
  const translate = (list: DocumentTag[]) =>
    p.onTranslateTags(
      list.map((entry) => ({ scopeKey: doc.scopes[entry.section].scope.key, tag: entry.tag })),
    );
  const copy = (text: string, label = '') => p.onCopyText(text, 0, false, 0, label);
  const copyContext = copyVisiblePromptDocument(doc, {
    filters: { query, polarity, category, domain: 'all' },
    expandedScopeKeys: automatic,
    selectedKeys: p.selectedKeys,
  });
  const negativeOnly =
    copyContext.entries.length > 0 &&
    copyContext.entries.every(
      (entry: { scopePolarity: string }) => entry.scopePolarity === 'undesired',
    );
  const copyLabel = negativeOnly
    ? `复制排除内容 · ${copyContext.count}`
    : p.selectedKeys?.length
      ? `复制选中的 · ${copyContext.count}`
      : filtered
        ? `复制可见的 · ${copyContext.count}`
        : '复制 Prompt';
  const negativeText = doc.scopes
    .filter((section) => section.scope.polarity === 'undesired')
    .map(serializePromptSection)
    .filter(Boolean)
    .join('\n');
  const summary = (scopes: typeof doc.scopes, includeAutomatic = false) => {
    const tags = entries.filter(
      (entry) =>
        scopes.includes(doc.scopes[entry.section]) && (includeAutomatic || !entry.automatic),
    ).length;
    const paragraphs = scopes.reduce(
      (sum, section) => sum + section.blocks.filter((block) => block.type === 'paragraph').length,
      0,
    );
    return [tags ? `${tags} 个 Tag` : '', paragraphs ? `${paragraphs} 段` : '']
      .filter(Boolean)
      .join(' · ');
  };
  const automaticCount = entries.filter(
    (entry) => entry.automatic && doc.scopes[entry.section].scope.polarity === 'prompt',
  ).length;
  const copyItems: MenuItem[] = [
    {
      id: 'all',
      label: '复制全部 Prompt',
      trailing: summary(doc.scopes.filter((section) => section.scope.polarity === 'prompt')),
      onSelect: () => copy(copyPromptDocument(doc), '全部 Prompt'),
    },
    ...(automaticCount > 0
      ? [
          {
            id: 'automatic',
            label: `复制全部 Prompt，含 NovelAI 自动加的 ${automaticCount} 个`,
            onSelect: () =>
              copy(copyPromptDocument(doc, { includeAutomatic: true }), '全部 Prompt'),
          },
        ]
      : []),
    {
      id: 'negative',
      label: '复制全部排除内容',
      trailing: summary(
        doc.scopes.filter((section) => section.scope.polarity === 'undesired'),
        true,
      ),
      onSelect: () => copy(negativeText, '排除内容'),
    },
    { id: 'scope-separator', separator: true },
    ...doc.scopes.map((section) => ({
      id: section.scope.key,
      label: `只复制${scopeLabel(section)}`,
      trailing: summary([section]),
      onSelect: () => copy(copyPromptDocumentScope(doc, section.scope.key), scopeLabel(section)),
    })),
  ];
  if (
    p.selectedKeys?.some((key) =>
      entries.some(
        (entry) => entry.key === key && doc.scopes[entry.section].scope.polarity === 'prompt',
      ),
    ) &&
    p.selectedKeys?.some((key) =>
      entries.some(
        (entry) => entry.key === key && doc.scopes[entry.section].scope.polarity === 'undesired',
      ),
    )
  )
    copyItems.splice(1, 0, {
      id: 'selected-negative',
      label: '复制其中的排除内容',
      trailing: `${copyContext.ignored} 个 Tag`,
      onSelect: () => {
        const negativeKeys = entries
          .filter(
            (entry) =>
              doc.scopes[entry.section].scope.polarity === 'undesired' &&
              (p.selectedKeys?.length ? p.selectedKeys.includes(entry.key) : matches(entry)),
          )
          .map((entry) => entry.key);
        copy(copyVisiblePromptDocument(doc, { selectedKeys: negativeKeys }).text, '排除内容');
      },
    });
  const blockMenu = (si: number, bi: number): MenuItem[] => {
    const section = doc.scopes[si];
    const block = section.blocks[bi];
    const replace = (raw: string) => update(replaceSection(doc, si, reparseSection(section, raw)));
    const move = (delta: number) => {
      const target = bi + delta;
      if (target < 0 || target >= section.blocks.length) return;
      const blocks = [...section.blocks];
      [blocks[bi], blocks[target]] = [blocks[target], blocks[bi]];
      replace(
        section.separators[0] +
          blocks.map((item, i) => item.raw + section.separators[i + 1]).join(''),
      );
    };
    return [
      {
        id: 'type',
        label: block.type === 'tags' ? '转为段落' : '转为 Tag 块',
        onSelect: () =>
          update(
            replaceSection(
              doc,
              si,
              setPromptBlockType(section, bi, block.type === 'tags' ? 'paragraph' : 'tags'),
            ),
          ),
      },
      {
        id: 'translate',
        label: '翻译与分类这一块',
        onSelect: () =>
          translate(entries.filter((entry) => entry.section === si && entry.block === bi)),
      },
      { id: 'copy', label: '复制这一块', onSelect: () => copy(block.raw) },
      {
        id: 'up',
        label: '上移',
        shortcut: ['Alt', '↑'],
        disabled: bi === 0,
        onSelect: () => move(-1),
      },
      {
        id: 'down',
        label: '下移',
        shortcut: ['Alt', '↓'],
        disabled: bi === section.blocks.length - 1,
        onSelect: () => move(1),
      },
      { id: 'save', label: '存为常用块', disabled: true },
      {
        id: 'delete',
        label: '删除这一块',
        danger: true,
        onSelect: () => {
          const raw = serializePromptSection(section);
          replace(raw.slice(0, block.range.start) + raw.slice(block.range.end));
        },
      },
    ];
  };
  const drawTag = (entry: DocumentTag) => {
    const tag = entry.tag;
    const language = p.viewState.language;
    const syntax =
      tag.syntax_issue === 'control_only'
        ? '单独的 :: 是结束控制符，不是 Tag，建议删除。'
        : tag.syntax_issue === 'emphasis_closer'
          ? '包含可能多余的 :: 结束符；没有前置强调时相当于普通权重 1。'
          : '';
    const content = (
      <Tag
        text={language === 'translated' && tag.translation ? tag.translation : tag.tag}
        translation={syntax || (language === 'bilingual' ? tag.translation : '')}
        category={categoryColors[tag.category]}
        categoryLabel={categoryLabel(tag.category)}
        weight={tag.weight === 1 ? '' : String(tag.weight)}
        state={
          p.selectedKeys?.includes(entry.key)
            ? 'selected'
            : !matches(entry)
              ? 'filtered'
              : syntax
                ? 'syntax'
                : 'default'
        }
      />
    );
    return (
      <span key={entry.key} data-wb-tag={entry.key}>
        {p.renderTag ? p.renderTag(entry, content) : content}
      </span>
    );
  };
  return (
    <section className="wb-prompt" aria-label="Prompt 文档" ref={root}>
      <div className="wb-prompt-head">
        <strong>Prompt</strong>
        <Input
          size="small"
          aria-label="搜索 Tag 或译名"
          placeholder="搜索 Tag"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          prefix={<i className="ri-search-line" />}
          suffix={<Shortcut keys={['Mod', 'K']} />}
        />
        <Button
          variant="quiet"
          size="small"
          ref={viewAnchor}
          aria-label="显示"
          onClick={() => setViewOpen(!viewOpen)}
        >
          <i className="ri-equalizer-line" />
          <span className="wb-responsive-label">
            显示
            {filtered &&
              ` ${[!!query, polarity !== 'all', category !== 'All'].filter(Boolean).length}`}
          </span>
        </Button>
        <Button variant="quiet" size="small" onClick={() => translate(entries)}>
          AI
        </Button>
      </div>
      <Popover
        label="显示方式"
        open={viewOpen}
        anchor={viewAnchor}
        onClose={() => setViewOpen(false)}
      >
        <div className="wb-view-fields">
          <label>
            语言
            <Select
              label="语言"
              value={p.viewState.language}
              onChange={(language) => p.onViewStateChange({ ...p.viewState, language })}
              options={[
                { value: 'original', label: '原文' },
                { value: 'translated', label: '译文' },
                { value: 'bilingual', label: '对照' },
              ]}
            />
          </label>
          <label>
            排列
            <Select
              label="排列"
              value={p.viewState.viewMode}
              onChange={(viewMode) => p.onViewStateChange({ ...p.viewState, viewMode })}
              options={[
                { value: 'structure', label: '按块' },
                { value: 'category', label: '按分类' },
              ]}
            />
          </label>
          <label>
            只看
            <Select
              label="只看"
              value={polarity}
              onChange={setPolarity}
              options={[
                { value: 'all', label: '全部' },
                { value: 'prompt', label: '正向内容' },
                { value: 'undesired', label: '排除内容' },
              ]}
            />
          </label>
          <label>
            分类
            <Select
              label="分类"
              value={category}
              onChange={setCategory}
              options={['All', ...CATEGORY_OPTIONS].map((value) => ({
                value,
                label: value === 'All' ? '全部' : categoryLabel(value),
              }))}
            />
          </label>
        </div>
      </Popover>
      {filtered && (
        <div className="wb-filters">
          {query && (
            <Button variant="quiet" size="small" onClick={() => setQuery('')}>
              搜索 {query} ×
            </Button>
          )}
          {polarity !== 'all' && (
            <Button variant="quiet" size="small" onClick={() => setPolarity('all')}>
              只看 {polarity === 'prompt' ? '正向内容' : '排除内容'} ×
            </Button>
          )}
          {category !== 'All' && (
            <Button variant="quiet" size="small" onClick={() => setCategory('All')}>
              分类 {categoryLabel(category)} ×
            </Button>
          )}
          <Button
            variant="quiet"
            size="small"
            onClick={() => {
              setQuery('');
              setPolarity('all');
              setCategory('All');
            }}
          >
            清除
          </Button>
          <span className="nps-help wb-filter-note">复制的内容跟着筛选变</span>
        </div>
      )}
      <div className="wb-document-scroll" ref={scroll}>
        {p.viewState.viewMode === 'category' && (
          <p className="nps-help">按分类排列时不能拖动排序</p>
        )}
        {doc.scopes.map((section, si) => {
          if (polarity !== 'all' && section.scope.polarity !== polarity) return null;
          const sectionEntries = entries.filter((entry) => entry.section === si);
          const sectionKey = section.scope.key;
          const visibleEntries = sectionEntries.filter(
            (entry) => !entry.automatic || automatic.includes(sectionKey),
          );
          const hiddenBlocks = section.blocks.filter(
            (block, bi) =>
              filtered &&
              (block.type === 'tags'
                ? !visibleEntries.some((entry) => entry.block === bi && matches(entry))
                : category !== 'All' ||
                  !`${block.content}\n${block.translation || ''}`
                    .toLowerCase()
                    .includes(query.toLowerCase())),
          ).length;
          const renderBlock = (bi: number) => {
            const block = section.blocks[bi];
            const tags = visibleEntries.filter((entry) => entry.block === bi);
            if (
              filtered &&
              (block.type === 'tags'
                ? !tags.some(matches)
                : category !== 'All' ||
                  !`${block.content}\n${block.translation || ''}`
                    .toLowerCase()
                    .includes(query.toLowerCase()))
            )
              return null;
            if (p.viewState.viewMode === 'category' && block.type === 'tags') return null;
            const prose = (
              <div className="wb-prose">
                <p>{block.content}</p>
                {block.translation && <p className="wb-translation">{block.translation}</p>}
              </div>
            );
            return (
              <div key={bi} className="wb-block" data-wb-block={`${si}:${bi}`}>
                <header>
                  <span>
                    {block.type === 'tags'
                      ? `TAG 块${block.label ? ` · ${block.label}` : ''} · ${tags.length} 个`
                      : `段落${block.label ? ` · ${block.label}` : ''}`}
                  </span>
                  <Menu
                    label="这一块的操作"
                    trigger={<i className="ri-more-line" />}
                    items={blockMenu(si, bi)}
                  />
                </header>
                {block.type === 'tags' ? (
                  <div className="wb-tags">
                    {tags.map(drawTag)}
                    {p.renderAdd?.(si, bi)}
                  </div>
                ) : p.renderParagraph ? (
                  p.renderParagraph(si, bi, prose)
                ) : (
                  prose
                )}
                <Button
                  className="wb-add-block"
                  variant="quiet"
                  size="small"
                  onClick={() => {
                    // TODO(design): No empty-block editor is specified; use the existing raw editor at this separator.
                    const raw = serializePromptSection(section);
                    const at = block.range.end;
                    p.onRawEdit?.(si, raw.slice(0, at) + '\n\n' + raw.slice(at));
                  }}
                >
                  在这里加一块
                </Button>
              </div>
            );
          };
          return (
            <section key={sectionKey} className="wb-section" data-wb-scope={sectionKey}>
              <header className="wb-section-head">
                <Button
                  variant="quiet"
                  size="small"
                  aria-expanded={!collapsed.includes(sectionKey)}
                  onClick={() =>
                    setCollapsed(
                      collapsed.includes(sectionKey)
                        ? collapsed.filter((key) => key !== sectionKey)
                        : [...collapsed, sectionKey],
                    )
                  }
                >
                  {scopeLabel(section)}
                </Button>
                <span className="nps-help">
                  {filtered
                    ? `${visibleEntries.filter(matches).length} 个符合，共 ${visibleEntries.length} 个`
                    : `${section.blocks.length} 块`}
                </span>
                <span className="wb-section-actions">
                  {p.sectionActions?.(si)}
                  <Button
                    variant="quiet"
                    size="small"
                    aria-label="复制这一节"
                    onClick={() =>
                      copy(copyPromptDocumentScope(doc, sectionKey), scopeLabel(section))
                    }
                  >
                    <i className="ri-file-copy-line" />
                  </Button>
                  <Menu
                    label="更多"
                    trigger={<i className="ri-more-line" />}
                    items={[
                      { id: 'raw', label: '编辑原始文本', onSelect: () => p.onRawEdit?.(si) },
                      {
                        id: 'translate',
                        label: '全部翻译与分类',
                        onSelect: () => translate(sectionEntries),
                      },
                    ]}
                  />
                </span>
              </header>
              {p.sectionEditor?.section === si
                ? p.sectionEditor.content
                : !collapsed.includes(sectionKey) && (
                    <>
                      {!!sectionEntries.filter((entry) => entry.automatic).length && (
                        <div
                          className="wb-automatic"
                          title="元数据与官方预设模板均匹配；默认复制时会排除这些自动内容。"
                        >
                          {section.scope.automation?.sourceLabel ||
                            `NovelAI 自动添加 · ${section.scope.automation?.tagCount}`}
                          <Button
                            variant="quiet"
                            size="small"
                            onClick={() =>
                              setAutomatic(
                                automatic.includes(sectionKey)
                                  ? automatic.filter((key) => key !== sectionKey)
                                  : [...automatic, sectionKey],
                              )
                            }
                          >
                            {automatic.includes(sectionKey) ? '隐藏' : '显示'}
                          </Button>
                        </div>
                      )}
                      {p.viewState.viewMode === 'category' &&
                        CATEGORY_OPTIONS.map((cat) => {
                          const tags = visibleEntries.filter((entry) => entry.tag.category === cat);
                          return (
                            tags.some(matches) && (
                              <div key={cat} className="wb-block">
                                <header>{categoryLabel(cat)}</header>
                                <div className="wb-tags">{tags.map(drawTag)}</div>
                              </div>
                            )
                          );
                        })}
                      {section.blocks.map((_, bi) => renderBlock(bi))}
                      {!section.blocks.length && p.renderAdd?.(si, -1)}
                      {!!hiddenBlocks && (
                        <p className="nps-help">
                          另外 {hiddenBlocks} 块里没有符合的内容，已经收起。
                        </p>
                      )}
                    </>
                  )}
            </section>
          );
        })}
        {p.characterActions}
      </div>
      {p.children}
      <footer className="wb-copy-bar">
        <Button
          onClick={() =>
            p.onCopyText(
              !filtered && !p.selectedKeys?.length ? copyPromptDocument(doc) : copyContext.text,
              copyContext.count,
              !!p.selectedKeys?.length,
              copyContext.ignored,
              negativeOnly ? '排除 Tag' : '',
              copyContext.automaticIgnored,
            )
          }
        >
          <i className="ri-file-copy-line" />
          {copyLabel}
        </Button>
        <Menu
          label="其他复制方式"
          menuClassName="wb-copy-menu"
          trigger={<i className="ri-arrow-down-s-line" />}
          items={copyItems}
        />
      </footer>
    </section>
  );
}
