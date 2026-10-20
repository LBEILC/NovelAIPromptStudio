// Exercise real controls before the storage scenarios, including Chromium's
// default keyboard actions when the focused trigger closes a native popover.
import { center } from './interactions.js';
import { applyMotionBaseline } from './motion.js';

export async function appearanceLayerChecks({ h, preferences, mode }) {
  const { evaluate: e, check, wait } = h;
  h.category('设置·外观·浮层');
  await applyMotionBaseline(h, mode);
  const original = preferences.appearanceSettings();
  const fonts = [
    ['界面字体', 'sansFont', 'IBM Plex Mono'],
    ['等宽字体', 'monoFont', 'MiSans'],
    ['段落字体', 'proseFont', 'MiSans'],
  ];
  await h.section('外观');
  for (const [label, key, family] of fonts) {
    await h.click(label);
    await check(
      `${label}的每个选项使用自己的字体`,
      `(()=>{const options=[...document.querySelectorAll('[role=listbox]:popover-open [role=option]')];return options.length>0&&options.every(option=>{const expected=option.style.fontFamily.replaceAll('"','');return !!expected&&getComputedStyle(option).fontFamily.replaceAll('"','').includes(expected)})})()`,
    );
    await h.key('Escape', {}, 'document.activeElement');
    await h.select(label, `${family}（内置）`);
    await h.until(() => preferences.appearanceSettings()[key] === family, `${label}保存选中值`);
    await check(
      `${label}选中后已保存且列表关闭`,
      `(async()=>(await window.studio.invoke('settings.appearance.get',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data}))[${JSON.stringify(key)}]===${JSON.stringify(family)} && !document.querySelector('.nps-layer[role=listbox]:popover-open'))()`,
      undefined,
      'once',
    );
  }
  const expected = preferences.appearanceSettings();
  for (const [label, key] of fonts) {
    const trigger = `document.querySelector('[aria-label="${label}"]')`;
    for (let count = 1; count <= 5; count++) {
      const point = await center(h, trigger);
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased'])
        await h.window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
          type,
          ...point,
          button: type === 'mouseMoved' ? 'none' : 'left',
          buttons: type === 'mousePressed' ? 1 : 0,
          clickCount: type === 'mouseMoved' ? 0 : 1,
        });
      await wait(
        `!!document.querySelector('.nps-layer[role=listbox]:popover-open')===${count % 2 === 1}`,
      );
    }
    await h.nativeKey('Escape');
    await check(
      `${label}连续点击开关不改值并归还焦点`,
      `document.activeElement===${trigger} && ${trigger}.textContent.includes(${JSON.stringify(expected[key])})`,
      undefined,
      'once',
    );
    for (const keyName of ['Enter', ' ']) {
      await e(`${trigger}.focus()`);
      await h.nativeKey(keyName);
      await wait('!!document.querySelector(".nps-layer[role=listbox]:popover-open")');
      await e(`${trigger}.focus()`);
      await h.nativeKey(keyName);
      await check(
        `${label} ${keyName === ' ' ? '空格' : 'Enter'}关闭不改值并同步归还焦点`,
        `!document.querySelector('.nps-layer[role=listbox]:popover-open') && document.activeElement===${trigger} && ${trigger}.textContent.includes(${JSON.stringify(expected[key])})`,
        `({active:document.activeElement.outerHTML.slice(0,400),value:${trigger}.textContent})`,
        'once',
      );
    }
  }
  await check(
    '连续开关三个字体列表不改写已保存的值',
    () => fonts.every(([, key]) => preferences.appearanceSettings()[key] === expected[key]),
    () => ({ expected, actual: preferences.appearanceSettings() }),
    'once',
  );
  for (const [label, key] of fonts) {
    // Restore through the same UI; current fixture fonts may be system fonts.
    if (original[key] !== expected[key]) {
      await h.click(label);
      await e(
        `(()=>{const option=[...document.querySelectorAll('.nps-layer[role=listbox] [role=option]')].find(n=>n.textContent.trim()===${JSON.stringify(original[key])} || n.textContent.trim()===${JSON.stringify(original[key] + '（内置）')});if(!option)throw Error('缺少原字体');option.click()})()`,
      );
    }
    await h.until(
      () => preferences.appearanceSettings()[key] === original[key],
      `${label}恢复原值`,
    );
  }
}
