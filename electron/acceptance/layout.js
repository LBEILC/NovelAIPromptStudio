// Flush styles on every observation: the first frame may still carry an entry
// marker and therefore have no animations yet. A one-time animation list is not
// an entry-completion barrier. Include ancestors that can transform the target.
export async function settleLayout(h, selector) {
  return settleElements(h, `[...document.querySelectorAll(${JSON.stringify(selector)})]`);
}

export async function settleElements(h, expression) {
  await h.evaluate('document.fonts.ready.then(()=>true)');
  await h.wait(
    `(()=>{
    const targets=${expression};
    if(!targets.length||targets.some(n=>!n))return false;
    const nodes=new Set();
    for(const target of targets){
      if(target.querySelector('[data-entering]'))return false;
      target.getBoundingClientRect();
      if(target.getAnimations({subtree:true}).some(a=>a.pending||a.playState==='running'))return false;
      for(let node=target;node;node=node.parentElement)nodes.add(node);
    }
    return [...nodes].every(node=>{
      node.getBoundingClientRect();
      return !node.hasAttribute('data-entering')&&!node.getAnimations().some(a=>a.pending||a.playState==='running');
    });
  })()`,
    `测量前等待进场和布局稳定：${expression}`,
  );
}
