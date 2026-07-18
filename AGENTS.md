# Codex project instructions

## Platform support

NovelAI Prompt Studio is a cross-platform desktop application. Windows and macOS are both first-class development and release targets. Keep Linux compatibility where practical.

- Do not introduce platform-specific shell syntax into shared npm scripts.
- Use Node.js or cross-platform CLI arguments for shared automation.
- Treat filesystem paths, keyboard modifiers, window chrome, secure storage, and packaging as platform-sensitive code.
- Test platform-neutral changes with `npm ci`, `npm test`, and `npm run build`.
- Test startup, window behavior, shortcuts, file dialogs, and secure storage on the affected operating system when they change.

## Cross-platform handoff

Read `coordination/README.md` before platform-sensitive work. Check the file for the other operating system for pending requests:

- Windows Codex writes requests that require macOS to `coordination/MACOS.md`.
- macOS Codex writes requests that require Windows to `coordination/WINDOWS.md`.

Only add a handoff when the work genuinely requires the other platform. Include the commit, exact action, expected result, and observed result. Mark completed items in place so both environments retain the history.

## Delivery workflow

After completing a code change:

1. Run the relevant tests and production build.
2. Commit the completed change with a focused message.
3. Push the current branch to its configured remote.

Never force-push. If the push is rejected or requires work from the other operating system, record an actionable handoff in `coordination/` and report the blocker.
