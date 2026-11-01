export function installClientDefaults() {
  document.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'a' &&
      !target.closest('input, textarea, [contenteditable="true"]')
    )
      event.preventDefault();
  });
  document.addEventListener('dragstart', (event) => {
    if ((event.target as Element).closest('img, svg, a')) event.preventDefault();
  });
  for (const type of ['dragover', 'drop'])
    document.addEventListener(type, (event) => event.preventDefault());
  // 挂在 window 上，冒泡到最后才拦：document 上输入框的右键菜单（剪切、复制、粘贴）先看到没被拦过的事件。
  // 以前挂在 document 上又先注册，那份菜单一直弹不出来，只能用键盘粘贴（用户 11-01）
  window.addEventListener('contextmenu', (event) => event.preventDefault());
}
