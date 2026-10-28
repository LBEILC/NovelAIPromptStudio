import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';

export const retryDelays = Object.freeze([15_000, 30_000, 60_000, 120_000]);

export function isStaplerNetworkFailure(output) {
  // Permanent failures take precedence even when diagnostics mention CloudKit.
  if (
    /signature.*invalid|invalid.*signature|ticket.*(not found|does not exist)|record not found|status["\s:]+(?:Invalid|Rejected)/i.test(
      output,
    )
  )
    return false;
  return /Error\s+68\b|-1005\b|NSURLErrorDomain|CloudKit/i.test(output);
}

export function runCommand(command, args) {
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    console.log(output.trim());
    return output;
  } catch (error) {
    // Do not include command arguments: notarytool arguments contain credentials.
    throw new Error(`${command} failed: ${error.stdout || ''}${error.stderr || ''}`, {
      cause: error,
    });
  }
}

export async function runStapler(
  action,
  app,
  { run = runCommand, wait = setTimeout, log = console.log } = {},
) {
  if (!['staple', 'validate'].includes(action)) throw new Error('Unsupported stapler action');
  for (let attempt = 0; ; attempt++) {
    try {
      return await run('xcrun', ['stapler', action, app]);
    } catch (error) {
      if (attempt >= retryDelays.length || !isStaplerNetworkFailure(error.message)) throw error;
      const delay = retryDelays[attempt];
      log(
        `stapler ${action}: retry ${attempt + 2}/5 in ${delay / 1000}s: ${error.message.replace(/\s+/g, ' ')}`,
      );
      await wait(delay);
    }
  }
}
