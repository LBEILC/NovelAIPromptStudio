# macOS handoffs

## Verify cross-platform development startup

- Status: Pending
- Date/source: 2026-07-18, Windows
- Related commit: `52df853`
- Action: On macOS, run `npm ci`, `npm test`, `npm run build`, and `npm run dev`. Confirm the Electron window opens and loads the Vite development page.
- Expected: All commands succeed without platform-specific shell errors, and NovelAI Prompt Studio opens normally.
- Observed: Awaiting macOS verification.

## Verify native window chrome and typography

- Status: Pending
- Date/source: 2026-07-18, Windows
- Related commit: `77c79ba`
- Action: Launch the app on macOS and confirm the standard macOS application menu remains available, `hiddenInset` title-bar behavior is unchanged, shortcuts display with `⌘`, and the enlarged typography does not clip in the library, version rail, Prompt, Vibe, or metadata panels.
- Expected: macOS keeps its native menu and title-bar conventions while using the same readable type scale without overflow.
- Observed: Awaiting macOS verification.
