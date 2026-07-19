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

## Verify explicit PNG Vibe extraction and cache markers

- Status: Pending
- Date/source: 2026-07-19, Windows
- Related commit: `8399a21`
- Action: On an unlocked macOS session, import a NovelAI PNG whose embedded Vibe encoding is not already in the library. Confirm the app does not create a `.naiv4vibe` automatically and instead offers “上传后重试” and “从 PNG 提取”. Test both paths. For an encoded Vibe, move Information Extracted between cached marker positions and an uncached position, then use “恢复原编码” when available.
- Expected: Uploading the original `.naiv4vibe` links it without extraction; explicit PNG extraction creates an encoding-only file without network use or Anlas cost. Cached positions remain visually marked and clickable, uncached positions disable the file-reveal action, returning to a cached/original position re-enables it, and Finder/file-dialog behavior follows macOS conventions.
- Observed: Awaiting macOS UI verification; Windows passed clean install, 29 tests after merging the macOS grouping tests, production build, database migration, and real-window slider/file-state checks.

## Verify filtered Prompt copying and syntax diagnostics

- Status: Pending
- Date/source: 2026-07-19, Windows
- Related commit: `5edbaa5`
- Action: On an unlocked macOS session, open Prompt overview and test category, Prompt/Undesired, Base/Character, and translated-text filters. Confirm the top copy button follows the visible count, multi-select switches copying to the selected tags, original/translated/bilingual display modes render without clipping, hover reveals the opposite language, and the two-step bulk-delete control is clear. Import a prompt containing `::year2025 ::` and a standalone `::`; verify both remain lossless in copied Prompt text while showing syntax warnings.
- Expected: Filtering and selection use the same copy context on macOS; translated views remain display-only and copying always uses original NovelAI syntax. The toolbar fits the default window, native title/menu behavior is unchanged, and irregular closer syntax persists through the SQLite migration until the user edits or deletes it.
- Observed: Windows passed a clean install, 33 tests, production build, and real-window checks for visible-count copying, translated display, multi-select copying, toolbar layout, and both syntax warnings. Awaiting macOS UI verification.

## Verify category-grouped Prompt overview and compact copying

- Status: Pending
- Date/source: 2026-07-19, Windows
- Related commit: `3033e80`
- Action: On an unlocked macOS session, switch Prompt overview between 按结构 and 按分类. In category view, enable multi-select, select the full Clothing group and one other category group, then copy. Confirm every category is presented as one group, group selection toggles all visible members, and the copied Prompt uses comma-space separators inside a category with exactly one newline between selected categories.
- Expected: Default copying keeps each Prompt scope compact, for example `1.3::shirt dress ::, 1.2::button up ::, 1.1::collared dress ::`. Selecting multiple categories produces one line per category without changing tag weights or original NovelAI syntax. The additional grouping control and category headers fit the default macOS window without clipping.
- Observed: Windows passed a clean install, 35 tests, production build, and real-window checks. Selecting Clothing plus Character produced 15 selected tags across 2 categories, with both copy controls updating correctly. Awaiting macOS UI verification.

## Verify Finder drag-and-drop and ZIP import

- Status: Pending
- Date/source: 2026-07-19, Windows
- Related commit: `b9bde69`
- Action: On an unlocked macOS session, drag one PNG, several images, and a standard NovelAI ZIP from Finder onto the application window. Repeat while viewing a collection. Also use the native import dialog and cancel one multi-file import between entries.
- Expected: The full-window drop preview appears without hiding native window controls; supported files show the accept state and unsupported files show the reject state. Images and ZIP entries use the same importer, imports started from a collection join that collection, duplicate image bytes are skipped, cancellation keeps completed items, and the final summary reports imported, duplicate, failed, ignored, and remaining counts. Finder paths containing CJK characters, spaces, and parentheses work normally.
- Observed: Windows passed 44 automated tests and the production build. The provided 80-image NovelAI ZIP passed security preflight and imported 80/80 images into a disposable database with zero failures. Windows real-window checks confirmed the updated native file dialog and layout; Finder drag behavior awaits macOS verification.

## Verify deferred drag details and immutable generation branches

- Status: Pending
- Date/source: 2026-07-19, Windows
- Related commit: `9d1fb2a`
- Action: On an unlocked macOS session, drag a PNG and a NovelAI ZIP from Finder into the window. Confirm the first drag frame says it is reading file information or shows an accept state, never the unsupported state for a supported file. Then edit a source result's Prompt, Vibe, and Seed separately; confirm the first actual value change creates a branch draft, the source result remains unchanged after restart, draft edits persist, drafts can be discarded, and a draft marked as waiting can no longer be edited or discarded directly.
- Expected: Finder's delayed file-detail delivery does not cause a false rejection. Result metadata remains immutable, edits are isolated in branch recipes, legacy Prompt versions can be opened as new branches, and the branch rail plus inspector status fit the macOS window without disturbing the native menu/title bar.
- Observed: Windows completed a clean `npm ci`, 49 automated tests, and the production build. The user will verify the drag overlay and live branch interaction on Windows; macOS Finder timing and native-window layout still require verification.

## Verify shared selection controls and branch result upload

- Status: Pending
- Date/source: 2026-07-19, Windows
- Related commit: `8b48e2e`
- Action: On an unlocked macOS session, enable multi-select in the library and Prompt overview. Confirm both places use the same 18px selection mark and Lucide SVG check without a text/Emoji glyph. Create a branch, mark it waiting, upload a matching NovelAI PNG, and repeat with a PNG whose Prompt or Seed differs. Restart the app and inspect both branch cards.
- Expected: Selection controls have identical geometry, stroke and focus feedback on macOS. A matching PNG changes the branch to “结果匹配” and displays its thumbnail; a mismatch is imported without overwriting the recipe, records the differing fields, and displays “结果不匹配”. Existing native menu, title bar, Finder dialog and CJK fallback remain unchanged.
- Observed: Windows completed a clean `npm ci`, 55 automated tests and the production build. Static checks confirm all former text checkmarks were removed and shared Lucide components are used. Live macOS control rendering and Finder upload still require verification.

## Verify native context menus, creation series, and comparison experiments

- Status: Pending
- Date/source: 2026-07-19, Windows
- Related commits: `a4036ad`, `7a23e3e`, `a89095c`, `186ea4b`, `8c8f347`
- Action: On an unlocked macOS session, right-click text fields, library projects, Prompt tags, current/library Vibes, source results, and branches. Confirm native edit roles and item-specific actions appear without replacing the macOS application menu. Create a creation series, add the same result to multiple series, then select 2–4 related results and establish a comparison experiment. Open it and switch between visual comparison and parameter differences; add and remove a non-baseline member and restart the app.
- Expected: Native menus use macOS labels and keyboard conventions; Finder reveal actions remain valid. Series stay independent from collections and allow many-to-many membership. Experiments keep the baseline first, automatically recalculate fixed/variable/incomplete fields, identify single-variable versus mixed-variable comparisons, preserve the baseline in the filmstrip, and display 2–4 images without clipping. A mismatched branch upload preserves the expected recipe, shows expected/actual details, and creates an actual-result child branch.
- Observed: Windows completed a clean `npm ci`, 64 automated tests, and the production build. Computer Use verified the production window, Windows menu suppression, native project context menu, left-sidebar series/experiment sections, Prompt overview, CJK rendering, import completion, and the latest branch rail in a real window. macOS native menus, Finder behavior, title-bar layout, and the live experiment filmstrip still require verification.
