import { performance } from 'node:perf_hooks';

// Wall time from one event-loop turn to the next, including SQLite commit,
// JS/GC and result construction. No database-internal timing is substituted.
export async function observeTurns(operation) {
  let previous = performance.now();
  let maxBlockingMs = 0;
  let turns = 0;
  let active = true;
  const tick = () => {
    const now = performance.now();
    maxBlockingMs = Math.max(maxBlockingMs, now - previous);
    previous = now;
    turns++;
    if (active) setImmediate(tick);
  };
  setImmediate(tick);
  const start = performance.now();
  try {
    const value = await operation();
    await new Promise((resolve) => setImmediate(resolve));
    return { value, ms: performance.now() - start, maxBlockingMs, turns };
  } finally {
    active = false;
  }
}
