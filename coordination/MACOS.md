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

## Verify structured V4 prompt workspace

- Status: Pending
- Date/source: 2026-07-19, Windows
- Related commit: `7403d61`
- Action: On macOS, import a NovelAI V4/V4.5 PNG containing Base Prompt, Base Undesired Content, at least one Character Prompt and Character Undesired Content, and character coordinates. Click the library thumbnail to open Prompt overview; verify every scope is separated, tags can be clicked and reordered, the right panel switches to the matching scope, and the 5 x 5 position editor persists changes. Also confirm the macOS Avenir Next/PingFang font stack and native menu/title bar remain visually correct.
- Expected: V4 metadata migrates without losing tags, Prompt overview and scoped editing behave the same as Windows, and macOS keeps native typography and window conventions without clipping.
- Observed: Awaiting macOS verification; Windows passed `npm ci`, 15 tests, production build, and real-window interaction checks.

## Verify adaptive default window and CJK font fallback

- Status: Pending
- Date/source: 2026-07-19, Windows
- Related commit: `51bd5b6`
- Action: Launch the app on macOS on a normal laptop display and, if available, a larger external display. Confirm the initial window fits inside the usable work area, expands up to the new desktop default without covering the menu bar or Dock, and the three-column layout plus top actions remain visible. Check Chinese labels in the category legend and any mixed mono/CJK fields.
- Expected: The window respects the current display work area, macOS title-bar behavior is unchanged, controls do not clip, and Chinese glyphs fall back to PingFang SC rather than a serif or generic monospace face.
- Observed: Awaiting macOS verification; Windows passed clean install, 15 tests, production build, and default-window visual inspection.

## Verify reusable Vibe library and file dialogs

- Status: Pending
- Date/source: 2026-07-19, Windows
- Related commit: `8c4c53f`
- Action: On macOS, import image-based and encoding-only `.naiv4vibe` files plus a NovelAI PNG containing embedded Vibe metadata. Verify file dialogs accept `.naiv4vibe`, raw files are copied without modification, thumbnails render, duplicate encodings merge into one library entry, and the imported Vibe can be reused by another project. Confirm metadata-only Vibes show a locked Information Extracted value and multi-cache files only offer cached values.
- Expected: All Vibe paths and copied assets work with macOS path conventions; no re-encoding or network request occurs; Reference Strength remains editable while uncached Information Extracted values cannot be selected.
- Observed: Awaiting macOS verification; Windows parsed all 10 supplied Vibe files, matched the supplied PNG to `5.naiv4vibe`, passed 22 tests/build, and completed real-window migration checks.
