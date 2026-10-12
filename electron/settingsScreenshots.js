import { harness } from './acceptance/harness.js';

export async function prepareSettingsScreenshot({ window, scene, mode }) {
  if (!scene.settingsState) return;
  const h = harness(window, { ...mode, slow: 1, screenshots: [] }, []);
  await h.input('[aria-label="搜索 Tag 或译文"]', 'synthetic_dictionary_');
  await h.wait('document.querySelectorAll("tr[data-tag]").length>1');
  if (scene.settingsState === 'edit') {
    await h.click('合成译文 0');
    await h.input('[aria-label="译文"]', '合成编辑中的译文');
  } else if (scene.settingsState === 'selection') {
    await h.click('synthetic_dictionary_000');
    await h.click('synthetic_dictionary_001');
  } else await h.click('更多：synthetic_dictionary_000');
}
