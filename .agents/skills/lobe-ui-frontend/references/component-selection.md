# Component Selection

Choose by interaction semantics, then verify the installed API.

| Need | Prefer | Public entry point | Avoid |
|---|---|---|---|
| Text or icon action | Base UI `Button` | `@lobehub/ui/base-ui` | Deprecated legacy `Button` |
| Icon-only navigation/action | `ActionIcon` | `@lobehub/ui` | A text button forced into a square |
| Text input, select, checkbox, slider | Corresponding Base UI control when available | `@lobehub/ui/base-ui` | Hand-built control wrappers |
| Context menu | Base UI `ContextMenu` APIs | `@lobehub/ui/base-ui` | Absolute-positioned custom menus |
| Modal, confirmation, toast | Base UI feedback APIs | `@lobehub/ui/base-ui` | Custom overlays and alert-like divs |
| Click-to-enlarge artwork | `Image` | `@lobehub/ui` | A custom lightbox |
| Resizable or collapsible side panel | `DraggablePanel` | `@lobehub/ui` | Parallel resize and animation logic |
| Segmented view/filter switch | Base UI `Segmented` | `@lobehub/ui/base-ui` | A row of unrelated buttons |
| Domain-specific image card or tag chip | Semantic native `button` when appropriate | React/HTML | Forcing every clickable surface into `Button` |

## Selection Rules

1. Confirm the component exists in the installed package's public exports.
2. Read its installed type declaration and source when behavior is unclear.
3. Search for `@deprecated` on the component and the props being used.
4. Check whether the project already has a matching pattern before adding a new one.
5. Preserve behavior supplied by Lobe UI, including focus, loading, disabled, overlay, motion, and theme handling.
6. Add local CSS only for layout and product semantics. Do not duplicate the component's internal visual system.

## Import Guidance

Use canonical public imports for new work:

```jsx
import { Button, ContextMenuTrigger, Modal, Segmented } from '@lobehub/ui/base-ui';
import { ActionIcon, DraggablePanel, Image } from '@lobehub/ui';
```

Do not assume the root `Button` is the Base UI implementation. Inspect the installed declarations; some Lobe UI versions continue to export a deprecated legacy `Button` from the root entry point.
