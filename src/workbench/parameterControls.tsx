import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../kit/controls';
import { useAsk } from '../kit/dialog';
import { MenuPop, type MenuEntry } from '../kit/menu';
import { useIndicator } from '../kit/motion';
import { useNotifications } from '../kit/toast';
import { errorCode, invokeUI } from '../lib/commands';
import { useVersionList, readVersions } from '../state/versions';
import type { CommandTab } from '../shared/commands';
import { MODEL_CAPS, SAMPLERS, type GenerationSettings, type ModelId } from '../shared/params';
import type { ImageProject } from '../shared/types';

export type PromptTab = 'prompt' | 'params' | 'refs';

export const modelName = (m?: string | null) =>
  (m && MODEL_CAPS[m as ModelId]?.name) || m || '未知模型';

export const samplerName = (s?: string | null) =>
  SAMPLERS.find((x) => x.id === s)?.name || s || '—';

export const same = (a: unknown, b: unknown) =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** 改过的参数（和这一版比） */
export function changedParams(base?: GenerationSettings, draft?: GenerationSettings) {
  if (!base || !draft) return [];
  return (Object.keys(draft) as (keyof GenerationSettings)[]).filter(
    (k) => !same(base[k], draft[k]),
  );
}

export const refCount = (p?: ImageProject | null) =>
  (p?.references?.vibes.length || 0) + (p?.references?.precise.length || 0);

/** 页签那一行：提示词 / 参数（有改动时一个墨色小圆点）/ 参考（参考图的个数） */
export function PromptTabs({
  value,
  onChange,
  tab,
  base,
}: {
  value: PromptTab;
  onChange: (t: PromptTab) => void;
  tab: CommandTab;
  base: ImageProject | null;
}) {
  const box = useRef<HTMLSpanElement>(null);
  const mod = changedParams(base?.params, tab.project?.params).length > 0;
  const caps = MODEL_CAPS[tab.project?.params?.model as ModelId];
  const refs = caps?.references ? refCount(tab.project) : 0;
  useIndicator(box, [value, mod, refs]);
  const item = (k: PromptTab, name: string, extra?: ReactNode) => (
    <button
      className={value === k ? 'on' : ''}
      role="tab"
      data-feature={`tab-${k}`}
      aria-selected={value === k}
      onClick={() => onChange(k)}
    >
      {name}
      {extra}
    </button>
  );
  return (
    <div className="ptabs-row">
      <span className="ptabs has-ind" ref={box} role="tablist" aria-label="提示词栏">
        <i className="ind" />
        {item('prompt', '提示词')}
        {item(
          'params',
          '参数',
          mod ? <span className="pt-dot" data-enter="fade" data-tip="有改过的参数" /> : null,
        )}
        {item('refs', '参考', refs ? <span className="pt-n mono">{refs}</span> : null)}
      </span>
    </div>
  );
}

/** 当前这一版（参数和参考都和它比）；没有账号、没有版本时是原图 */
export function useBaseProject(tab: CommandTab | null, hasVersions: boolean) {
  const [base, setBase] = useState<{ project: ImageProject; name: string } | null>(null);
  const versions = useVersionList(tab, hasVersions);
  useEffect(() => {
    if (!tab) return;
    let live = true;
    const fallback = () =>
      tab.originalProject && setBase({ project: tab.originalProject, name: '原图' });
    if (!hasVersions) {
      fallback();
      return;
    }
    void readVersions(tab.id)
      .then((r) => {
        if (!live) return;
        const v = r.versions.find((x) => x.id === tab.versionId) || r.versions[0];
        if (v)
          setBase({
            project: v.project,
            name: v.isStart ? '起点' : v.parentId ? `第 ${v.number} 版` : '原图',
          });
        else fallback();
      })
      .catch(() => live && fallback());
    return () => {
      live = false;
    };
  }, [tab?.id, tab?.versionId, hasVersions, versions]);
  return base;
}

/** 改参数和参考：先把正在编辑的文字交出去，带上修订号；needs_confirm 时先确认 */
export function useEdit(tab: CommandTab, before?: () => Promise<void>) {
  const notify = useNotifications();
  const [dialog, ask] = useAsk();
  const run = async <T,>(fn: () => Promise<T>) => {
    try {
      await before?.();
      return await fn();
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
      return null;
    }
  };
  const setParams = async (patch: Partial<GenerationSettings>) => {
    await before?.();
    const call = (dropReferences?: boolean) =>
      invokeUI('params.set', {
        tabId: tab.id,
        expectedRevision: tab.revision,
        patch,
        ...(dropReferences ? { dropReferences } : {}),
      });
    const tell = (notes: string[]) =>
      notes.length &&
      notify({
        text: patch.model
          ? `已换成 ${modelName(patch.model)}：${notes.join('；')}`
          : notes.join('；'),
      });
    try {
      tell((await call()).notes);
    } catch (e) {
      if (errorCode(e) !== 'needs_confirm') {
        notify({ text: (e as Error).message, tone: 'error' });
        return;
      }
      const n = refCount(tab.project);
      if (
        !(await ask({
          title: `换成 ${modelName(patch.model)}？`,
          body: `${modelName(patch.model)} 不支持 Vibe 和精确参考，这一版会去掉现在的 ${n} 个参考图。`,
          ok: '换模型',
        }))
      )
        return;
      try {
        tell((await call(true)).notes);
      } catch (err) {
        notify({ text: (err as Error).message, tone: 'error' });
      }
    }
  };
  return { setParams, run, dialog };
}

// ---------- 参数 ----------
export function Row({
  label,
  help,
  changed,
  baseText,
  baseName,
  onReset,
  children,
}: {
  label: ReactNode;
  help?: ReactNode;
  changed: boolean;
  baseText: string;
  baseName: string;
  onReset: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`prow ${changed ? 'mod' : ''}`}>
      <div className="pl">
        {label}
        {help && <small>{help}</small>}
      </div>
      <div className="pc">
        {children}
        <span className="pm-slot">
          {changed && (
            <span className="pmod" data-enter="fade">
              已修改
              <button
                className="btn quiet sm icon"
                aria-label="恢复"
                data-tip={`恢复成${baseName}的 ${baseText}`}
                onClick={onReset}
              >
                <Icon name="arrow-go-back-line" />
              </button>
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

export function Drop({
  label,
  value,
  items,
  off,
  tip,
}: {
  label: string;
  value: ReactNode;
  items: MenuEntry[];
  off?: boolean;
  tip?: string;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        ref={btn}
        className={`field sm pdd ${open ? 'open' : ''} ${off ? 'off' : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-disabled={off || undefined}
        data-tip={off ? tip : undefined}
        onClick={() => !off && setOpen(!open)}
      >
        <span className="mono">{value}</span>
        <Icon name="arrow-down-s-line" />
      </button>
      <MenuPop open={open} onClose={() => setOpen(false)} anchor={btn} items={items} />
    </>
  );
}
