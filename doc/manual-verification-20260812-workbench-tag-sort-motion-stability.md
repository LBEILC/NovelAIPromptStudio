# Workbench Tag sort motion and stability manual verification

## Change under test

- Commit: `d6d4d01` (`fix: restore stable tag reorder motion`)
- Feature: Motion FLIP position animation on top of stable pointer-driven Tag sorting

## Target operating systems

- Windows 10/11
- macOS 13 or later

## Prerequisites

- Run `npm ci`, `npm test`, and `npm run build` successfully.
- Start the desktop app with `npm run dev` or a package containing commit `d6d4d01`.
- Open an image whose Prompt includes differently sized Tags and at least three wrapped rows.
- Set Settings > Appearance > Motion to Full for steps 1–6.

## Verification steps

1. Drag a Tag slowly left and right across several adjacent Tags.
   - Expected: each displaced Tag glides from its previous position to its new flex position over about 180ms; it does not jump, stretch, overlap, or change style.
   - Observed:

2. Reverse direction several times between the same two Tags.
   - Expected: movement begins only after crossing the target midpoint and interrupted animations retarget smoothly without oscillation.
   - Observed:

3. Drag short, long, translated, weighted, and syntax-warning Tags across row boundaries.
   - Expected: all affected Tags animate in both axes using their real widths while retaining the normal 7px flex gaps and original appearance.
   - Observed:

4. Hold the pointer still over a Tag for 30 seconds, then continue dragging continuously for 60 seconds.
   - Expected: the interface remains responsive; a stationary pointer does not trigger additional reorders, layout measurements, flicker, or CPU growth.
   - Observed:

5. Release after the prolonged drag, then immediately click, edit, right-click, and drag another Tag.
   - Expected: the previewed order is committed once and all subsequent interactions work normally; no overlay or animation state remains behind.
   - Observed:

6. Reorder Base Prompt, Base Undesired, and Character Prompt Tags, then test multi-select and filtered states.
   - Expected: each scope remains isolated and drag sorting stays disabled while selecting or filtering.
   - Observed:

7. Set Motion to Off and repeat horizontal and cross-row dragging; then select Follow System and test with the operating-system reduced-motion preference enabled.
   - Expected: ordering remains functional but displaced Tags update immediately without spatial animation.
   - Observed:

## Result

- Overall result (Pass/Fail):
- Tester and operating system:
- Build or package used:
- Discovered issues:
