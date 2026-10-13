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
  document.addEventListener('contextmenu', (event) => event.preventDefault());
}
