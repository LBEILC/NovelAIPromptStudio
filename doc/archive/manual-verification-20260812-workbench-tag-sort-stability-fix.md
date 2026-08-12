# Workbench Tag sort stability fix manual verification

## Change under test

- Commit: `7411a49` (`fix: prevent tag drag reorder loop`)
- Feature: stable pointer-driven sorting for variable-width wrapped Workbench Tags

## Target operating systems

- Windows 10/11
- macOS 13 or later

## Verification steps

1. Hold and move a Tag for an extended period.
   - Expected: dragging remains responsive without an unbounded reorder loop.
   - Observed: passed in the user-reported Windows development session; prolonged dragging no longer froze the interface.

2. Move a Tag horizontally over adjacent Tags.
   - Expected: displaced Tags animate smoothly into their preview positions.
   - Observed: failed. The safe real-order update was instantaneous because the dnd-kit virtual sorting strategy had been disabled and the browser did not animate flex reflow by itself.

## Result

- Overall result (Pass/Fail): Fail
- Tester and operating system: User report, Windows
- Build or package used: development build on `main` after `7411a49`
- Discovered issues: stability was restored, but horizontal and wrapped layout changes had no displacement animation.
- Follow-up: fixed by `d6d4d01`; verify with `doc/manual-verification-20260812-workbench-tag-sort-motion-stability.md`.
