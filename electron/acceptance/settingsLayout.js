export async function settingsLayoutChecks(h) {
  const { evaluate: e, wait, check, section } = h;
  h.category('设置·版式');
  const size = h.window.getContentSize();
  const page = `[...document.querySelectorAll('.settings-page')].find(n=>n.getClientRects().length && getComputedStyle(n).display!=='none')`;
  const labels = ['外观', '图片库', 'AI 服务', '翻译词典', '关于与更新'];
  try {
    for (const width of [1240, 960]) {
      h.window.setContentSize(width, 760);
      for (const label of labels) {
        await section(label);
        await wait(`!!(${page})?.querySelector('.settings-page-head')`);
        await check(
          `${width} 像素时${label}没有横向滚动`,
          `(()=>{const p=${page};return p.scrollWidth<=p.clientWidth+1 && [...p.querySelectorAll('.settings-page-head,.settings-page-foot,.settings-scroll')].every(n=>n.scrollWidth<=n.clientWidth+1)})()`,
        );
        if (label !== '翻译词典') {
          await check(
            `${label}内容栏与页头水平对齐且居中`,
            `(()=>{const p=${page},copy=p.querySelector('.settings-copy'),head=p.querySelector('.settings-page-head>div'),a=copy.getBoundingClientRect(),b=head.getBoundingClientRect(),padding=parseFloat(getComputedStyle(copy).paddingLeft),max=parseFloat(getComputedStyle(copy).getPropertyValue('--page-col'));return Math.abs(a.x+padding-b.x)<2 && b.width<=max+1 && Math.abs((a.x+a.width/2)-(p.getBoundingClientRect().x+p.clientWidth/2))<2})()`,
          );
        }
        if (width === 1240) await h.screenshot(`settings-layout-${labels.indexOf(label)}`);
      }
    }
    await section('AI 服务');
    const scroll = `(${page}).querySelector('.settings-scroll')`;
    const head = `(${page}).querySelector('.settings-page-head')`;
    const footer = `(${page}).querySelector('.settings-page-foot')`;
    await e(`${scroll}.scrollTop=0`);
    await wait(`!${scroll}.hasAttribute('data-scrolled')`);
    await check(
      '页头在顶部没有底线',
      `getComputedStyle(${head}).boxShadow.includes('rgba(0, 0, 0, 0)')`,
    );
    const before = await e(
      `({head:${head}.getBoundingClientRect().top,foot:${footer}.getBoundingClientRect().top})`,
    );
    await e(`${scroll}.scrollTop=200`);
    await wait(`${scroll}.hasAttribute('data-scrolled')`);
    await h.checkSoon(
      '滚动后页头出现底线且页头页脚位置不变',
      `!getComputedStyle(${head}).boxShadow.includes('rgba(0, 0, 0, 0)') && ${head}.getBoundingClientRect().top===${before.head} && ${footer}.getBoundingClientRect().top===${before.foot}`,
    );
    await check(
      'AI 页脚保存按钮初始不可用且没有未保存提示',
      `(()=>{const p=${page},f=p.querySelector('.settings-page-foot'),b=[...f.querySelectorAll('button')].find(b=>b.textContent==='保存');return b.getAttribute("aria-disabled")==="true" && !f.textContent.includes('有未保存的修改')})()`,
    );
    await h.input('[aria-label="模型"]', 'layout-fixture-model');
    await check(
      '编辑后保存可用且显示未保存提示',
      `(()=>{const f=(${page}).querySelector('.settings-page-foot'),b=[...f.querySelectorAll('button')].find(b=>b.textContent==='保存');return b.getAttribute("aria-disabled")!=="true" && f.textContent.includes('有未保存的修改')})()`,
    );
    await h.input('[aria-label="模型"]', '');
  } finally {
    h.window.setContentSize(...size);
  }
}
