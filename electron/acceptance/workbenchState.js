// Read the production command API after its normal prepare/flush handshake.
// Existing DOM assertions retain their semantics without inspecting localStorage.
export const sessionExpression = '__workbenchState';
export const draftExpression = `(()=>{const s=${sessionExpression};return s.tabs.find(t=>t.id===s.activeTabId)?.project})()`;
export function withWorkbenchState(h) {
  if (h.workbenchSnapshots) return h;
  const wrap = (code) =>
    typeof code === 'string' && code.includes(sessionExpression)
      ? `(async()=>{const ready=await window.studio.invoke('workbench.list',{});if(!ready.ok)throw Error(ready.error.message);const result=await window.studio.invoke('workbench.session',{});if(!result.ok)throw Error(result.error.message);const ${sessionExpression}=result.data;return (${code});})()`
      : code;
  return {
    ...h,
    workbenchSnapshots: true,
    evaluate: (code, ...args) => h.evaluate(wrap(code), ...args),
    wait: (code, ...args) => h.wait(wrap(code), ...args),
    check: (label, code, ...args) => h.check(label, wrap(code), ...args),
  };
}
