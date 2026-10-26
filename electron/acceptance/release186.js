// Shared public-command helpers for the 1.8.6 UI scenarios.
export const commandFor =
  (h) =>
  (name, input = {}) =>
    h.evaluate(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
    );
export const menuRoot = 'document.querySelector("[role=menu]:not(.leaving *)")';
export const toastRoot = 'document.querySelector(".toast:not(.leaving)")';
export async function contextMenu(h, selector) {
  await h.wait(`!!document.querySelector(${JSON.stringify(selector)})`);
  await h.evaluate(
    `document.querySelector(${JSON.stringify(selector)}).dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:220,clientY:240}))`,
  );
}
export async function randomPoolUI({ h }) {
  const call = commandFor(h);
  await h.click('素材', 'document.querySelector(".tb")');
  await h.click('随机池', 'document.querySelector(".matp .side")');
  const before = (await call('material.list')).items.length;
  await h.click('新建随机池');
  await h.wait('document.activeElement?.matches(".mrow-rename input")');
  const focused = await h.evaluate('document.activeElement.matches(".mrow-rename input")');
  await h.input('.mrow-rename input', '合成验收池');
  await h.key('Enter');
  await h.wait('!!document.querySelector(".pool-add input")');
  const pool = (await call('material.list')).items.find((m) => m.name === '合成验收池');
  await h.check(
    '091-01 新建随机池展开并聚焦名称，回车保存名字',
    async () => focused && !!pool && (await call('material.list')).items.length === before + 1,
  );
  await h.input('.pool-add input', 'synthetic standing');
  await h.key('Enter');
  await h.wait('document.querySelectorAll(".pool-it").length===1');
  const single = (await call('material.list')).items.find((m) => m.id === pool.id).entries.length;
  const pasted = 'synthetic sitting\nsynthetic walking\nsynthetic waving';
  await h.evaluate(
    `(()=>{const d=new DataTransfer();d.setData('text',${JSON.stringify(pasted)});document.querySelector('.pool-add input').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,clipboardData:d}));})()`,
  );
  await h.wait('document.querySelectorAll(".pool-it").length===4');
  await h.check(
    '091-02 回车增加一条，粘贴三行一次增加三条',
    async () =>
      single === 1 &&
      (await call('material.list')).items.find((m) => m.id === pool.id).entries.length === 4,
  );
  await h.click('增加抽中概率', 'document.querySelector(".pool-it")');
  await h.until(
    async () =>
      (await call('material.list')).items.find((m) => m.id === pool.id).entries[0].chance === 1.5,
    '概率保存',
  );
  await h.check(
    '091-03 概率增加到 1.5 且百分比合计约 100',
    `Math.abs([...document.querySelectorAll('.pool-pct')].reduce((n,e)=>n+parseInt(e.textContent),0)-100)<=2`,
  );
  await h.click('按文本编辑');
  await h.input('[aria-label="随机池条目"]', 'synthetic first\nsynthetic second');
  await h.key('Enter', process.platform === 'darwin' ? { metaKey: true } : { ctrlKey: true });
  await h.wait('document.querySelectorAll(".pool-it").length===2');
  await h.check(
    '091-04 文本编辑快捷键保存两条',
    async () =>
      (await call('material.list')).items
        .find((m) => m.id === pool.id)
        .entries.map((e) => e.text)
        .join('\n') === 'synthetic first\nsynthetic second',
  );
  await call('material.pool.delete', { id: pool.id });
}

export async function randomBlockUI({ h }) {
  const call = commandFor(h);
  const { item: pool } = await call('material.pool.create', { name: '合成块验收池' });
  await call('material.pool.replace', {
    id: pool.id,
    text: 'synthetic alpha\nsynthetic beta\nsynthetic gamma\nsynthetic delta',
  });
  const { tab } = await call('workbench.new', { width: 64, height: 64 });
  const set = (text) => call('prompt.set', { tabId: tab.id, scope: 'base:prompt', text });
  const raw = async () =>
    (await call('workbench.get', { tabId: tab.id })).tab.project.metadata.prompt_raw;
  await set('__合成块验收池*2__');
  await h.reload();
  await h.click('工作台', 'document.querySelector(".tb")');
  await h.wait('!!document.querySelector(".rnd-box")');
  await h.check(
    '091-05 随机块显示池名、抽取数和条目提示',
    `(()=>{const e=document.querySelector('.blk.rnd-blk .rnd-box');return !!e&&e.textContent.includes('合成块验收池')&&e.textContent.includes('抽 2 个')&&['alpha','beta','gamma','delta'].every(t=>e.dataset.tip.includes(t))})()`,
  );
  await h.evaluate('document.querySelector(".rnd-box").click()');
  await h.click('增加抽几个', 'document.querySelector(".rnd-pop")');
  await h.click('保存', 'document.querySelector(".rnd-pop")');
  await h.until(async () => (await raw()).includes('*3__'), '随机块抽取数保存');
  await h.check('091-06 随机块浮层保存抽三个', async () => (await raw()) === '__合成块验收池*3__');
  await set('synthetic before\n\n__合成块验收池*2__\n\nsynthetic after');
  await h.wait('!!document.querySelector("[data-trigger^=rins-]")');
  await h.evaluate('document.querySelector("[data-trigger^=rins-]").click()');
  await h.wait('document.querySelector(".rnd-pop")?.textContent.includes("加一个随机块")');
  await h.click('加入', 'document.querySelector(".rnd-pop")');
  await h.until(async () => (await raw()).split('__').length === 5, '插入第二个随机块');
  await h.check('091-07 块间加入随机块保留插入位置', async () =>
    /^synthetic before\s+__合成块验收池__\s+__合成块验收池\*2__\s+synthetic after$/.test(
      await raw(),
    ),
  );
  await set('__不存在的池__');
  await h.wait('!!document.querySelector(".rnd-box.warn")');
  await h.check(
    '091-08 不存在的随机池显示可修正提示',
    'document.querySelector(".rnd-box.warn").textContent.includes("找不到随机池")',
  );
  await set('__合成块验收池*2__');
  await h.click('素材', 'document.querySelector(".tb")');
  await h.click('随机池', 'document.querySelector(".matp .side")');
  await h.click('更多', `document.querySelector('[data-mat="${pool.id}"]').parentElement`);
  await h.click('重命名', menuRoot);
  await h.input('.mrow-rename input', '合成块改名池');
  await h.key('Enter');
  await h.wait('!document.querySelector(".mrow-rename input")');
  await h.click('工作台', 'document.querySelector(".tb")');
  await h.until(async () => (await raw()).includes('合成块改名池'), '随机池改名同步草稿');
  await h.check(
    '091-09 素材改名同步随机记号且不告警',
    '!!document.querySelector(".rnd-box:not(.warn)") && document.querySelector(".rnd-box").textContent.includes("合成块改名池")',
  );
  await h.screenshot('091-random-block');
  await call('workbench.close', { tabId: tab.id });
  await call('material.pool.delete', { id: pool.id });
}
