# macOS handoffs

## Verify cross-platform development startup

- Status: Blocked
- Date/source: 2026-07-18, Windows
- Related commit: `52df853`
- Action: On macOS, run `npm ci`, `npm test`, `npm run build`, and `npm run dev`. Confirm the Electron window opens and loads the Vite development page.
- Expected: All commands succeed without platform-specific shell errors, and NovelAI Prompt Studio opens normally.
- Observed: macOS completed `npm ci`, 25 tests, and the production build. Vite reached ready state and Electron launched a renderer in development mode, but the Mac was locked before the window contents could be inspected; visual confirmation still requires an unlocked session.

## Verify native window chrome and typography

- Status: Blocked
- Date/source: 2026-07-18, Windows
- Related commit: `77c79ba`
- Action: Launch the app on macOS and confirm the standard macOS application menu remains available, `hiddenInset` title-bar behavior is unchanged, shortcuts display with `⌘`, and the enlarged typography does not clip in the library, version rail, Prompt, Vibe, or metadata panels.
- Expected: macOS keeps its native menu and title-bar conventions while using the same readable type scale without overflow.
- Observed: Static platform checks and the production build passed. The Mac was locked, so native menu, title-bar, shortcut glyph, typography, and overflow inspection could not be completed.

## Verify structured V4 prompt workspace

- Status: Blocked
- Date/source: 2026-07-19, Windows
- Related commit: `7403d61`
- Action: On macOS, import a NovelAI V4/V4.5 PNG containing Base Prompt, Base Undesired Content, at least one Character Prompt and Character Undesired Content, and character coordinates. Click the library thumbnail to open Prompt overview; verify every scope is separated, tags can be clicked and reordered, the right panel switches to the matching scope, and the 5 x 5 position editor persists changes. Also confirm the macOS Avenir Next/PingFang font stack and native menu/title bar remain visually correct.
- Expected: V4 metadata migrates without losing tags, Prompt overview and scoped editing behave the same as Windows, and macOS keeps native typography and window conventions without clipping.
- Observed: macOS passed the V4 structure and metadata tests as part of 25 passing tests, and the existing user database migrated successfully. The locked Mac prevented import-dialog and real-window scope, reorder, and 5 x 5 editor checks.

## Verify adaptive default window and CJK font fallback

- Status: Blocked
- Date/source: 2026-07-19, Windows
- Related commit: `51bd5b6`
- Action: Launch the app on macOS on a normal laptop display and, if available, a larger external display. Confirm the initial window fits inside the usable work area, expands up to the new desktop default without covering the menu bar or Dock, and the three-column layout plus top actions remain visible. Check Chinese labels in the category legend and any mixed mono/CJK fields.
- Expected: The window respects the current display work area, macOS title-bar behavior is unchanged, controls do not clip, and Chinese glyphs fall back to PingFang SC rather than a serif or generic monospace face.
- Observed: macOS startup and production build passed, but the locked session prevented checking usable-work-area bounds, title-bar behavior, CJK fallback, and clipping on the actual display.

## Verify reusable Vibe library and file dialogs

- Status: Blocked
- Date/source: 2026-07-19, Windows
- Related commit: `8c4c53f`
- Action: On macOS, import image-based and encoding-only `.naiv4vibe` files plus a NovelAI PNG containing embedded Vibe metadata. Verify file dialogs accept `.naiv4vibe`, raw files are copied without modification, thumbnails render, duplicate encodings merge into one library entry, and the imported Vibe can be reused by another project. Confirm metadata-only Vibes show a locked Information Extracted value and multi-cache files only offer cached values.
- Expected: All Vibe paths and copied assets work with macOS path conventions; no re-encoding or network request occurs; Reference Strength remains editable while uncached Information Extracted values cannot be selected.
- Observed: macOS now has automated coverage confirming raw `.naiv4vibe` bytes remain unchanged, embedded source images and thumbnails are written, identical source bytes receive the same hash, and encoding-only entries remain separate. The existing macOS database migrated one metadata-only Vibe successfully. File-dialog and Finder actions remain blocked by the locked session.

## Verify cached AI classification and source-grouped Vibes

- Status: Blocked
- Date/source: 2026-07-19, Windows
- Related commit: `fd8a4f7`
- Action: On macOS, import two projects containing the same NovelAI tags, run AI 整理 on the first, manually edit one translation/category, then confirm the second project reuses both results without another model request. Confirm artist attribution tags appear under 画师. Import two `.naiv4vibe` files derived from the same embedded source image and verify they appear as parameter versions in one source-image group; test the source-image folder action and an encoding-only Vibe with no embedded PNG.
- Expected: The local dictionary reuses normalized tags across Base/Undesired/Character scopes and persists AI/manual edits; macOS paths remain valid. Vibes with identical source-image bytes share one visual group, the source folder opens in Finder, and missing-PNG entries show a clear warning while remaining reusable.
- Observed: macOS passed dictionary reuse, artist classification, source-hash grouping, database migration, and raw Vibe import checks in 25 tests. Source grouping is now isolated in a tested renderer helper. The locked session prevented live AI request-count, manual-edit, Finder, and visual missing-PNG checks.
