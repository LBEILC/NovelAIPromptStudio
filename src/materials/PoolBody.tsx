// 随机池展开后的内容（doc/design.md 2.44）：一行一个条目，每条可以调抽中的概率（默认一样），
// 回车加一条；也可以整份按文本编辑（一行一个，保存后概率都回到一样）。
import { useState } from 'react';
import { Icon, Kbd, Stepper, isMod } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { invokeUI } from '../lib/commands';
import type { Material } from '../shared/materials';
import { POOLS_CHANGED } from '../workbench/RandomBlock';

export const poolChanged = () => window.dispatchEvent(new Event(POOLS_CHANGED));

export function PoolBody({ m, onChange }: { m: Material; onChange: (item: Material) => void }) {
  const notify = useNotifications();
  const entries = m.entries || [];
  const total = entries.reduce((n, e) => n + e.chance, 0);
  const [adding, setAdding] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [bulk, setBulk] = useState<string | null>(null);
  const run = async <T extends { item: Material }>(p: Promise<T>) => {
    try {
      const { item } = await p;
      onChange(item);
      poolChanged();
      return true;
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
      return false;
    }
  };
  const add = async (source: string) => {
    const lines = source
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!lines.length) return;
    for (const text of lines)
      if (!(await run(invokeUI('material.pool.entry.add', { id: m.id, text })))) return;
    setAdding('');
  };
  const saveText = async () => {
    const e = editing;
    setEditing(null);
    const text = e?.text.trim();
    const old = entries.find((x) => x.id === e?.id);
    if (!e || !old || !text || text === old.text) return;
    await run(invokeUI('material.pool.entry.update', { id: m.id, entryId: e.id, text }));
  };
  const saveBulk = async () => {
    if (bulk === null) return;
    if (await run(invokeUI('material.pool.replace', { id: m.id, text: bulk }))) {
      setBulk(null);
      notify({ text: '已保存', tone: 'success' });
    }
  };

  if (bulk !== null)
    return (
      <>
        <label className="field mat-edit mono">
          <textarea
            autoFocus
            rows={Math.min(12, Math.max(4, bulk.split('\n').length + 1))}
            spellCheck={false}
            aria-label="随机池条目"
            value={bulk}
            onChange={(e) => setBulk(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                setBulk(null);
              } else if (e.key === 'Enter' && isMod(e)) {
                e.preventDefault();
                void saveBulk();
              }
            }}
          />
        </label>
        <span className="help">
          一行一条，空行不算。
          {entries.some((e) => e.chance !== 1) ? '保存后每条的抽中概率都回到一样。' : ''}
        </span>
        <div className="mat-acts">
          <span className="help key-hint">
            <Kbd keys="Mod Enter" />
            <span>保存</span>
            <Kbd keys="Esc" />
            <span>取消</span>
          </span>
          <span className="sp" />
          <button className="btn quiet sm" onClick={() => setBulk(null)}>
            取消
          </button>
          <button className="btn ink sm" onClick={() => void saveBulk()}>
            保存
          </button>
        </div>
      </>
    );

  return (
    <>
      <div className="mat-sub pool-list">
        <div className="mat-sub-h">
          <span className="label">条目 · {entries.length}</span>
          <span className="sp" />
          {entries.length > 0 && (
            <span
              className="label pool-chance-h"
              data-tip="数字越大越容易抽到；默认每条都是 1，抽中的机会一样"
            >
              抽中概率
            </span>
          )}
        </div>
        {entries.map((e) => (
          <div className="pool-it" key={e.id}>
            {editing?.id === e.id ? (
              <label className="field sm pool-edit">
                <input
                  autoFocus
                  aria-label="条目内容"
                  value={editing.text}
                  spellCheck={false}
                  onChange={(ev) => setEditing({ id: e.id, text: ev.target.value })}
                  onBlur={() => void saveText()}
                  onKeyDown={(ev) => {
                    if (ev.nativeEvent.isComposing) return;
                    if (ev.key === 'Enter') (ev.target as HTMLInputElement).blur();
                    if (ev.key === 'Escape') {
                      ev.stopPropagation();
                      setEditing(null);
                    }
                  }}
                />
              </label>
            ) : (
              <span
                className="pool-text mono"
                role="button"
                tabIndex={0}
                data-tip="点击修改"
                onClick={() => setEditing({ id: e.id, text: e.text })}
                onKeyDown={(ev) =>
                  (ev.key === 'Enter' || ev.key === ' ') && setEditing({ id: e.id, text: e.text })
                }
              >
                {e.text}
              </span>
            )}
            <Stepper
              label="抽中概率"
              value={e.chance}
              step={0.5}
              min={0.5}
              max={10}
              digits={1}
              format={(v) => String(v)}
              onChange={(chance) =>
                void run(
                  invokeUI('material.pool.entry.update', { id: m.id, entryId: e.id, chance }),
                )
              }
            />
            <span className="pool-pct mono">
              {total ? Math.round((e.chance / total) * 100) : 0}%
            </span>
            <button
              className="btn quiet sm icon"
              aria-label="删除这一条"
              onClick={() =>
                void run(invokeUI('material.pool.entry.delete', { id: m.id, entryId: e.id }))
              }
            >
              <Icon name="close-line" />
            </button>
          </div>
        ))}
        <label className="field sm pool-add">
          <Icon name="add-line" />
          <input
            aria-label="加一条"
            placeholder="加一条，回车加入；粘贴多行时一行一条"
            value={adding}
            spellCheck={false}
            onChange={(e) => setAdding(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text');
              // 粘贴了好几行：直接一行一条加进去（单行输入框会把换行吞掉）
              if (!text.includes('\n')) return;
              e.preventDefault();
              void add(adding + text);
            }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                void add(adding);
              }
              if (e.key === 'Escape' && adding) {
                e.stopPropagation();
                setAdding('');
              }
            }}
          />
        </label>
      </div>
      <div className="mat-acts">
        <span className="help">
          提示词里写 <code className="mono">__{m.name}__</code>，或在工作台块之间点“随机块”
        </span>
        <span className="sp" />
        <button className="btn sm" onClick={() => setBulk(entries.map((e) => e.text).join('\n'))}>
          <Icon name="edit-line" />
          按文本编辑
        </button>
      </div>
    </>
  );
}
