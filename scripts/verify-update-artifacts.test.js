import { describe, expect, it } from 'vitest';
import { referencedArtifactNames } from './verify-update-artifacts.mjs';

describe('updater artifact verification', () => {
  it('extracts every referenced installer from electron-builder metadata', () => {
    const metadata = `
files:
  - url: NovelAI-Prompt-Studio-Setup-0.4.1-x64.exe
    sha512: abc
path: NovelAI-Prompt-Studio-Setup-0.4.1-x64.exe
sha512: abc
`;

    expect(referencedArtifactNames(metadata)).toEqual([
      'NovelAI-Prompt-Studio-Setup-0.4.1-x64.exe',
    ]);
  });

  it('decodes quoted and URL-encoded artifact names', () => {
    const metadata = `
files:
  - url: "NovelAI%20Prompt%20Studio-0.4.1-arm64.zip"
path: 'NovelAI%20Prompt%20Studio-0.4.1-arm64.zip'
`;

    expect(referencedArtifactNames(metadata)).toEqual([
      'NovelAI Prompt Studio-0.4.1-arm64.zip',
    ]);
  });
});
