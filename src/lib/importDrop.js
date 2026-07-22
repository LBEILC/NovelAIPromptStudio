export function assessDroppedFiles(files) {
  const names = Array.from(files || [], (file) => String(file?.name || '')).filter(Boolean);
  if (!names.length) {
    return { count: null, valid: true, label: '文件', pendingDetails: true };
  }
  const supported = names.filter((name) => /\.(png|jpe?g|webp|zip)$/i.test(name));
  return {
    count: names.length,
    valid: supported.length === names.length,
    label: supported.some((name) => /\.zip$/i.test(name)) ? '图片或 NovelAI ZIP' : '图片',
    pendingDetails: false,
  };
}

export function assessWorkbenchDroppedFiles(files) {
  const names = Array.from(files || [], (file) => String(file?.name || '')).filter(Boolean);
  if (!names.length) return { count: null, valid: true, label: '图片', pendingDetails: true };
  const supported = names.filter((name) => /\.(png|jpe?g|webp)$/i.test(name));
  return {
    count: names.length,
    valid: names.length === 1 && supported.length === 1,
    label: '图片',
    pendingDetails: false,
  };
}
