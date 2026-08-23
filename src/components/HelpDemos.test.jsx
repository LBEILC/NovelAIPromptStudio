import { describe, expect, it, vi } from 'vitest';

vi.mock('@lobehub/ui', () => ({
  Icon: ({ icon: Component, ...props }) => <Component {...props}/>,
}));

vi.mock('@lobehub/ui/base-ui', () => ({
  Button: ({ children, icon, type, ...props }) => <button {...props} type={type === 'submit' || type === 'reset' ? type : 'button'}>{icon}{children}</button>,
  Segmented: ({ options = [], value, ...props }) => <div {...props}>{options.find((option) => option.value === value)?.label}</div>,
  Select: ({ options = [], value, ...props }) => <select {...props} defaultValue={value}>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>,
  Slider: ({ value, ...props }) => <input {...props} defaultValue={value} type="range"/>,
  Switch: ({ checked, ...props }) => <button aria-pressed={checked} {...props} type="button"/>,
}));
import { copyDemoResult, filterGalleryDemoItems, galleryGroupingAssignments } from './HelpDemos.jsx';

describe('HelpDemos', () => {
  it('keeps positive and undesired copy scopes separate', () => {
    expect(copyDemoResult('prompt', 'character').map((item) => item.tag)).toEqual(['1girl', 'silver hair', 'school uniform', 'smiling']);
    expect(copyDemoResult('undesired', 'character').map((item) => item.tag)).toEqual(['bad hands', 'extra fingers']);
    expect(copyDemoResult('prompt', 'character', 'clothing').map((item) => item.tag)).toEqual(['school uniform']);
  });

  it('changes gallery grouping without mutating the demo images', () => {
    expect(galleryGroupingAssignments('separate')).toEqual(['A', 'B', 'C', 'D']);
    expect(galleryGroupingAssignments('base', 85, false)).toEqual(['A', 'B', 'A', 'C']);
    expect(galleryGroupingAssignments('similar', 78, true)).toEqual(['A', 'A', 'A', 'A']);
  });

  it('combines gallery filters with AND and exclusion priority', () => {
    const results = filterGalleryDemoItems({ excludeBlurry: true, includeBlue: true, model: 'v45', recent: true });
    expect(results.map((item) => item.name)).toEqual(['蓝发夜景', '蓝发室内']);
  });
});
