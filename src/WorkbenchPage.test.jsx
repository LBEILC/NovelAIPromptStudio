import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkbenchTabLabel } from './WorkbenchPage.jsx';
import WorkbenchTabDragOverlay from './components/WorkbenchTabDragOverlay.jsx';

vi.mock('@lobehub/ui', () => {
  const Component = () => null;
  return {
    Alert: Component,
    DraggablePanel: Object.assign(Component, { Body: Component }),
    Popover: Component,
    PopoverGroup: Component,
  };
});

vi.mock('@lobehub/ui/base-ui', () => {
  const Component = () => null;
  return {
    Button: Component,
    showContextMenu: vi.fn(),
    SplitButton: Object.assign(Component, { Main: Component, Menu: Component }),
    TabsIndicator: Component,
    TabsList: Component,
    TabsRoot: Component,
    TabsTab: Component,
  };
});

describe('WorkbenchTabDragOverlay', () => {
  it('renders independently from the Base UI tabs context', () => {
    const markup = renderToStaticMarkup(<WorkbenchTabDragOverlay
      active
      dirty
      title="example.png"
    />);

    expect(markup).toContain('workbench-tab-drag-overlay active');
    expect(markup).toContain('workbench-tab-dirty');
    expect(markup).toContain('example.png');
  });
});

describe('WorkbenchTabLabel', () => {
  it('keeps image hover previews transparent to pointer hit testing', () => {
    const element = WorkbenchTabLabel({
      onClose: () => {},
      tab: { displayName: 'example.png', id: 'tab-1', project: null },
    });

    expect(element.props.styles).toEqual({ root: { pointerEvents: 'none' } });
  });
});
