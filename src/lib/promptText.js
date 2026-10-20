// Syntax and emphasis rules follow the approved interaction prototype.
export function textErrors(text) {
  const errs = [],
    stack = [],
    pair = { '}': '{', ']': '[' },
    line = (i) => text.slice(0, i).split('\n').length;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{' || ch === '[') stack.push([ch, i]);
    else if (ch === '}' || ch === ']') {
      const top = stack[stack.length - 1];
      if (top && top[0] === pair[ch]) stack.pop();
      else errs.push({ at: i, msg: `第 ${line(i)} 行：${ch} 没有配对` });
    }
  }
  for (const [ch, i] of stack) errs.push({ at: i, msg: `第 ${line(i)} 行：${ch} 没有配对` });
  // 权重组可以跨好几个 Tag（"5::a, b, c::"）：从左往右找，"数字::"开一组，下一个"::"关上；
  // 开了没关是"少一个 ::"，不在任何一组里的"::"是"多余的 ::"
  for (let i = text.indexOf('::'); i !== -1; ) {
    const num = /(-?\d+(?:\.\d+)?)$/.exec(text.slice(0, i));
    if (num) {
      const close = text.indexOf('::', i + 2);
      if (close === -1) {
        errs.push({ at: num.index, msg: `第 ${line(num.index)} 行：少一个 ::` });
        break;
      }
      i = text.indexOf('::', close + 2);
    } else {
      errs.push({ at: i, msg: `第 ${line(i)} 行：多余的 ::` });
      i = text.indexOf('::', i + 2);
    }
  }
  return errs.sort((a, b) => a.at - b.at);
}
export function textMarks(text) {
  const n = text.length,
    mult = new Float64Array(n).fill(1),
    mk = new Array(n).fill('');
  const dir = (w) => (w < 0 ? 'neg' : w > 1 ? 'up' : w < 1 ? 'down' : '');
  const re = /(-?\d+(?:\.\d+)?)::/g;
  for (let pos = 0; pos < n; ) {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) break;
    const st = m.index,
      op = st + m[0].length,
      close = text.indexOf('::', op),
      w = parseFloat(m[1]),
      end = close === -1 ? n : close;
    for (let k = st; k < op - 2; k++) mk[k] = `num ${dir(w)}`;
    mk[op - 2] = mk[op - 1] = 'sep';
    for (let k = op; k < end; k++) mult[k] *= w;
    if (close === -1) break;
    mk[close] = mk[close + 1] = 'sep';
    pos = close + 2;
  }
  let depth = 0;
  for (let k = 0; k < n; k++) {
    const ch = text[k];
    if (ch === '{' || ch === ']') {
      depth += 1;
      mk[k] = 'sep';
    } else if (ch === '}' || ch === '[') {
      depth -= 1;
      mk[k] = 'sep';
    }
    if (!mk[k] && depth) mult[k] *= 1.05 ** depth;
  }
  return Array.from({ length: n }, (_, k) => {
    if (mk[k]) return mk[k];
    const m = mult[k];
    if (m < 0) return `neg l${m <= -1.5 ? 3 : m <= -0.8 ? 2 : 1}`;
    if (m > 1.001) return `up l${m > 1.6 ? 3 : m > 1.2 ? 2 : 1}`;
    if (m < 0.999) return `down l${m < 0.5 ? 3 : m < 0.8 ? 2 : 1}`;
    return '';
  });
}
