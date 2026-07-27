---
name: lobe-ui-frontend
description: Build, refactor, or audit React and Electron frontends that use @lobehub/ui. Use for Lobe UI component selection, Base UI migrations, deprecated API cleanup, theming, dialogs, menus, side panels, image preview, design-system consistency, or any UI implementation in a repository whose package.json includes @lobehub/ui.
---

# Lobe UI Frontend

Use the installed package as the source of truth. Lobe UI evolves quickly; never rely on remembered APIs alone.

## Workflow

1. Read repository instructions, `package.json`, the lockfile, and any design context such as `.impeccable.md`.
2. Resolve the installed `@lobehub/ui` version from `node_modules/@lobehub/ui/package.json`.
3. For audits or migrations, run:

   ```bash
   node .agents/skills/lobe-ui-frontend/scripts/audit-lobe-ui.mjs .
   ```

4. Inspect the installed component types, package exports, and `@deprecated` annotations before choosing imports or props.
5. Use official Lobe UI documentation or its source repository when local types do not answer the question. For version-sensitive decisions, compare the documentation against the installed version.
6. Read [component-selection.md](references/component-selection.md) before introducing or replacing a component.
7. Read [migration-rules.md](references/migration-rules.md) when changing imports, replacing deprecated components, or upgrading `@lobehub/ui`.
8. Implement the smallest coherent change. Preserve unrelated worktree changes.
9. Validate relevant states: light and dark themes, keyboard focus, disabled/loading behavior, long text, narrow panels, and reduced motion.
10. Run the repository's tests and production build. Follow its cross-platform handoff and delivery instructions.

## Required Practices

- Prefer documented public entry points: `@lobehub/ui/base-ui` for Base UI primitives and `@lobehub/ui` for higher-level components.
- Treat local `@deprecated` annotations as actionable even when the component still renders.
- Reuse Lobe UI behavior for dialogs, context menus, toasts, image previews, form controls, and resizable panels instead of recreating it.
- Keep native semantic elements for application-specific surfaces such as image cards or editable tag chips when a generic component would weaken semantics or interaction.
- Preserve the product's existing visual language. Do not add decorative labels, explanatory UI copy, gradients, glass effects, or animation merely because a request mentions a design requirement.
- Keep developer requirements in code and documentation, not in user-facing interface copy.
- Verify CSS selectors after a Base UI migration. Prefer semantic classes over implementation selectors such as `.ant-btn`.
- Do not combine a dependency upgrade with a component migration unless the user requests both or the installed version blocks the migration.

## Completion Criteria

- No new deprecated Lobe UI imports or props.
- Component choice matches the installed version and the task's interaction semantics.
- Themes and interaction states remain coherent.
- Tests and production build pass, or blockers are reported precisely.
- Platform-sensitive behavior is handed off according to repository instructions.
