# macOS handoffs

Only current actionable macOS requests are kept here. Earlier completed, superseded, and overlapping checks are preserved in [`archive/MACOS-through-20260812.md`](./archive/MACOS-through-20260812.md).

## Verify dependency security refresh and macOS packaging

- Status: Pending
- Date/source: 2026-08-14, Windows
- Related commit: `545ea46`
- Action: Check out current `main` containing `545ea46`, run `npm ci`, `npm audit`, `npm test`, `npm run build`, and `npm run package -- --mac`. Confirm the audit reports zero vulnerabilities, the DMG/ZIP and update metadata are generated successfully, then launch the packaged app and perform one update check from Settings.
- Expected: The clean install remains reproducible on macOS with zero reported vulnerabilities; tests, production build, native dependency rebuild, DMG/ZIP packaging, packaged startup, and update metadata parsing all succeed without regressions.
- Observed: Windows clean install and audit reported zero vulnerabilities; all 143 tests, the production build, the Windows NSIS package, and `latest.yml` artifact verification passed. macOS verification is pending.

## Verify the current desktop shell, fonts, and persisted panel layout

- Status: Pending
- Date/source: 2026-08-13, Windows
- Related commits: `52df853`, `77c79ba`, `51bd5b6`, `f49d13e`, `f300cb7`, `aba2e41`
- Action: On an unlocked macOS session, check out the current `main`, run `npm ci`, `npm test`, `npm run build`, and `npm run package -- --mac`. Launch the packaged app and inspect the default and minimum window sizes, hidden-inset title bar, native application menu, app icon, CJK fallback, light/dark/follow-system themes, system font discovery/search/preview, and font persistence after restart. Resize the Workbench left panel and Gallery right panel to different widths, then follow `doc/manual-verification-20260818-panel-state-persistence.md` to verify page switching and full-restart restoration of Workbench/Gallery expanded state plus the Gallery fixed/floating mode.
- Expected: Development and packaged startup remain cross-platform; the window fits the usable work area; native macOS chrome and menus remain intact; installed fonts load without blocking the UI; selected interface and Prompt fonts persist; both side panels retain independent bounded widths and expanded/collapsed state, while the Gallery also retains its fixed/floating mode. Explicitly opening another Gallery image may reopen the preview, but ordinary page changes and restarts must not override a collapsed preference.
- Observed: On 2026-08-13, current `main` at `d16a034` passed `npm ci`, all 133 tests in 29 files, and the production build on Apple Silicon macOS 26.3.1. An unsigned arm64 DMG/ZIP package and their blockmaps plus `latest-mac.yml` were generated successfully with certificate auto-discovery disabled. The packaged app launched with the native hidden-inset traffic lights, application menu, app icon, correct CJK rendering, and a usable default window. System font discovery returned 246 interface-font choices and 14 monospace choices without blocking the UI; search and live previews worked. Light, dark, and follow-system appearance settings worked, and the selected PingFang SC and Menlo fonts plus follow-system appearance survived restart. Workbench left-panel resizing also worked. Windows non-GUI checks for `aba2e41` passed all 157 tests, the production build, and the Lobe UI audit. Minimum-window layout, independent Gallery panel resizing, both panel widths after restart, and the new panel-state persistence behavior still need macOS verification, so this consolidated handoff remains pending.

## Verify current Workbench input, Prompt, session, and Vibe export flows

- Status: Pending
- Date/source: 2026-08-13, Windows
- Related commits: `7403d61`, `5edbaa5`, `3033e80`, `8e1fef5`, `cd7a90c`, `7d429b7`
- Action: In the packaged app, open one and several NovelAI images from Finder, drag several supported images into Workbench, and open a file-backed and bitmap-only clipboard image. Confirm every image creates or reuses the correct tab, ordinary text-field paste is not intercepted, `Cmd+W`, `Cmd+Tab`, and `Cmd+Shift+Tab` follow macOS conventions, and all tabs/drafts restore after restart. Exercise Prompt/Undesired, Base/Character, category, search, and language filters; verify visible, full, Base, Character, and selected copying preserves original NovelAI syntax and never mixes Undesired tags into positive Prompt output. Check Character ordering/position editing and reveal one embedded `.naiv4vibe` export in Finder.
- Expected: File, drag, clipboard, shortcut, session, Prompt serialization, and Finder reveal behavior match the current two-page product boundary. CJK paths, spaces, and parentheses work; bitmap-only clipboard input reports missing metadata without failing; copied Prompt remains lossless; Workbench never adds source images to Gallery automatically.
- Observed: On 2026-08-13, the unsigned packaged arm64 app opened NovelAI images from the native file dialog using CJK names containing spaces and parentheses, parsed Base/Character/Undesired Prompt data and an embedded Vibe, reused an already-open file tab, and created a second tab for a different file. `Cmd+W`, `Cmd+Tab`, and `Cmd+Shift+Tab` behaved normally, while pasting into an ordinary search field was not intercepted. Prompt/Base filtering and visible, full, Base, Character, and selected-copy actions retained the original brace and artist syntax; selected negative Character tags were excluded from positive selected-copy output. Character position/order controls worked, and an embedded `.naiv4vibe` export was revealed in Finder. Two file-backed tabs, the active tab, a modified draft, fonts, and appearance restored after restart, and opening files in Workbench did not add them to Gallery. Bitmap-only clipboard input opened without failing, but it did **not** report the required missing-metadata warning in either Workbench or Gallery; that issue and the remaining drag/filter matrix keep this handoff pending.

## Verify wrapped Workbench Tag reorder motion and stability

- Status: Pending
- Date/source: 2026-08-12, Windows
- Related commit: `d6d4d01`
- Action: On an unlocked macOS session, follow the archived Windows checklist at `doc/archive/manual-verification-20260812-workbench-tag-sort-motion-stability.md`, extending it with visible cross-row displacement, reversals between adjacent Tags, 30–60 second drags, original Tag styles and spacing, and Full/Follow System/Off motion settings.
- Expected: Motion animates only the actual x/y position change for real flex reordering; Tags do not stretch or leave synthetic gaps. Reordering occurs only from pointer movement after crossing a target midpoint, so flex reflow cannot restart the previous feedback loop.
- Observed: Windows interactive verification passed and 107 tests plus the production build completed for the related change. macOS interactive verification remains pending.

## Verify current Gallery import, grouping, trash, and resource migration flows

- Status: Pending
- Date/source: 2026-08-13, Windows
- Related commits: `b9bde69`, `18386b7`, `697ef72`, `8e1fef5`
- Action: In the packaged app, import images and a standard NovelAI ZIP through the native dialog, Finder drag-and-drop, and the clipboard, including paths with CJK characters, spaces, and parentheses. Confirm duplicate bytes are skipped, same-Prompt results form the correct group, group cover selection persists, and the current view, search, and sort results remain correct. With disposable test images, verify multi-select acts on the whole selected group while detail actions affect only the current image; exercise trash, restore, permanent delete, and empty trash. If an alternate volume is available, migrate the managed resource library to an empty folder, restart, reveal it in Finder, and confirm images, thumbnails, and embedded Vibe exports remain accessible.
- Expected: Native dialogs and Finder drag semantics remain correct; ZIP entry names and duplicate detection are stable; grouping never merges different Prompt semantics; destructive actions clearly state their scope and never touch files outside the managed resource directory; migration copies and verifies assets before retiring the old location and survives restart.
- Observed: On 2026-08-13, the unsigned packaged arm64 app imported a NovelAI ZIP whose path and entry names contained CJK characters, spaces, and parentheses. It imported three distinct images, grouped the two semantically identical Prompts together, kept the different Prompt separate, and skipped a byte-for-byte duplicate on reimport. Clipboard pixel import completed without crashing, Gallery search reduced the result set correctly, sorting switched between recent and earliest import, grouped-member navigation worked, and selecting a different group cover succeeded. Workbench-opened files did not appear in Gallery until explicitly imported. Trash/restore scope, permanent deletion, empty trash, resource migration, panel persistence, and a restart check for the selected group cover remain pending; bitmap-only clipboard import also lacks the required missing-metadata warning noted in the Workbench handoff.

## Verify Gallery density slider and shared hover previews

- Status: Pending
- Date/source: 2026-08-18, Windows
- Related commits: `d549f23`, `acff1c9`, `d7f8f98`
- Action: On an unlocked macOS session, follow `doc/manual-verification-20260818-gallery-density-hover-preview.md` and `doc/manual-verification-20260818-preview-pass-through-gallery-double-click.md`. Pay particular attention to trackpad and keyboard control of the thumbnail-size slider, toolbar wrapping at the minimum window width, hover delay while moving across many cards, popup collision near every window edge, light/dark and reduced/off motion modes, and restoration of the selected density after page changes and a full restart. Move the pointer directly onto Gallery cards, Prompt Tags, and Workbench tabs visually covered by their hover previews. Double-click a standalone Gallery card and a grouped card with a known cover, and confirm each opens the intended image in Workbench while Trash remains non-editable.
- Expected: The slider continuously changes the image-first grid between comfortable, compact, and overview density without clipping selection or grouped-card indicators; Gallery, Tag, and Workbench-tab hover previews preserve their content and remain transparent to pointer hit testing over underlying targets. Hover layers never block click, selection, context menus, or drag behavior. A Gallery double-click opens the standalone image or current group cover in Workbench, and the chosen density persists across restarts on macOS.
- Observed: Windows non-GUI checks completed through `d7f8f98`: all 161 tests, the production build, and the Lobe UI audit passed. The Gallery pointer-blocking issue reported during initial Windows use was fixed in `acff1c9`; the same visual-only behavior is now applied to Tag and Workbench-tab hover previews. Interactive Windows retesting and macOS verification remain pending.

## Verify manual update mode for unsigned macOS builds

- Status: Pending
- Date/source: 2026-08-12, Windows
- Related commits: `cf3dcc9`, `869a947`
- Action: Launch an unsigned packaged build, open Settings → About & Updates, and confirm it identifies the build as `macOS · 手动更新`. Check for updates and verify the app reads the latest stable GitHub Release without enabling in-app download or restart/install actions. When a newer version exists, confirm `下载 macOS 安装包` opens only the official `LBEILC/NovelAIPromptStudio` Release URL. Also confirm the package contains Intel and Apple Silicon DMG/ZIP artifacts, blockmaps, and a valid merged `latest-mac.yml` when built by the release workflow.
- Expected: Unsigned macOS builds can check versions and render release notes but cannot initialize an unsupported automatic installation flow. Every offered external URL stays within the official repository, and release metadata references generated artifacts for both architectures.
- Observed: GitHub Actions has successfully produced the unsigned multi-architecture artifacts and update metadata. On 2026-08-13, the local unsigned arm64 package identified itself as `macOS · 手动更新`, displayed version 0.4.2 and safely rendered the latest stable v0.4.2 release notes, and an explicit update check completed without exposing unsupported in-app download or restart/install controls. The packaged output contained arm64 DMG/ZIP artifacts, both blockmaps, and valid local `latest-mac.yml`. Because no newer stable release was available, the newer-version `下载 macOS 安装包` URL action could not be exercised; this handoff remains pending for that final live check.

## Verify signed, notarized, and automatic macOS updates when credentials exist

- Status: Blocked
- Date/source: 2026-08-13, Windows
- Related commits: `cf3dcc9`, `869a947`
- Action: After Apple distribution signing and notarization credentials are configured, build a signed release, validate it with `codesign`, Gatekeeper, and notarization checks on macOS, then update from an older signed release through the application and confirm download progress, restart/install, and workbench draft preservation.
- Expected: The signed app passes platform validation, enables the supported automatic update mode, downloads only matching signed artifacts, installs successfully, and preserves local data, settings, Gallery assets, and Workbench sessions.
- Observed: Blocked because no Apple distribution signing/notarization credentials are currently configured. Unsigned manual-update behavior is tracked separately above.
