import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_APP_PROFILE = 'default';

const PROFILE_OPTION = '--profile';
const PROFILE_PREFIX = `${PROFILE_OPTION}=`;
const PROFILE_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function parseAppProfile(argv = []) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index] || '');
    if (argument === PROFILE_OPTION) {
      const value = String(argv[index + 1] || '');
      if (!value || value.startsWith('--')) throw new Error('参数 --profile 缺少 Profile 名称');
      values.push(value);
      index += 1;
    } else if (argument.startsWith(PROFILE_PREFIX)) {
      values.push(argument.slice(PROFILE_PREFIX.length));
    }
  }

  if (values.length > 1) throw new Error('参数 --profile 只能指定一次');
  const profile = String(values[0] || DEFAULT_APP_PROFILE).trim().toLowerCase();
  if (!PROFILE_PATTERN.test(profile)) {
    throw new Error('Profile 名称只能包含小写字母、数字和连字符，长度为 1 至 32 个字符');
  }
  return profile;
}

export function appProfileDirectories(appDataDirectory, appName, profile) {
  const normalizedProfile = parseAppProfile([`${PROFILE_OPTION}=${profile}`]);
  if (normalizedProfile === DEFAULT_APP_PROFILE) return null;
  const rootDirectory = path.join(path.resolve(appDataDirectory), `${String(appName || '').trim()}-${normalizedProfile}`);
  return {
    rootDirectory,
    sessionDataDirectory: path.join(rootDirectory, 'session'),
  };
}

export function configureAppProfile(app, options = {}) {
  const profile = parseAppProfile(options.argv || process.argv);
  if (profile === DEFAULT_APP_PROFILE) {
    return {
      profile,
      isDefault: true,
      rootDirectory: app.getPath('userData'),
      sessionDataDirectory: app.getPath('sessionData'),
    };
  }

  const fileSystem = options.fileSystem || fs;
  const directories = appProfileDirectories(app.getPath('appData'), app.getName(), profile);
  fileSystem.mkdirSync(directories.rootDirectory, { recursive: true });
  fileSystem.mkdirSync(directories.sessionDataDirectory, { recursive: true });
  app.setPath('userData', directories.rootDirectory);
  app.setPath('sessionData', directories.sessionDataDirectory);
  return { profile, isDefault: false, ...directories };
}
