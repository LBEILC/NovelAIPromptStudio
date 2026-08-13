# Cross-platform coordination

This directory is the shared handoff channel between Codex sessions running on Windows and macOS.

## Files

- `WINDOWS.md`: current work that must be performed or verified on Windows.
- `MACOS.md`: current work that must be performed or verified on macOS.
- `archive/`: completed, superseded, or consolidated handoff history that no longer represents active work.

## Handoff format

Add a short item containing:

- Status: `Pending`, `Completed`, or `Blocked`
- Date and source platform
- Related commit
- Exact action to perform
- Expected result
- Observed result when completed

Do not copy routine progress, large logs, secrets, credentials, or machine-specific personal paths into this directory. Commit handoff updates so the other environment receives them through Git.

## Lifecycle

1. Add only work that genuinely requires the other operating system.
2. Keep `Pending` and genuinely blocked current requests in the platform file.
3. When work completes, record `Completed` and the observed result before archiving it.
4. During periodic cleanup, move completed, superseded, or consolidated entries into `archive/` while preserving their original actions and observations.
5. Do not treat an archived status as a current request. If a historical issue becomes relevant again, create a new focused entry in the current platform file and link back to the archived record.
