# Workbench Tag sort layout fix manual verification

## Change under test

- Commit: `bd673c2` (`fix: preserve tag layout while sorting`)
- Feature: preserve existing Workbench Tag styling and use live flex reordering for variable-width wrapped Tags

## Target operating systems

- Windows 10/11
- macOS 13 or later

## Verification steps

1. Open the Workbench structure view and inspect the Tag appearance and spacing.
   - Expected: Tags retain the compact outlined style and normal 7px flex gaps.
   - Observed: passed in the user-reported Windows development session; the previous gray fallback style and incorrect gaps were corrected.

2. Hold a Tag and continue dragging for an extended period.
   - Expected: dragging remains responsive without accumulating layout work or locking the renderer.
   - Observed: failed. A long drag caused the interface to freeze.

## Result

- Overall result (Pass/Fail): Fail
- Tester and operating system: User report, Windows
- Build or package used: development build on `main` after `bd673c2`
- Discovered issues: live flex reordering was handled by `onDragOver`. Reordering changed the collision target, which could fire `onDragOver` again without additional pointer movement and create a self-sustaining reflow/re-render loop.
- Follow-up: fixed by `7411a49`; verify with `doc/manual-verification-20260812-workbench-tag-sort-stability-fix.md`.
