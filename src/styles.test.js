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
    expect(styles).toMatch(/\.help-marquee-box \{[^}]*animation: help-marquee-box/);
    expect(styles).toMatch(/html\[data-motion="off"\] \*, html\[data-motion="off"\] \*::before, html\[data-motion="off"\] \*::after \{[^}]*animation-duration: \.01ms !important;/);
  });
});
