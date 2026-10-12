export function timingMode(value, ci = process.env.CI) {
  const mode = value || (ci && !/^(false|0)$/i.test(ci) ? 'record' : 'strict');
  if (!['record', 'strict'].includes(mode)) throw Error('--timing must be record or strict');
  return mode;
}

export function timingSummary(checks) {
  return checks
    .filter((check) => check.timing)
    .map(({ category, label, theme, timing }) => ({ category, label, theme, ...timing }))
    .sort((a, b) => Number(b.overDouble) - Number(a.overDouble));
}

export function logTimings(timings) {
  console.log('计时汇总（超过期限两倍的项目在前）：');
  console.table(
    timings.map(({ category, label, deadlineMs, elapsedMs, result, overDouble }) => ({
      分类: category,
      项目: label,
      '期限 ms': deadlineMs,
      '实际 ms': elapsedMs,
      结果: result,
      超过两倍: overDouble,
    })),
  );
}
