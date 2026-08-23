import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  appProfileDirectories,
  configureAppProfile,
  DEFAULT_APP_PROFILE,
  parseAppProfile,
} from './appProfile.js';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('application profiles', () => {
  it('keeps ordinary launches on the default profile', () => {
    expect(parseAppProfile(['electron', '.'])).toBe(DEFAULT_APP_PROFILE);
    expect(parseAppProfile(['electron', '.', '--profile=default'])).toBe(DEFAULT_APP_PROFILE);
  });

  it('accepts both supported profile argument forms and canonicalizes case', () => {
    expect(parseAppProfile(['electron', '.', '--profile=demo'])).toBe('demo');
    expect(parseAppProfile(['electron', '.', '--profile', 'Screenshots-2026'])).toBe('screenshots-2026');
  });

  it('rejects missing, repeated, and path-like profile names', () => {
    expect(() => parseAppProfile(['electron', '.', '--profile'])).toThrow('缺少');
    expect(() => parseAppProfile(['electron', '.', '--profile=demo', '--profile=test'])).toThrow('只能指定一次');
    expect(() => parseAppProfile(['electron', '.', '--profile=../demo'])).toThrow('只能包含');
    expect(() => parseAppProfile(['electron', '.', '--profile=demo profile'])).toThrow('只能包含');
  });

  it('creates a sibling user-data root for a named profile', () => {
    const appDataDirectory = path.join('C:', 'Users', 'Example', 'AppData', 'Roaming');
    expect(appProfileDirectories(appDataDirectory, 'NovelAI Prompt Studio', 'demo')).toEqual({
      rootDirectory: path.join(path.resolve(appDataDirectory), 'NovelAI Prompt Studio-demo'),
      sessionDataDirectory: path.join(path.resolve(appDataDirectory), 'NovelAI Prompt Studio-demo', 'session'),
    });
    expect(appProfileDirectories(appDataDirectory, 'NovelAI Prompt Studio', 'default')).toBeNull();
  });

  it('overrides userData and sessionData before a named profile starts', () => {
    const appDataDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-app-profile-'));
    temporaryDirectories.push(appDataDirectory);
    const paths = {
      appData: appDataDirectory,
      userData: path.join(appDataDirectory, 'NovelAI Prompt Studio'),
      sessionData: path.join(appDataDirectory, 'NovelAI Prompt Studio'),
    };
    const changes = [];
    const app = {
      getName: () => 'NovelAI Prompt Studio',
      getPath: (name) => paths[name],
      setPath: (name, value) => {
        expect(fs.existsSync(value)).toBe(true);
        paths[name] = value;
        changes.push([name, value]);
      },
    };

    const configured = configureAppProfile(app, { argv: ['electron', '.', '--profile=demo'] });
    const expectedRoot = path.join(appDataDirectory, 'NovelAI Prompt Studio-demo');
    expect(configured).toEqual({
      profile: 'demo',
      isDefault: false,
      rootDirectory: expectedRoot,
      sessionDataDirectory: path.join(expectedRoot, 'session'),
    });
    expect(changes).toEqual([
      ['userData', expectedRoot],
      ['sessionData', path.join(expectedRoot, 'session')],
    ]);
  });

  it('does not change application paths for the default profile', () => {
    const app = {
      getPath: (name) => `default-${name}`,
      setPath: () => { throw new Error('default profile must not set a path'); },
    };
    expect(configureAppProfile(app, { argv: ['electron', '.'] })).toEqual({
      profile: 'default',
      isDefault: true,
      rootDirectory: 'default-userData',
      sessionDataDirectory: 'default-sessionData',
    });
  });
});
