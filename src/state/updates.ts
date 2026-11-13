import { invokeUI } from '../lib/commands';
import { useEffect, useRef, useState } from 'react';
import type { UpdateSourceSettings, UpdateState } from '../shared/types';

export type UpdateSource = UpdateSourceSettings['source'];
/** Mirror酱 的 CDK 问题码（doc/design.md 2.50）：不自动退回 GitHub，界面给"改用 GitHub 下载" */
export const CDK_PROBLEMS = [7001, 7002, 7003, 7004, 7005, 8009];

export function useUpdates() {
  const [state, setState] = useState<UpdateState | null>(null);
  const [autoCheck, setAutoCheck] = useState(true);
  const [source, setSource] = useState<UpdateSourceSettings | null>(null);
  const [error, setError] = useState('');
  // 正在检查或下载时又要检查（填完 CDK、换了更新源）：主进程会直接返回当前状态，
  // 所以记下来，等这次结束再查一次。CDK 第一次带着检查决定分成归属，不能丢（2.50）
  const pending = useRef(false);
  useEffect(() => {
    const studio = window.studio;
    if (!studio) return;
    let active = true;
    Promise.all([
      invokeUI('updates.status', {}),
      invokeUI('settings.productivity.get', {}),
      invokeUI('updates.source.get', {}),
    ])
      .then(([status, settings, saved]) => {
        if (active) {
          setState(status);
          setAutoCheck(settings.autoCheckUpdates);
          setSource(saved);
        }
      })
      .catch((e: Error) => setError(e.message));
    const unsubscribe = studio.onCommandEvent((event) => {
      if (event.type !== 'updates') return;
      const next = event.data;
      if (active) setState(next);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  const busy = state?.phase === 'checking' || state?.phase === 'downloading';
  const check = async () => {
    if (!window.studio) return;
    if (busy) {
      pending.current = true;
      return;
    }
    setError('');
    setState((current) => current && { ...current, phase: 'checking' });
    try {
      const result = await invokeUI('updates.check', {});
      if (!result.ok) throw new Error(result.error);
      setState(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      // The main process retains any available or downloaded update on check failure.
      try {
        setState(await invokeUI('updates.status', {}));
      } catch {
        setState(state);
      }
    }
  };
  const checkRef = useRef(check);
  checkRef.current = check;
  useEffect(() => {
    if (busy || !pending.current) return;
    pending.current = false;
    void checkRef.current();
  }, [busy]);
  const changeAutoCheck = async (checked: boolean) => {
    try {
      const saved = await invokeUI('settings.productivity.save', {
        settings: { autoCheckUpdates: checked },
      });
      if (saved) setAutoCheck(saved.autoCheckUpdates);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const saveSource = async (patch: { source?: UpdateSource; cdk?: string }) => {
    const saved = await invokeUI('updates.source.save', patch);
    setSource(saved);
    // 换了源、改了 CDK 都立刻查一次：校验 CDK、显示到期日，也让下载走对的地方
    await check();
    return saved;
  };
  const changeSource = (next: UpdateSource) => {
    if (next === source?.source) return Promise.resolve(source);
    setSource((s) => s && { ...s, source: next });
    return saveSource({ source: next });
  };
  /** 离开 CDK 输入框：内容变了才保存并检查（空的等于删掉 CDK） */
  const changeCdk = (cdk: string) => {
    const next = cdk.trim();
    if (!source || next === source.cdk) return Promise.resolve(source);
    return saveSource({ cdk: next });
  };
  const download = async () => {
    try {
      const result = await invokeUI('updates.download', {});
      if (result && !result.ok) throw new Error(result.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  return {
    state,
    autoCheck,
    changeAutoCheck,
    check,
    download,
    error,
    source,
    changeSource,
    changeCdk,
  };
}
