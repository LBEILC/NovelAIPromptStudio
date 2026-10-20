import { describe, expect, it } from 'vitest';
import { feedbackDiagnostics } from './SettingsPage';

describe('feedback diagnostics', () => {
  it('limits diagnostics to version and platform', () => {
    expect(feedbackDiagnostics('0.9.2', 'darwin')).toBe(
      'NovelAI Prompt Studio v0.9.2\n平台：macOS',
    );
    expect(feedbackDiagnostics('0.9.2', 'win32')).toBe(
      'NovelAI Prompt Studio v0.9.2\n平台：Windows',
    );
  });
});
