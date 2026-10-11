// UI feedback budgets; startup, I/O and intentional lifetimes use separate waits.
export const UI_FEEDBACK_MS = 200;
export const TOOLTIP_SCROLL_CLOSE_MS = 100;

// Self-contained so the harness can execute it inside the renderer. The deadline
// starts before the action, and a late timer must never accept a late result.
export async function waitForFeedback(predicate, timeoutMs, action = () => {}) {
  const deadline = performance.now() + timeoutMs;
  action();
  while (performance.now() <= deadline) {
    let passed = false;
    try {
      passed = (await predicate()) === true;
    } catch {
      // A React commit may temporarily remove the node being inspected.
    }
    if (performance.now() > deadline) return false;
    if (passed) return true;
    await new Promise((resolve) =>
      setTimeout(resolve, Math.min(5, Math.max(0, deadline - performance.now()))),
    );
  }
  return false;
}
