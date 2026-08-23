# Codex project instructions

## Platform support

NovelAI Prompt Studio is a cross-platform desktop application. Windows and macOS are both first-class development and release targets. Keep Linux compatibility where practical.

- Do not introduce platform-specific shell syntax into shared npm scripts.
- Use Node.js or cross-platform CLI arguments for shared automation.
- Treat filesystem paths, keyboard modifiers, window chrome, secure storage, and packaging as platform-sensitive code.
- Run `npm ci`, `npm test`, and `npm run build` only when the task makes explicit code changes, including source code, test code, shared scripts, build configuration, or dependency manifests. Do not run these commands for documentation-only changes, content or media asset changes, Skill/plugin installation, repository inspection, or other read-only/non-code operations.
- Startup, window behavior, shortcuts, file dialogs, and secure storage must be verified on the affected operating system when they change. Unless the user explicitly requests computer use, follow the manual verification workflow below.

## Manual application verification

- Do not use computer use, GUI automation, or simulated mouse and keyboard input for verification unless the user explicitly requests it in the current task.
- When code changes are present, continue to run applicable non-GUI checks such as linting, unit tests, integration tests, and production builds. This restriction applies to interactive application verification, not command-line checks, and does not require checks for non-code-only work.
- When a change needs interactive verification, create `doc/manual-verification-YYYYMMDD-<topic>.md` before handing the change back to the user. Do not claim that the interactive behavior has been verified.
- Write all manual verification documents in Chinese.
- The manual verification document must include the change or commit under test, target operating system, prerequisites, numbered verification steps, the expected result for every step, and empty fields for the observed result, overall result, and discovered issues.
- Tell the user which manual verification document to follow and wait for their result. Do not perform the listed steps automatically unless they subsequently request computer use.
- After the user reports that manual verification is complete, record the result they provide and move the document into `doc/archive/`. Preserve the filename unless it would collide with an existing archived document.
- Do not create a manual verification document when no interactive verification is needed.

## Cross-platform handoff

Read `coordination/README.md` before platform-sensitive work. Check the file for the other operating system for pending requests:

- Windows Codex writes requests that require macOS to `coordination/MACOS.md`.
- macOS Codex writes requests that require Windows to `coordination/WINDOWS.md`.

Only add a handoff when the work genuinely requires the other platform. Include the commit, exact action, expected result, and observed result. Mark completed items in place so both environments retain the history.

Keep `coordination/MACOS.md` and `coordination/WINDOWS.md` focused on current actionable requests. Before archiving a completed item, record its final status and observed result. Periodically move completed, superseded, or consolidated entries into `coordination/archive/` without deleting their history; archived entries are not active requests.

## Delivery workflow

After completing a code change:

1. Run the relevant tests and production build.
2. Commit the completed change with a focused message.
3. Push the current branch to its configured remote.

Never force-push. If the push is rejected or requires work from the other operating system, record an actionable handoff in `coordination/` and report the blocker.
