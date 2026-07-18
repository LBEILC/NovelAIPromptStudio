# Cross-platform coordination

This directory is the shared handoff channel between Codex sessions running on Windows and macOS.

## Files

- `WINDOWS.md`: work that must be performed or verified on Windows.
- `MACOS.md`: work that must be performed or verified on macOS.

## Handoff format

Add a short item containing:

- Status: `Pending`, `Completed`, or `Blocked`
- Date and source platform
- Related commit
- Exact action to perform
- Expected result
- Observed result when completed

Do not copy routine progress, large logs, secrets, credentials, or machine-specific personal paths into this directory. Commit handoff updates so the other environment receives them through Git.
