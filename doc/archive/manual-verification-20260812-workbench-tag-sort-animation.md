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

## Verification steps

1. Open the Workbench structure view and inspect the Tags before dragging.
   - Expected: every Tag retains the compact dark outlined Workbench style.
   - Observed: failed. Tags rendered as gray rectangular controls; text and weights wrapped differently from the original layout.

2. Drag a differently sized Tag horizontally and across a row boundary.
   - Expected: surrounding Tags animate to their new positions and settle with the normal 7px flex gap.
   - Observed: failed. The preview used stale rectangle slots, leaving incorrect spacing after Tags moved and wrapped.

## Result

- Overall result (Pass/Fail): Fail
- Tester and operating system: User report, Windows
- Build or package used: development build on `main` after `d9c662b`
- Discovered issues: `LobePopover` injected a `className` that replaced the Tag component classes. The rectangle sorting strategy also described resized slots while the renderer intentionally applied translation only, so variable-width wrapped Tags did not occupy their visible preview positions.
- Follow-up: fixed by `bd673c2`; verify with `doc/manual-verification-20260812-workbench-tag-sort-layout-fix.md`.
