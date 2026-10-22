// Keep acceptance actions aligned with the product's two-level grouping controls.
export async function selectGalleryGrouping(h, mode) {
  const grouping = 'document.querySelector("[role=radiogroup][aria-label=分组]")';
  if (['完全相同', '基础相同', '相似'].includes(mode)) {
    await h.click('按提示词', grouping);
    await h.click(
      mode,
      'document.querySelector("[role=radiogroup][aria-label=按提示词分组的方式]")',
    );
  } else {
    await h.click(mode === '不合并' ? '不分组' : mode, grouping);
  }
}
