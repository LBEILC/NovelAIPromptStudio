import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatchToolbar, GalleryCardHoverPreview, GalleryCardView, GalleryFilterControl, GalleryGroupingControl, nextGalleryRenderCount } from './GalleryPage.jsx';

vi.mock('@lobehub/ui', () => {
  const Component = () => null;
  return {
    Accordion: Component,
    AccordionItem: Component,
    ActionIcon: Component,
    DatePicker: Component,
    DraggablePanel: Object.assign(Component, { Body: Component }),
    Empty: Component,
    Highlighter: Component,
    Popover: Component,
    PopoverGroup: Component,
    SearchBar: Component,
  };
});

vi.mock('@lobehub/ui/base-ui', () => {
  const Component = () => null;
  return {
    Button: Component,
    Input: Component,
    Segmented: Component,
    Select: Component,
    Slider: Component,
    Switch: Component,
    SplitButton: Object.assign(Component, { Main: Component, Menu: Component }),
  };
});

function toolbarActions(view, callbacks) {
  const toolbar = BatchToolbar({
    view,
    selectedGroups: 2,
    selectedImages: 3,
    onTrash: vi.fn(),
    onRestore: vi.fn(),
    onPermanentDelete: vi.fn(),
    onClear: vi.fn(),
    ...callbacks,
  });

  return {
    batch: toolbar.props.children[1].props.children,
    clear: toolbar.props.children[2],
  };
}

describe('BatchToolbar', () => {
  it('does not pass the click event as explicit ids when moving a selection to trash', () => {
    const onTrash = vi.fn();
    const { batch } = toolbarActions('all', { onTrash });

    batch[0].props.onClick({ type: 'click' });

    expect(onTrash).toHaveBeenCalledWith();
  });

  it('does not pass the click event to trash selection actions', () => {
    const onRestore = vi.fn();
    const onPermanentDelete = vi.fn();
    const { batch } = toolbarActions('trash', { onRestore, onPermanentDelete });

    batch[0].props.onClick({ type: 'click' });
    batch[1].props.onClick({ type: 'click' });

    expect(onRestore).toHaveBeenCalledWith();
    expect(onPermanentDelete).toHaveBeenCalledWith();
  });
});

describe('GalleryGroupingControl', () => {
  it('keeps advanced controls inside a click popover and exposes the current combined state', () => {
    const onChange = vi.fn();
    const element = GalleryGroupingControl({
      grouping: { promptScope: 'similar', mergeVibes: true, similarityThreshold: 80 },
      onChange,
    });
    const contentChildren = element.props.content.props.children.flat(Infinity).filter(Boolean);
    const options = contentChildren.find((child) => child.props?.role === 'radiogroup');
    const similarity = contentChildren.find((child) => child.props?.className === 'gallery-similarity-control');
    const vibe = contentChildren.find((child) => child.props?.className === 'gallery-grouping-vibe-row');

    expect(element.props.trigger).toBe('click');
    expect(element.props.children.props['aria-label']).toContain('相似 80% · 跨 Vibe');
    expect(options.props.children).toHaveLength(4);
    expect(similarity).toBeTruthy();
    expect(vibe).toBeTruthy();

    options.props.children[2].props.onClick();
    similarity.props.children[1].props.onChangeComplete(90);
    vibe.props.children[1].props.onChange(false);
    expect(onChange.mock.calls).toEqual([
      [{ promptScope: 'base' }],
      [{ similarityThreshold: 90 }],
      [{ mergeVibes: false }],
    ]);
  });

  it('does not expose the similarity slider outside similar mode', () => {
    const element = GalleryGroupingControl({
      grouping: { promptScope: 'full', mergeVibes: false, similarityThreshold: 85 },
      onChange: vi.fn(),
    });
    const content = element.props.content.props.children.flat(Infinity).filter(Boolean);
    expect(content.some((child) => child.props?.className === 'gallery-similarity-control')).toBe(false);
  });
});

describe('GalleryFilterControl', () => {
  it('keeps combined filters in a progressive popover and emits field patches', () => {
    const onChange = vi.fn();
    const element = GalleryFilterControl({
      filters: {
        query: 'bagpipe',
        includeTags: ['bagpipe'],
        excludeTags: [],
        tagMatch: 'all',
        models: ['nai-v4.5'],
        vibes: [],
        datePreset: 'custom',
        dateFrom: '2026-08-01',
        dateTo: '2026-08-20',
      },
      options: {
        tags: [{ value: 'bagpipe', label: 'bagpipe · 风笛', count: 8 }],
        models: [{ value: 'nai-v4.5', label: 'nai-v4.5', count: 12 }],
        vibes: [],
      },
      onChange,
    });
    const panel = element.props.content;
    const children = panel.props.children.flat(Infinity).filter(Boolean);
    const includeSection = children.find((child) => child.props?.className === 'gallery-filter-section');
    const dateSection = children.filter((child) => child.props?.className === 'gallery-filter-section').at(-1);
    const clearButton = children.find((child) => child.type === 'header').props.children[1];

    expect(element.props.trigger).toBe('click');
    expect(element.props.children.props['aria-label']).toContain('已启用 3 项');
    expect(element.props.children.props['aria-pressed']).toBe(true);
    includeSection.props.children[1].props.onChange(['bagpipe', 'uniform']);
    expect(includeSection.props.children[1].props.mode).toBe('multiple');
    dateSection.props.children[1].props.onChange('30d');
    const datePickers = dateSection.props.children[2].props.children;
    datePickers[0].props.children[1].props.onChange(null, '2026-08-03');
    clearButton.props.onClick();

    expect(onChange.mock.calls).toEqual([
      [{ includeTags: ['bagpipe', 'uniform'] }],
      [{ datePreset: '30d' }],
      [{ dateFrom: '2026-08-03' }],
      [expect.objectContaining({ query: 'bagpipe', includeTags: [], models: [], datePreset: 'all' })],
    ]);
  });
});

describe('progressive gallery rendering', () => {
  it('caps the initial render and adds bounded idle batches', () => {
    expect(nextGalleryRenderCount(12)).toBe(12);
    expect(nextGalleryRenderCount(200)).toBe(30);
    expect(nextGalleryRenderCount(200, 30)).toBe(54);
    expect(nextGalleryRenderCount(53, 30)).toBe(53);
  });

});

describe('GalleryCardHoverPreview', () => {
  it('uses the thumbnail and keeps the preview focused on visual metadata', () => {
    const cover = {
      created_at: '2026-08-18T00:00:00.000Z',
      id: 'cover',
      image_path: 'C:\\gallery\\original.png',
      metadata: { height: 1216, width: 832 },
      name: 'unused generated filename',
      prompt_structure: { base_undesired_tags: [], characters: [] },
      tags: [{ id: 'one', tag: '1girl' }, { id: 'two', tag: 'outdoors' }],
      thumbnail_path: 'C:\\gallery\\thumbnail.webp',
    };
    const html = renderToStaticMarkup(<GalleryCardHoverPreview group={{
      count: 2,
      cover,
      members: [cover],
    }}/>);

    expect(html).toContain('thumbnail.webp');
    expect(html).toContain('832 × 1216 · 2 Tags');
    expect(html).toContain('1 / 2');
    expect(html).not.toContain('unused generated filename');
  });

  it('renders the currently scrubbed group member and its position', () => {
    const cover = {
      created_at: '2026-08-18T00:00:00.000Z',
      id: 'cover',
      image_path: 'C:\\gallery\\cover.png',
      metadata: { height: 1216, width: 832 },
      name: 'cover',
      prompt_structure: { base_undesired_tags: [], characters: [] },
      tags: [],
    };
    const variant = {
      ...cover,
      id: 'variant',
      image_path: 'C:\\gallery\\variant.png',
      metadata: { height: 832, width: 1216 },
      name: 'variant',
    };
    const html = renderToStaticMarkup(<GalleryCardHoverPreview
      group={{ count: 2, cover, members: [cover, variant] }}
      project={variant}
    />);

    expect(html).toContain('variant.png');
    expect(html).toContain('1216 × 832');
    expect(html).toContain('2 / 2');
  });

  it('keeps the visual-only hover layer transparent to pointer hit testing', () => {
    const element = GalleryCardView({
      active: false,
      group: {
        count: 1,
        cover: {
          id: 'cover',
          image_path: 'C:\\gallery\\original.png',
          metadata: {},
          name: 'cover',
          prompt_structure: { base_undesired_tags: [], characters: [] },
          tags: [],
        },
        members: [],
      },
      onContextMenu: vi.fn(),
      onPreview: vi.fn(),
      onSelect: vi.fn(),
      selected: false,
    });

    expect(element.props.styles).toEqual({ root: { pointerEvents: 'none' } });
  });

  it('keeps filenames out of the permanent card layout and exposes the scrubbed name as a hover label', () => {
    const cover = {
      id: 'cover',
      image_path: 'C:\\gallery\\cover.png',
      metadata: {},
      name: 'cover.png',
      prompt_structure: { base_undesired_tags: [], characters: [] },
      tags: [],
    };
    const variant = { ...cover, id: 'variant', image_path: 'C:\\gallery\\variant.png', name: 'variant.png' };
    const element = GalleryCardView({
      active: false,
      group: { count: 2, cover, members: [cover, variant] },
      hoverProject: variant,
      onContextMenu: vi.fn(),
      onPreview: vi.fn(),
      onSelect: vi.fn(),
      selected: false,
    });
    const mainButton = element.props.children.props.children[0];
    const imageChildren = mainButton.props.children.props.children.flat(Infinity).filter(Boolean);
    const hoverName = imageChildren.find((child) => child.props?.className === 'gallery-card-hover-name');
    const stackImage = imageChildren.find((child) => child.props?.className === 'gallery-card-stack gallery-card-stack-1');

    expect(mainButton.props['aria-label']).toContain('cover.png');
    expect(hoverName.props.children).toBe('variant.png');
    expect(hoverName.props['aria-hidden']).toBe('true');
    expect(stackImage.props).toMatchObject({ decoding: 'async', loading: 'lazy' });
    expect(stackImage.props.src).toContain('variant.png');
    expect(mainButton.props.children.props.className).toBe('gallery-card-image');
  });

  it('opens the currently scrubbed member in the detail panel and Workbench', () => {
    const onOpenWorkbench = vi.fn();
    const onPreview = vi.fn();
    const cover = {
      id: 'cover',
      image_path: 'C:\\gallery\\cover.png',
      metadata: {},
      name: 'cover',
      prompt_structure: { base_undesired_tags: [], characters: [] },
      tags: [],
    };
    const variant = { ...cover, id: 'variant', image_path: 'C:\\gallery\\variant.png', name: 'variant' };
    const element = GalleryCardView({
      active: false,
      group: { count: 2, cover, members: [cover, variant] },
      hoverProject: variant,
      onContextMenu: vi.fn(),
      onOpenWorkbench,
      onPreview,
      onSelect: vi.fn(),
      selected: false,
    });
    const mainButton = element.props.children.props.children[0];
    const clickEvent = { ctrlKey: false, detail: 1, metaKey: false, shiftKey: false };

    mainButton.props.onClick(clickEvent);
    mainButton.props.onDoubleClick(clickEvent);

    expect(onPreview).toHaveBeenCalledWith(variant, clickEvent);
    expect(onOpenWorkbench).toHaveBeenCalledWith(variant);
  });

  it('keeps modified double clicks available for selection gestures', () => {
    const onOpenWorkbench = vi.fn();
    const cover = {
      id: 'cover',
      image_path: 'C:\\gallery\\cover.png',
      metadata: {},
      name: 'cover',
      prompt_structure: { base_undesired_tags: [], characters: [] },
      tags: [],
    };
    const element = GalleryCardView({
      active: false,
      group: { count: 1, cover, members: [cover] },
      onContextMenu: vi.fn(),
      onOpenWorkbench,
      onPreview: vi.fn(),
      onSelect: vi.fn(),
      selected: false,
    });
    const mainButton = element.props.children.props.children[0];

    mainButton.props.onDoubleClick({ ctrlKey: true, metaKey: false, shiftKey: false });

    expect(onOpenWorkbench).not.toHaveBeenCalled();
  });
});
