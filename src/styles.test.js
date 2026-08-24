import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const styles = fs.readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

describe('production-safe Lobe UI overrides', () => {
  it('keeps the filmstrip geometry independent of runtime style order', () => {
    expect(styles).toMatch(/\.workbench-tabs-list \{[^}]*gap: 4px !important;/);
    expect(styles).toMatch(/\.workbench-tab \{[^}]*min-height: 58px;/);
  });

  it('gives application surfaces more specificity than one generated class', () => {
    expect(styles).toMatch(/\.overview-no-results, button\.overview-add-character \{[^}]*color: var\(--muted\);/);
    expect(styles).toMatch(/button\.overview-add-character \{[^}]*gap: 12px;/);
    expect(styles).toMatch(/\.workbench-source-panel\.workbench-source-panel \{[^}]*padding:/);
    expect(styles).toMatch(/\.settings-nav\.settings-nav \{[^}]*padding:/);
    expect(styles).toMatch(/\.settings-nav-group > button\.active \{[^}]*background:/);
    expect(styles).toMatch(/\.settings-nav-group > button strong \{[^}]*line-height: 1\.45;/);
    expect(styles).toMatch(/\.settings-font-select\.settings-font-select \{[^}]*width: 260px;/);
    expect(styles).toMatch(/\.gallery-size-slider\.gallery-size-slider \{[^}]*width: 96px;/);
  });

  it('keeps built-in help demonstrations compatible with motion preferences', () => {
    expect(styles).toMatch(/\.help-article > header \{[^}]*display: grid;[^}]*grid-template-columns: max-content minmax\(0, 1fr\);[^}]*align-items: center;/);
    expect(styles).toMatch(/\.help-article > header > svg \{[^}]*grid-row: 1;[^}]*margin-inline-start: 5px;/);
    expect(styles).toMatch(/\.help-article h3 \{[^}]*grid-row: 1;/);
    expect(styles).toMatch(/\.help-article header p \{[^}]*grid-row: 2;/);
    expect(styles).toMatch(/\.help-topic-group > summary \{[^}]*grid-template-columns: minmax\(0, 1fr\) auto 14px;/);
    expect(styles).toMatch(/\.help-topic-group > button \{[^}]*min-height: 58px;/);
    expect(styles).toMatch(/\.help-article-body p\.help-note \{[^}]*margin: 12px 0 18px;/);
    expect(styles).toMatch(/\.help-table-wrap \{[^}]*overflow-x: auto;/);
    expect(styles).toMatch(/\.help-simulator, \.help-translation-demo \{[^}]*overflow: hidden;[^}]*background: var\(--raised\);/);
    expect(styles).toMatch(/\.help-demo-toolbar, \.help-translation-toolbar \{[^}]*display: flex;/);
    expect(styles).toMatch(/\.help-gallery-teaching-layout \{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(260px, 310px\);/);
    expect(styles).toMatch(/\.help-real-gallery-grid \{[^}]*grid-template-columns: repeat\(2, minmax\(72px, 1fr\)\);/);
    expect(styles).toMatch(/\.help-grouping-panel-embedded\.gallery-grouping-panel, \.help-filter-panel-embedded\.gallery-filter-panel \{[^}]*width: 100%;/);
    expect(styles).toMatch(/\.help-gallery-scrub-card \{[^}]*cursor: ew-resize;/);
    expect(styles).toMatch(/\.help-gallery-scope-panel \{[^}]*display: grid;/);
    expect(styles).toMatch(/@keyframes help-gallery-preview-swap \{ from \{ opacity: \.65; transform: scale\(\.985\); \} to \{ opacity: 1; transform: scale\(1\); \} \}/);
    expect(styles).toMatch(/\.help-data-flow \{[^}]*display: flex;/);
    expect(styles).toMatch(/\.help-troubleshooting-demo dl > div \{[^}]*grid-template-columns: 88px minmax\(0, 1fr\);/);
    expect(styles).toMatch(/\.help-resolution-path \{[^}]*grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/);
    expect(styles).toMatch(/html\[data-motion="off"\] \*, html\[data-motion="off"\] \*::before, html\[data-motion="off"\] \*::after \{[^}]*animation-duration: \.01ms !important;/);
  });
});
