import { settleLayout } from './layout.js';

/** Exercise the actual focus owner and every clipping ancestor, including nested disclosures. */
export async function focusRingChecks(h, label) {
  await settleLayout(h, '.nps-transition-height');
  await h.nativeKey('Tab');
  await h.check(
    `${label}：展开容器内每个控件的焦点框四边完整`,
    async () => {
      const result = await h.evaluate(`(async()=>{
      const previous=document.activeElement;
      const scrolls=[...document.querySelectorAll('*')].filter(n=>n.scrollTop||n.scrollLeft).map(n=>[n,n.scrollTop,n.scrollLeft]);
      const controls=[...document.querySelectorAll('.nps-transition-height :is(button,input,textarea,select,summary,[tabindex])')].filter(n=>!n.disabled&&!n.closest('[aria-hidden="true"],[inert]')&&n.checkVisibility({checkVisibilityCSS:true}));
      const failures=[];
      for(const node of controls){
        node.scrollIntoView({block:'nearest',inline:'nearest'});
        node.focus({preventScroll:true});
        const owner=node.closest('.nps-field')||node;
        for(const a of owner.getAnimations())a.finish();
        const style=getComputedStyle(owner),r=owner.getBoundingClientRect(),out=Math.max(0,parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset));
        if(style.outlineStyle==='none'||!out)continue;
        for(let parent=owner.parentElement;parent;parent=parent.parentElement){
          const s=getComputedStyle(parent),b=parent.getBoundingClientRect();
          const x=/hidden|clip|auto|scroll/.test(s.overflowX),y=/hidden|clip|auto|scroll/.test(s.overflowY);
          if((x&&(r.left-out<b.left+parent.clientLeft-.5||r.right+out>b.left+parent.clientLeft+parent.clientWidth+.5))||(y&&(r.top-out<b.top+parent.clientTop-.5||r.bottom+out>b.top+parent.clientTop+parent.clientHeight+.5)))failures.push({control:node.getAttribute('aria-label')||node.textContent.slice(0,50),ancestor:parent.className});
        }
      }
      previous?.focus({preventScroll:true});
      for(const [n,top,left] of scrolls){n.scrollTop=top;n.scrollLeft=left}
      return {count:controls.length,failures};
    })()`);
      console.log(`焦点框证据 ${label}：${JSON.stringify(result)}`);
      return result.count > 0 && result.failures.length === 0;
    },
    undefined,
    'both',
  );
}
