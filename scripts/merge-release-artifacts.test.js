import { describe, expect, it } from 'vitest';
import { mergeMacMetadata } from './merge-release-artifacts.mjs';
import { referencedArtifactNames } from './verify-update-artifacts.mjs';

const metadata = (arch, version = '1.0.0') => `version: ${version}
files:
  - url: Studio-${version}-${arch}.zip
    sha512: synthetic-${arch}
    size: 123
  - url: Studio-${version}-${arch}.dmg
    sha512: synthetic-dmg-${arch}
    size: 456
path: Studio-${version}-${arch}.zip
sha512: synthetic-${arch}
releaseDate: '2026-10-12T00:00:00.000Z'
`;
describe('release metadata merge', () => {
  it('preserves both architectures and every checksum', () => {
    const result = mergeMacMetadata([metadata('x64'), metadata('arm64')]);
    expect(referencedArtifactNames(result)).toHaveLength(4);
    expect(result).toContain('sha512: synthetic-arm64');
    expect(result).toContain('sha512: synthetic-x64');
    expect(result.match(/^files:/gm)).toHaveLength(1);
  });
  it('rejects mixed versions and incomplete architecture sets', () => {
    expect(() => mergeMacMetadata([metadata('x64'), metadata('arm64', '2.0.0')])).toThrow(
      'versions differ',
    );
    expect(() => mergeMacMetadata([metadata('x64'), metadata('x64')])).toThrow('arm64');
  });
});
