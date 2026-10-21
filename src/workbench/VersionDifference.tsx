// 版本差异（doc/design.md 2.23）：版本栏里每一版写相对上一版改了什么（最多两行）；
// 停在一版上 400ms 弹出完整对比：参数、按块分组的 Tag、段落的新旧原文（删掉的字加删除线、加上的加下划线）。
import type { ReactNode } from 'react';
import { changeText, diffSummary, oneLine, type VersionDiff } from '../lib/versionDiff';

const KIND = { add: 'plus', rem: 'minus', w: 'wchg' } as const;

/** 摘要：Tag 的增减和权重用颜色区分（新增绿、去掉红、权重正文色）。 */
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
      .filter((x) => x.at >= 0)
      .sort((a, b) => a.at - b.at)[0];
    if (!next) {
      pieces.push(text.slice(cursor));
      break;
    }
    pieces.push(text.slice(cursor, next.at));
    const value = changeText(next.item);
    pieces.push(
      <span key={cursor} className={KIND[next.item.kind]}>
        {value}
      </span>,
    );
    cursor = next.at + value.length;
  }
  return <span className="what">{pieces}</span>;
}

// 段落按词对比：旧文里删掉的词加删除线，新文里加上的词加下划线
function words(before: string, after: string) {
  const a = before.split(/(\s+)/),
    b = after.split(/(\s+)/);
  const m = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      m[i][j] = a[i] === b[j] ? m[i + 1][j + 1] + 1 : Math.max(m[i + 1][j], m[i][j + 1]);
  const old: ReactNode[] = [],
    now: ReactNode[] = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      old.push(a[i++]);
      now.push(b[j++]);
    } else if (j < b.length && (i >= a.length || m[i][j + 1] >= m[i + 1][j])) {
      now.push(/^\s+$/.test(b[j]) ? b[j] : <ins key={j}>{b[j]}</ins>);
      j++;
    } else {
      old.push(/^\s+$/.test(a[i]) ? a[i] : <del key={i}>{a[i]}</del>);
      i++;
    }
  }
  return { old, now };
}

/** 完整对比（放在 .ver-peek 浮层里）。 */
export function VersionDifference({
  diff,
  title,
  against,
}: {
  diff: VersionDiff;
  title: string;
  against: string;
}) {
  const groups = [...new Set(diff.items.map((x) => x.label))];
  const count =
    diff.items.length + diff.paras.length + (diff.size ? 1 : 0) + (diff.params?.length || 0);
  return (
    <>
      <div className="vp-h">
        <b>{title}</b>
        <span className="help">
          与{against}相比{count ? ` · ${count} 处改动` : ''}
        </span>
      </div>
      {(diff.size || !!diff.params?.length) && (
        <div className="vp-g">
          <span className="label">参数</span>
          <div className="vp-tags mono">
            {diff.size && (
              <span className="wchg">
                尺寸 {diff.size.from.join('×')}→{diff.size.to.join('×')}
              </span>
            )}
            {diff.params?.map((x) => (
              <span key={x} className="wchg">
                {x}
              </span>
            ))}
          </div>
        </div>
      )}
      {groups.map((label) => (
        <div className="vp-g" key={label}>
          <span className="label">{label}</span>
          <div className="vp-tags mono">
            {diff.items
              .filter((x) => x.label === label)
              .map((x, i) => (
                <span key={i} className={KIND[x.kind]}>
                  {changeText({ ...x, pre: '' })}
                </span>
              ))}
          </div>
        </div>
      ))}
      {diff.paras.map((p, i) => {
        const w = words(p.old, p.now);
        return (
          <div className="vp-g" key={i}>
            <span className="label">{p.label ? `段落 · ${p.label}` : '段落'}</span>
            {p.old && <p className="vp-p old">{w.old}</p>}
            {p.now ? <p className="vp-p">{w.now}</p> : <p className="vp-p help">删除了这一段</p>}
          </div>
        );
      })}
      {!count && <p className="help">{diff.order ? '只调整了顺序' : '没有改动'}</p>}
    </>
  );
}
