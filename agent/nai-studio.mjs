#!/usr/bin/env node
import { main } from './client.mjs';
try {
  const result = await main();
  process.stdout.write(JSON.stringify(result) + '\n');
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      error: {
        code:
          error.code &&
          ['invalid_input', 'not_found', 'conflict', 'forbidden', 'app_busy'].includes(error.code)
            ? error.code
            : 'invalid_input',
        message: error.message,
      },
    }) + '\n',
  );
  process.exitCode = 1;
}
