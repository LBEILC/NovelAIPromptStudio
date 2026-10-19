import { settleLayout } from './layout.js';

export async function tabOutlineChecks(h) {
  const tab = 'document.querySelector(".wb-tab[aria-selected=true]")';
  const bounds = `(()=>{const tab=${tab};const rect=tab.getBoundingClientRect();for(let node=tab.parentElement;node;node=node.parentElement){const style=getComputedStyle(node);const box=node.getBoundingClientRect();if(/hidden|clip|auto|scroll/.test(style.overflowX) && (rect.left<box.left+node.clientLeft-.5 || rect.right>box.left+node.clientLeft+node.clientWidth+.5))return false;if(/hidden|clip|auto|scroll/.test(style.overflowY) && (rect.top<box.top+node.clientTop-.5 || rect.bottom>box.top+node.clientTop+node.clientHeight+.5))return false;}return true})()`;
  await h.check(
    '当前标签四边在所有裁切容器内，描边绘制于盒内',
    `(${bounds}) && getComputedStyle(document.querySelector('.wb-tab-indicator')).boxShadow.includes('inset')`,
    undefined,
    'both',
  );
  await h.nativeKey('Tab');
  await h.evaluate(`${tab}.focus({preventScroll:true})`);
  await settleLayout(h, '.wb-tab[aria-selected=true]');
  await h.check(
    '键盘聚焦标签时四边焦点框均在可见范围内',
    `(${bounds}) && (()=>{const tab=${tab},style=getComputedStyle(tab);return tab.matches(':focus-visible') && parseFloat(style.outlineWidth)>0 && parseFloat(style.outlineOffset)+parseFloat(style.outlineWidth)<=0})()`,
    undefined,
    'both',
  );
  await h.screenshot('workbench-tab-outline');
}
