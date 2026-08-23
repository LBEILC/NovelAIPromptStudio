import fs from 'node:fs';
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
      imageSrc="novelai-media:///example.png"
      position={3}
    />);

    expect(markup).toContain('workbench-tab-drag-overlay active');
    expect(markup).toContain('workbench-tab-dirty');
    expect(markup).toContain('novelai-media:///example.png');
    expect(markup).toContain('workbench-tab-position">3');
  });
});

describe('WorkbenchTabLabel', () => {
  it('keeps the filmstrip height independent of Base UI runtime style order', () => {
    const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
    expect(styles).toMatch(/\.workbench-tab \{[^}]*min-height: 58px;/);
  });

  it('keeps image hover previews transparent to pointer hit testing', () => {
    const element = WorkbenchTabLabel({
      onClose: () => {},
      position: 2,
      tab: { displayName: 'example.png', id: 'tab-1', project: { image_path: 'C:\\images\\example.png' } },
    });

    expect(element.props.styles).toEqual({ root: { pointerEvents: 'none' } });
    expect(element.props.children.props.children.some((child) => child?.props?.className === 'workbench-tab-thumbnail')).toBe(true);
    expect(element.props.children.props.children.some((child) => child?.props?.children === 2)).toBe(true);
  });
});
