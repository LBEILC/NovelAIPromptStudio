export async function relayChecks({ h, generationService }) {
  const scope = 'document.querySelector("[data-settings-section=novelai]:not(.leaving)")';
  await h.section('NovelAI 账号');
  await h.select('连接方式', '中转站');
  await h.input('[aria-label="中转站地址"]', generationService.url + '/v1');
  // The preceding command checks already saved a key; exercise its replacement UI.
  await h.click('更换', scope);
  await h.input('[aria-label="中转站 Key"]', 'acceptance-token');
  await h.click('测试连接', scope);
  const connected = `${scope}?.textContent.includes('连接成功 · 可以用：V5 Full、V4.5 Full')`;
  await h.wait(connected);
  await h.check('中转站界面测试连接显示服务提供的模型', connected);
  await h.click('保存', scope);
  await h.wait('document.body.innerText.includes("已保存中转站")');
  await h.wait(
    `${scope}?.textContent.includes('已保存 ••••••••') && !${scope}?.querySelector('[aria-label="中转站 Key"]')`,
  );
  await h.check(
    '中转站保存通知与掩码 Key',
    `${scope}?.textContent.includes('已保存 ••••••••') && document.body.innerText.includes('已保存中转站')`,
  );
  await h.screenshot('relay-saved');
  await h.click('工作台', 'document.querySelector(".tb")');
  const relayCost =
    'document.querySelector(".gen-bar .cost b")?.textContent.trim()==="中转站" && !document.querySelector(".tb")?.textContent.includes("Anlas")';
  await h.wait(relayCost);
  await h.check('中转站费用标识且标题栏隐藏 Anlas', relayCost);
  const before = generationService.state.requests.length;
  const ids = await h.evaluate(
    "window.studio.invoke('generate.status',{}).then(r=>r.data.jobs.map(j=>j.id))",
  );
  await h.click('生成', 'document.querySelector(".gen-bar")');
  await h.wait(
    `window.studio.invoke('generate.status',{}).then(r=>r.data.jobs.some(j=>!${JSON.stringify(ids)}.includes(j.id)&&j.state==='completed'&&j.images.length===1))`,
  );
  await h.until(
    () => generationService.state.requests.length === before + 1,
    '中转站收到界面生成请求',
  );
  await h.check(
    '中转站界面生成一张并入库',
    `(async()=>{const r=await window.studio.invoke('generate.status',{});const j=r.data.jobs.find(j=>!${JSON.stringify(ids)}.includes(j.id));return j.state==='completed'&&j.images.length===1&&(await window.studio.invoke('library.get',{id:j.images[0]})).ok;})()`,
  );
  await h.wait('document.querySelector(".gen-bar")?.textContent.includes("上一张 0.8 额度")');
  await h.check(
    '生成成功后显示按请求编号查询的额度',
    'document.querySelector(".gen-bar")?.textContent.includes("上一张 0.8 额度")',
  );
  await h.section('NovelAI 账号');
  await h.wait('document.body.innerText.includes("这个 Key 已用")');
  await h.check(
    '用量统计使用当前站点额度',
    `window.studio.invoke('usage.summary',{}).then(r=>r.ok&&r.data.quota>=0.8&&r.data.anlas===null) `,
  );
  await h.check(
    '用量页写额度并说明按站点统计',
    'document.body.innerText.includes("额度") && document.body.innerText.includes("只统计")',
  );
  const call = (name, input = {}) =>
    h.evaluate(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
    );
  const pick = async (name) => {
    await h.click('中转站', 'document.querySelector("button[aria-label=中转站]").parentElement');
    await h.click(name, 'document.querySelector(".menu:not(.leaving)")');
  };
  for (const [name, key] of [
    ['小忆API开放平台', 'acceptance-token'],
    ['hamubox', 'acceptance-token-second'],
  ]) {
    await pick(name);
    const active = await call('account.get');
    if (
      active.settings.relay.slots.some(
        (s) => s.id === (name === 'hamubox' ? 'hamubox' : 'chr1') && s.hasKey,
      )
    )
      await h.click('更换', scope);
    await h.input('[aria-label="中转站 Key"]', key);
    await h.click('保存', scope);
    await h.wait(`!${scope}?.querySelector('[aria-label="中转站 Key"]')`);
  }
  for (const [name, slot, key] of [
    ['小忆API开放平台', 'chr1', 'acceptance-token'],
    ['hamubox', 'hamubox', 'acceptance-token-second'],
  ]) {
    await pick(name);
    await h.wait(
      `window.studio.invoke('account.get',{}).then(r=>r.data.settings.relay.slot===${JSON.stringify(slot)})`,
    );
    await h.click('工作台', 'document.querySelector(".tb")');
    const previous = (await call('generate.status')).jobs.map((j) => j.id);
    await h.click('生成', 'document.querySelector(".gen-bar")');
    await h.wait(
      `window.studio.invoke('generate.status',{}).then(r=>r.data.jobs.some(j=>!${JSON.stringify(previous)}.includes(j.id)&&j.state==='completed'))`,
    );
    await h.check(
      `${name} 下拉切换后生成携带该站 Key`,
      () => generationService.state.requestKeys.at(-1) === `Bearer ${key}`,
    );
    await h.wait('document.querySelector(".gen-bar")?.textContent.includes("上一张 0.8 额度")');
    await h.section('NovelAI 账号');
    await h.check(
      `${name} 用量只统计本站一张的额度`,
      `window.studio.invoke('usage.summary',{}).then(r=>r.data.images===1&&r.data.quota===0.8)`,
    );
  }
  await h.click('工作台', 'document.querySelector(".tb")');
  await h.click('参数');
  await h.click('模型');
  await h.check(
    '未提供的 V4 Full 不可选并说明原因',
    `(()=>{const e=[...document.querySelectorAll('[role=menuitem]')].find(e=>e.textContent.trim()==='V4 Full');return !!e&&(e.disabled||e.getAttribute('aria-disabled')==='true')&&e.getAttribute('data-tip')==='中转站没有这个模型';})()`,
  );
  await h.key('Escape');
  await h.section('NovelAI 账号');
  await h.select('连接方式', 'NovelAI 官方');
  await h.wait('document.querySelector(".tb")?.textContent.includes("Anlas")');
  await h.check(
    '切回官方后标题栏恢复 Anlas 余额',
    'document.querySelector(".tb")?.textContent.includes("Anlas")',
  );
}
