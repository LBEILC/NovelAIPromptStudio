import type { ReactNode } from 'react';
import { changeText, diffSummary, oneLine, type VersionDiff } from '../lib/versionDiff';

export function VersionSummary({
  diff,
  compact = false,
}: {
  diff: VersionDiff;
  compact?: boolean;
}) {
  const text = compact ? oneLine(diff) : diffSummary(diff);
  const pieces: ReactNode[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const next = diff.items
      .map((item) => ({ item, at: text.indexOf(changeText(item), cursor) }))
      .filter((item) => item.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    if (!next) {
      pieces.push(text.slice(cursor));
      break;
    }
    pieces.push(text.slice(cursor, next.at));
    const value = changeText(next.item);
    pieces.push(
      <span key={cursor} className={`wb-change-${next.item.kind}`}>
        {value}
      </span>,
    );
    cursor = next.at + value.length;
  }
  return <span className="wb-version-summary">{pieces}</span>;
}

// Preserve the reference's word-level additions and deletions in paragraph comparisons.
function words(before: string, after: string) {
  const a = before.split(/(\s+)/),
    b = after.split(/(\s+)/);
  const matrix = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      matrix[i][j] =
        a[i] === b[j] ? matrix[i + 1][j + 1] + 1 : Math.max(matrix[i + 1][j], matrix[i][j + 1]);
  const old: ReactNode[] = [],
    now: ReactNode[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      old.push(a[i++]);
      now.push(b[j++]);
    } else if (j < b.length && (i >= a.length || matrix[i][j + 1] >= matrix[i + 1][j])) {
      now.push(/^\s+$/.test(b[j]) ? b[j] : <ins key={j}>{b[j]}</ins>);
      j++;
    } else {
      old.push(/^\s+$/.test(a[i]) ? a[i] : <del key={i}>{a[i]}</del>);
      i++;
    }
  }
  return { old, now };
}
export function VersionDifference({
  diff,
  title,
  against,
}: {
  diff: VersionDiff;
  title: string;
  against: string;
}) {
  const groups = [...new Set(diff.items.map((item) => item.label))];
  const count = diff.items.length + diff.paras.length + (diff.size ? 1 : 0);
  return (
    <>
      <header className="wb-diff-head">
        <b>{title}</b>
        <span className="nps-help">
          与{against}相比{count ? ` · ${count} 处改动` : ''}
        </span>
      </header>
      {diff.size && (
        <section className="wb-diff-group">
          <span className="wb-diff-label">参数</span>
          <div className="wb-diff-tags">
            尺寸 {diff.size.from.join('×')} → {diff.size.to.join('×')}
          </div>
        </section>
      )}
      {groups.map((label) => (
        <section className="wb-diff-group" key={label}>
          <span className="wb-diff-label">{label}</span>
          <div className="wb-diff-tags">
            {diff.items
              .filter((item) => item.label === label)
              .map((item, index) => (
                <span key={index} className={`wb-change-${item.kind}`}>
                  {changeText({ ...item, pre: '' })}
                </span>
              ))}
          </div>
        </section>
      ))}
      {diff.paras.map((p, index) => {
        const changes = words(p.old, p.now);
        return (
          <section className="wb-diff-group" key={index}>
            <span className="wb-diff-label">{p.label ? `段落 · ${p.label}` : '段落'}</span>
            {p.old && <p className="wb-diff-paragraph old">{changes.old}</p>}
            {p.now ? (
              <p className="wb-diff-paragraph">{changes.now}</p>
            ) : (
              <p className="nps-help">删除了这一段</p>
            )}
          </section>
        );
      })}
      {!count && <p className="nps-help">{diff.order ? '只调整了顺序' : '没有改动'}</p>}
    </>
  );
}
