# Migration Rules

## Separate Migration From Upgrade

Migrate against the installed version first. Upgrade `@lobehub/ui` separately unless a required Base UI component is unavailable. This keeps API, styling, and dependency changes independently testable.

## Legacy Button to Base UI Button

Replace deprecated imports:

```jsx
import LobeButton from '@lobehub/ui/es/Button/index';
```

with the public Base UI entry:

```jsx
import { Button as LobeButton } from '@lobehub/ui/base-ui';
```

Before a mechanical replacement:

1. Inventory every prop used.
2. Compare those props with the installed Base UI `ButtonProps`.
3. Search CSS for `.ant-btn`, Ant Design structure, direct-child assumptions, and theme overrides.
4. Record the legacy default appearance in light and dark themes.
5. Migrate all imports in one focused change so the application does not carry two button systems.
6. Verify default, primary, text, dashed, danger, icon-only, disabled, and loading states that the project uses.

Commonly compatible props include `block`, `danger`, `disabled`, `icon`, `size`, and `type`, but always verify the installed types. Legacy-only props such as `glass`, `shadow`, `color`, or `iconProps` require an explicit replacement.

## Deep Imports

Deep `@lobehub/ui/es/...` imports may be package-exported in some versions, but they couple code to internal file organization and can select legacy implementations accidentally. Prefer documented public entries for new code. Migrate existing deep imports only after checking bundle output and component identity.

## CSS and Theme Checks

- Replace implementation selectors with product classes where practical.
- Check both theme modes after changing a primitive; legacy components may select different default variants by theme.
- Do not compensate for a migration with broad global button overrides.
- Verify focus-visible rings, text contrast, minimum control height, icon alignment, and long translated labels.

## Overlay and Panel Checks

When migrating menus, modals, toasts, images, or panels:

- Keep the Lobe provider and host requirements intact.
- Verify portal stacking and Electron window boundaries.
- Preserve native macOS and Windows actions where the application intentionally uses system dialogs.
- Do not add a second animation layer around a component that already animates its state.
