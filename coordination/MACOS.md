# macOS handoffs

## Verify packaged macOS release artifacts

- Status: Pending
- Date/source: 2026-07-22, Windows
- Related commit: `005d362`
- Action: Download both macOS DMGs produced by the `v0.1.2` GitHub Release. On an Intel Mac, install and launch `NovelAI-Prompt-Studio-0.1.2-macOS-x64.dmg`; on Apple Silicon, install and launch `NovelAI-Prompt-Studio-0.1.2-macOS-arm64.dmg`. Confirm the app icon, hidden-inset title bar, native menu, font discovery, image picker, database startup, and one NovelAI image import work normally. Record the expected unsigned-app warning and use the standard macOS override flow to open the app.
- Expected: Both architecture-specific DMGs mount and install, the app starts without a missing native module or ASAR error, and core window/file/database behavior matches development builds. The unsigned warning is expected until Apple signing and notarization credentials are configured.
- Observed: GitHub Actions produced both `v0.1.2` macOS DMGs after the `v0.1.1` Windows installation exposed a missing packaged `src/lib/prompt.js`. Windows verified the corrected ASAR contains every shared module and the unpacked app starts normally. Live macOS startup remains to be verified.

## Verify system font discovery and previews

- Status: Pending
- Date/source: 2026-07-22, Windows
- Related commit: `f49d13e`
- Action: On an unlocked macOS session, run `npm ci`, `npm test`, `npm run build`, launch the production app, and open 设置 → 外观. Confirm the non-monospace and monospace selectors finish loading installed macOS font families, searching works, every option previews itself, and selecting one font in each role persists after restart. Open an image whose prompt uses trailing-comma brace groups such as `{artist:a, artist:b, } {best quality, masterpiece, }` and confirm four clean Tags appear without braces.
- Expected: Font discovery falls back from the bundled macOS helper to `system_profiler` if needed; the UI remains responsive, Tag/Prompt text uses only the chosen monospace family, other UI text uses only the chosen interface family, and existing Geist/HarmonyOS choices migrate cleanly. Legacy single-brace groups flatten while `{{tag}}` emphasis remains intact.
- Observed: Windows clean-installed 700 packages with zero vulnerabilities, discovered 92 installed font families, passed 58 automated tests and the production build. macOS font discovery, Finder-installed fonts, and restart persistence remain to be verified.

## Verify phase 2 gallery, migration backup, and Finder behavior

- Status: Pending
- Date/source: 2026-07-22, Windows
- Related commit: `18386b7`
- Action: On an unlocked macOS session, run `npm ci`, `npm test`, `npm run build`, and launch the production app with an existing pre-phase2 user database. Confirm `data/studio.pre-phase2.sqlite` is created once and is not overwritten on the next launch. Drag images and a ZIP from Finder into 图片库, preview an image, use its context menu to open it in 工作台, reveal it in Finder, and remove one imported copy after confirmation. Also drag a single image into 工作台 and verify it is parsed without being added to 图片库.
- Expected: The app exposes only 工作台 and 图片库 as business pages; AI translation/classification and read-only Vibe copying remain available. Gallery import persists assets, Workbench import stays transient, removal only deletes application-owned copies, and the native menu, hidden-inset title bar, Finder paths, dialogs, and drag overlay behave normally. Old Tag/Vibe library, branch, version, series, experiment, relationship, and comparison handoffs below are superseded and no longer require product verification.
- Observed: Windows completed a clean `npm ci`, 49 automated tests, Electron syntax checks, and the production build. Per user request, live desktop verification was left to the user; macOS native behavior remains to be verified.

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

## Verify Lobe UI migration foundation and interaction components

- Status: Pending
- Date/source: 2026-07-19, Windows
- Related commits: `e9be14b` through `23c53c4`
- Action: Check out `codex/lobe-ui-migration-spike`, run `npm ci`, `npm test`, `npm run build`, and launch the production app. Confirm Geist, Geist Mono, and HarmonyOS Sans SC load from packaged assets while offline. Open appearance settings and switch between dark, light, and follow-system modes; restart after each saved mode. Check the migrated shell, library organization, Prompt overview/editor, Vibe library/editor, metadata, branch rail, comparison experiment, import feedback, settings, and shared selection controls. Confirm permanent selected states use complete tinted surfaces or full borders without one-sided blue strips; verify the import button and outlined search field align within the library sidebar. In Prompt overview, hover and switch every segmented option and confirm no native black title popup appears. Verify Toast, Alert, Empty, AutoComplete, raw-metadata Collapse/Highlighter, SliderWithInput controls and cached Information marks. Reorder a right-panel Tag with the SortableList pointer and keyboard sensors, cancel one drag, and confirm the overlay does not clip. Confirm the main three-column workspace and version rail retain full height. Inspect the native application menu, hidden-inset title bar, focus rings, and control clipping at minimum and default window sizes.
- Expected: The default theme is `slate + blue`; all three theme modes persist and maintain readable contrast. No font request uses a remote CDN. Lobe controls render without hydration or style-order errors, the root theme container fills the window, and macOS native menu/title-bar behavior is preserved. Segmented controls have stable 26/32px item sizing with no browser title tooltip; sliders retain numeric input and cached markers; Tag drag previews remain inside the work area. The `@emoji-mart/react` React 19 peer warning may appear during install but must not cause a runtime failure.
- Observed: Windows completed a clean `npm ci`, passed 71 automated tests and the production build through `23c53c4`. Computer Use verified the final dark/light settings and main workspace, saved-theme persistence, bundled CJK typography, removal of one-sided selected-state accents, aligned import/search controls, migrated library/Prompt/Vibe/metadata/branch/compare surfaces, Windows menu suppression, and the full-height theme root. It also verified the new Base UI segmented controls without the reported black title popup, Lobe empty/warning surfaces, AutoComplete layout, numeric sliders, Vibe library edit state, and the SortableList Tag layout. Awaiting macOS install and UI verification.

## Verify the two-page workbench and Finder drag semantics

- Status: Pending
- Date/source: 2026-07-22, Windows
- Related commit: `cd7a90c`
- Action: On an unlocked macOS session, launch the production app and confirm it opens on 工作台 with only 工作台 and 图片库 in the primary navigation. Drag one NovelAI PNG from Finder into 工作台, edit, translate, classify, reorder and copy Tags, then restart and confirm the single workbench draft is restored. Confirm the image was not added to 图片库. Repeat with the native file picker, then drag two images and a ZIP onto 工作台 and confirm both are rejected. Open 图片库, drag in one image and confirm it is persistently imported; click it and use its context menu to open it in 工作台. Check a PNG containing Vibe metadata and confirm its encoding is read-only and copyable. Verify the hidden-inset title bar, native application menu, Finder paths with spaces/CJK characters, and light/dark themes.
- Expected: 工作台 drops parse exactly one PNG/JPG/WEBP without copying it into application assets, while 图片库 drops retain the existing persistent importer. Replacing a modified workbench draft requires confirmation. Tag translation and classification reuse the existing secure AI settings and cache without changing copied Prompt text. No Tag/Vibe library, branch, series, experiment, relationship or comparison entry is reachable from the new navigation or simplified gallery. Native macOS window controls remain visible throughout the full-window drag overlay.
- Observed: Windows completed a clean `npm ci`, all 84 automated tests, Electron syntax checks, and the production build for `cd7a90c`. Per user request, live desktop verification was left to the user; Finder drag timing and native macOS window behavior remain to be verified.

## Verify on-demand embedded Vibe file export

- Status: Pending
- Date/source: 2026-07-22, Windows
- Related commit: `7d429b7`
- Action: On an unlocked macOS session, open a NovelAI image containing embedded Vibe metadata in 工作台 and click “在文件夹中显示”. Confirm Finder selects a generated `.naiv4vibe` file, then import that file into NovelAI and verify the Vibe is accepted with the embedded model, Reference Strength, and Information Extracted values.
- Expected: The app creates or updates one hash-named `.naiv4vibe` under its Vibe asset directory, reveals it through the existing cross-platform shell action, and does not add a Vibe library or expose encoding-copy controls.
- Observed: Windows passed 47 automated tests, Electron syntax checks, and the production build. The export unit test verifies the NovelAI Vibe transfer identifier, version, encoding, model, strength, and Information Extracted fields; live Finder selection and NovelAI import remain to be verified on macOS.

## Verify custom resource library migration and expanded tag categories

- Status: Pending
- Date/source: 2026-07-22, Windows
- Related commit: `697ef72`
- Action: On an unlocked macOS session, open Settings > 资源库, confirm the current Application Support assets path, choose a new empty folder on another volume if available, confirm the native folder picker and confirmation dialog, migrate assets, observe progress, verify images, thumbnails, and Vibe exports remain accessible, and confirm Finder opens the new location. Restart the app and confirm the path persists. Also inspect the 10 category filters and right-click categories in light and dark themes, and run AI classification if configured.
- Expected: Native folder dialogs and Finder behavior follow macOS conventions; migration copies and verifies files before deleting the old folder, rewrites gallery paths, persists across restart, rejects non-empty or nested folders, and category labels fit without clipping. Legacy Artist, Character, Scene, and Style tags load into the expanded taxonomy.
- Observed: Windows clean `npm ci`, 67 tests, Electron syntax checks, and the production build passed. Live macOS volume migration, native dialogs, Finder reveal, and label layout await verification.
