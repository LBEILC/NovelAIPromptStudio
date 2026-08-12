# Workbench Tag sort layout fix manual verification

## Change under test

- Commit: `bd673c2` (`fix: preserve tag layout while sorting`)
- Feature: preserve existing Workbench Tag styling and use live flex reordering for variable-width wrapped Tags

## Target operating systems

- Windows 10/11
- macOS 13 or later

## Prerequisites

- Run `npm ci`, `npm test`, and `npm run build` successfully.
- Start the desktop app with `npm run dev` or a package containing commit `bd673c2`.
- Open an image whose Prompt includes differently sized Tags, weighted Tags, and at least three wrapped rows.

## Verification steps

1. Open the Workbench structure view without dragging anything.
   - Expected: Tags retain the original compact outlined style, category dot, border, typography, weight placement, height, and 7px spacing shown before drag sorting was introduced.
   - Observed:

2. Click a Tag without moving the pointer, then close its editor and right-click it.
   - Expected: the quick editor and context menu still open normally; clicking does not reorder or restyle the Tag.
   - Observed:

3. Drag a short Tag over a long or weighted Tag in the same row and pause before releasing.
   - Expected: a styled floating copy follows the pointer, the source becomes translucent, and neighboring Tags animate into their actual flex positions without stretching, gray fallback styling, overlap, or oversized gaps.
   - Observed:

4. Continue dragging across two or more wrapped rows, then release.
   - Expected: Tags reflow using their real widths; every row retains the normal 7px horizontal and vertical gap; the final order matches the last preview and no Tag remains displaced.
   - Observed:

5. Move the first Tag to the end and the last Tag to the beginning.
   - Expected: no Tags, weights, warnings, category colors, or translations are lost or attached to the wrong Tag.
   - Observed:

6. Reorder one Base Prompt Tag, one Base Undesired Tag, and one Character Prompt Tag.
   - Expected: each operation changes only its own scope and keeps all other scopes unchanged.
   - Observed:

7. Enable multi-select and try to drag, then exit multi-select, apply a search/category filter, and try again.
   - Expected: drag sorting remains disabled in multi-select and filtered states; clearing filters restores sorting.
   - Observed:

8. Focus a Tag and use `Alt + Arrow` on Windows or `Option + Arrow` on macOS.
   - Expected: keyboard sorting still moves one position at a time and preserves the Workbench Tag style.
   - Observed:

9. Repeat cross-row dragging in dark and light themes, then set Settings > Appearance > Motion to Off and repeat once.
   - Expected: both themes retain the intended Tag appearance; Motion Off removes the decorative transition while ordering and spacing remain correct.
   - Observed:

## Result

- Overall result (Pass/Fail):
- Tester and operating system:
- Build or package used:
- Discovered issues:
