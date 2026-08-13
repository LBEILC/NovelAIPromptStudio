import { describe, expect, it, vi } from 'vitest';
import { BatchToolbar } from './GalleryPage.jsx';

vi.mock('@lobehub/ui', () => {
  const Component = () => null;
  return {
    Accordion: Component,
    AccordionItem: Component,
    ActionIcon: Component,
    DraggablePanel: Object.assign(Component, { Body: Component }),
    Empty: Component,
    Highlighter: Component,
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
    SplitButton: Object.assign(Component, { Main: Component, Menu: Component }),
  };
});

function toolbarActions(view, callbacks) {
  const toolbar = BatchToolbar({
    view,
    selectedGroups: 2,
    selectedImages: 3,
    onFavorite: vi.fn(),
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

    batch[2].props.onClick({ type: 'click' });

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
