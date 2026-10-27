import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

if (process.platform !== 'darwin') throw Error('macOS packaging requires macOS');
const arch = process.argv[2];
if (!['--arm64', '--x64'].includes(arch)) throw Error('Expected --arm64 or --x64');
const env = { ...process.env };
const signed = Boolean(env.CSC_LINK);
let temporary;
try {
  if (signed) {
    // The legacy unsigned workflow disables discovery, even for an imported p12.
    env.CSC_IDENTITY_AUTO_DISCOVERY = 'true';
    for (const key of [
      'CSC_KEY_PASSWORD',
      'APPLE_API_KEY_P8',
      'APPLE_API_KEY_ID',
      'APPLE_API_ISSUER',
      'APPLE_TEAM_ID',
    ]) {
      if (!env[key]) throw Error(`Signing configured but ${key} is missing`);
    }
    temporary = await fs.mkdtemp(path.join(env.RUNNER_TEMP || os.tmpdir(), 'nps-notarize-'));
    env.APPLE_API_KEY = path.join(temporary, `AuthKey_${env.APPLE_API_KEY_ID}.p8`);
    await fs.writeFile(env.APPLE_API_KEY, env.APPLE_API_KEY_P8, { mode: 0o600 });
  } else {
    // A defined-but-empty CSC_LINK is interpreted as a relative filename.
    for (const key of [
      'CSC_LINK',
      'CSC_KEY_PASSWORD',
      'APPLE_API_KEY',
      'APPLE_API_KEY_ID',
      'APPLE_API_ISSUER',
      'APPLE_TEAM_ID',
    ])
      delete env[key];
  }
  delete env.APPLE_API_KEY_P8;
  delete env.APPLE_ID;
  delete env.APPLE_APP_SPECIFIC_PASSWORD;
  execFileSync(
    'npm',
    [
      'run',
      'package',
      '--',
      '--mac',
      arch,
      `-c.forceCodeSigning=${signed}`,
      `-c.mac.hardenedRuntime=${signed}`,
      `-c.extraMetadata.macSignedAndNotarized=${signed}`,
    ],
    { env, stdio: 'inherit' },
  );
} finally {
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
}
