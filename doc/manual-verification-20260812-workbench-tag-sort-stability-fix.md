# Workbench Tag sort stability fix manual verification

## Change under test

- Commit: `7411a49` (`fix: prevent tag drag reorder loop`)
- Feature: stable pointer-driven sorting for variable-width wrapped Workbench Tags

## Target operating systems

- Windows 10/11
- macOS 13 or later

## Prerequisites

- Run `npm ci`, `npm test`, and `npm run build` successfully.
- Start the desktop app with `npm run dev` or a package containing commit `7411a49`.
- Open an image whose Prompt includes differently sized Tags and at least three wrapped rows.

## Verification steps

1. Press and hold a Tag without moving it for 30 seconds.
   - Expected: the drag overlay stays responsive; CPU use does not continually climb; the interface does not flicker, reorder repeatedly, or freeze.
   - Observed:

2. Move slowly between two adjacent Tags and pause over each Tag for several seconds.
   - Expected: a Tag changes position only after the pointer crosses the target midpoint; pausing does not cause the two Tags to exchange positions repeatedly.
   - Observed:

3. Continue dragging continuously for 60 seconds across several rows, including through the gaps between Tags.
   - Expected: pointer tracking and scrolling remain responsive; no unbounded re-render or flex reflow loop develops.
   - Observed:

4. Release after the prolonged drag, then immediately click, edit, right-click, and drag another Tag.
   - Expected: the previewed order is committed once and all subsequent interactions work normally; no overlay or dragging state remains behind.
   - Observed:

5. Drag short, long, translated, weighted, and syntax-warning Tags across row boundaries.
   - Expected: every Tag retains the original compact outlined style, content association, and consistent 7px flex gaps without stretching or overlap.
   - Observed:

6. Reorder Base Prompt, Base Undesired, and Character Prompt Tags, then test multi-select and filtered states.
   - Expected: each scope remains isolated and drag sorting stays disabled while selecting or filtering.
   - Observed:

7. Repeat steps 1–3 in light theme and with Settings > Appearance > Motion set to Off.
   - Expected: appearance remains correct and the non-animated mode retains identical sorting behavior and stability.
   - Observed:

## Result

- Overall result (Pass/Fail):
- Tester and operating system:
- Build or package used:
- Discovered issues:
