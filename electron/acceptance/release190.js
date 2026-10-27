import { clipboard } from 'electron';

export async function imageMenuCopy190(h, label, selector, expected) {
  await h.wait(`!!(${selector})`);
  clipboard.clear();
  await h.evaluate(
    `(()=>{const n=${selector},r=n.getBoundingClientRect();n.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2}))})()`,
  );
  const menu = 'document.querySelector(".menu:not(.leaving)")';
  await h.wait(`!!${menu}`);
  const order = await h.evaluate(
    `JSON.stringify([...${menu}.querySelectorAll('[role=menuitem]')].slice(0,3).map(n=>n.textContent.trim()))===JSON.stringify(['复制图片','另存为…','在文件夹中显示'])`,
  );
  await h.click('复制图片', menu);
  const matches = () => {
    const size = clipboard.readImage().getSize();
    return size.width === expected.width && size.height === expected.height;
  };
  await h.until(matches, label + '复制完成');
  await h.check(label, () => order && matches(), undefined, 'once');
}
