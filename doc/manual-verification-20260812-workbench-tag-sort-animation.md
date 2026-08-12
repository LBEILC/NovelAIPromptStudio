# Workbench Tag sort animation manual verification

## Change under test

- Commit: `d9c662b` (`feat: animate workbench tag sorting`)
- Feature: two-dimensional drag sorting for wrapped Workbench Tags, including live displacement and drop animation

## Target operating systems

- Windows 10/11
- macOS 13 or later

## Prerequisites

- Run `npm ci`, `npm test`, and `npm run build` successfully.
- Start the desktop app with `npm run dev` or a package built from commit `d9c662b`.
- Open a NovelAI image whose Base Prompt has enough differently sized Tags to wrap across at least three rows.
- Keep one image with Base Undesired Tags and, if available, Character Prompt Tags for scope-isolation checks.

## Verification steps

1. In the structure view, click a Tag without moving the pointer.
   - Expected: the Tag editor opens normally; a simple click does not start a drag or move the Tag.
   - Observed:

2. Press and move a Tag by only a few pixels, then release it over its original position.
   - Expected: the 5px activation threshold prevents accidental sorting before a deliberate drag; the Tag order remains unchanged.
   - Observed:

3. Drag a Tag horizontally over another Tag in the same row and hold it there briefly.
   - Expected: a raised visual copy follows the pointer, the original Tag becomes translucent, and surrounding Tags animate smoothly to preview the new order without flicker.
   - Observed:

4. Continue the same drag across a row boundary and release between Tags on another row.
   - Expected: wrapped Tags reflow in two dimensions, the drop target follows the pointer position naturally, and the dragged Tag settles into the previewed position with a short animation.
   - Observed:

5. Drag the first Tag to the end and then drag the last Tag back to the beginning.
   - Expected: both boundary moves complete without lost Tags, duplicate Tags, incorrect weights, clipping, or a drag overlay left on screen.
   - Observed:

6. Reorder one Base Prompt Tag, one Base Undesired Tag, and one Character Prompt Tag.
   - Expected: each move changes only the active Prompt scope; other scopes retain their original order.
   - Observed:

7. Right-click a Tag, then click a Tag and edit its text or weight after completing a drag.
   - Expected: the context menu and editor still open normally, and the edited value remains attached to the correct Tag after sorting.
   - Observed:

8. Enable multi-select and attempt to drag a Tag; then exit multi-select, apply a search or category filter, and attempt another drag.
   - Expected: drag sorting is disabled in multi-select and filtered states; selection, editing, and filtering behavior remain intact.
   - Observed:

9. Clear all filters, focus a Tag, and press `Alt + Left/Right` and `Alt + Up/Down` (`Option` on macOS).
   - Expected: the existing keyboard sorting shortcut still moves the focused Tag one position and preserves focus.
   - Observed:

10. Repeat steps 3 and 4 in dark and light themes, then set Settings → Appearance → Motion to Off and repeat once more.
    - Expected: colors and borders remain legible in both themes; Motion Off removes the decorative transition while sorting and final order remain functional.
    - Observed:

## Result

- Overall result (Pass/Fail):
- Tester and operating system:
- Build or package used:
- Discovered issues:
