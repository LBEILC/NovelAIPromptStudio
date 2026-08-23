# Runtime style order

Lobe UI and Base UI generate component styles at runtime. A production build may load extracted application CSS before those generated rules even when development mode appears correct. A custom class with the same specificity as a generated class can therefore change appearance between development and a packaged app.

Use this check whenever application CSS is attached directly to a Lobe UI component:

1. Inspect the installed component source and list every generated property that overlaps the application rule. Check the base, size, variant, and interaction classes rather than only the property reported in a screenshot.
2. Prefer a documented component prop or theme token when it expresses the product intent without weakening component semantics.
3. For an invariant dimension, prefer compatible `min-*` or `max-*` bounds. For other application-level overrides, use a narrowly scoped semantic selector with greater specificity than a single generated class, such as `button.empty-action` or `.settings-panel.settings-panel`.
4. Keep library pseudo-state selectors effective. A base selector should not suppress intended hover, active, focus-visible, disabled, or loading feedback; avoid inline styles when those states need to change the same property.
5. Use `!important` only when the installed component already requires it or no lower-impact specificity or constraint can express the invariant.
6. Add a regression test for the selector or constraint, run the production build, and require manual comparison of development and packaged rendering when the issue was package-only.

When one collision is found, audit other custom classes on the same component family. Runtime classes commonly set several related properties—for example a button base class may set `gap`, border, and typography while its size and variant classes set height, padding, radius, background, and color.
