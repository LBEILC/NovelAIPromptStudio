import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WorkbenchTabDragOverlay from './components/WorkbenchTabDragOverlay.jsx';

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
