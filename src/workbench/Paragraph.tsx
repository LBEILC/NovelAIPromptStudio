// 段落（doc/design.md 2.14）：点一下进入编辑，上面英文、下面中文，两个文字框都跟着内容长高（点开前后一样高，不在框里滚动）；
// 中间两个按钮让 AI 把另一边跟上（"翻译成中文""根据中文改写英文"）。发给 NovelAI 的永远是英文；改了中文还没改写英文时有提示。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invokeUI } from '../lib/commands';
import { Icon } from '../kit/controls';
import type { PromptBlock } from '../lib/promptDocument';

/** 跟着内容长高的文字框 */
export function AutoArea({
  value,
  onChange,
  className,
  autoFocus,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  className: string;
  autoFocus?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2 * (parseFloat(getComputedStyle(el).borderTopWidth) || 0)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={className}
      rows={1}
      autoFocus={autoFocus}
      aria-label={label}
      spellCheck={false}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function ParagraphEditor({
  block,
  language,
  onSave,
  translateRequest = 0,
  autoEdit = false,
  onDismiss,
  onEditing,
}: {
  block: PromptBlock;
  /** 显示：原文 / 译文 / 对照 */
  language: string;
  onSave: (text: string, translation: string) => void;
  translateRequest?: number;
  autoEdit?: boolean;
  onDismiss?: () => void;
  onEditing?: (on: boolean) => void;
}) {
  const [editing, setEditingState] = useState(autoEdit);
  const setEditing = (on: boolean) => {
    setEditingState(on);
    onEditing?.(on);
  };
  const [en, setEn] = useState(block.content);
  const [zh, setZh] = useState(block.translation || '');
  const [zhDirty, setZhDirty] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState<'' | 'translate' | 'rewrite'>('');
  const [error, setError] = useState('');
  const job = useRef('');
  const handled = useRef(0);
  useEffect(() => {
    let live = true;
    void invokeUI('settings.ai.get', {})
      .then((s) => live && setConfigured(!!s.model))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [editing]);
  useEffect(
    () => () => {
      if (job.current) void invokeUI('paragraph.cancel', { id: job.current });
    },
    [],
  );
  const transform = async (direction: 'translate' | 'rewrite', text?: string) => {
    const id = crypto.randomUUID();
    job.current = id;
    setBusy(direction);
    setError('');
    try {
      const r = await invokeUI('paragraph.transform', {
        request: { id, text: text ?? (direction === 'translate' ? en : zh), direction },
      });
      if (job.current !== id) return;
      if (!r.ok) throw new Error(r.error);
      if (direction === 'translate') setZh(r.text);
      else setEn(r.text);
      setZhDirty(false);
    } catch (e) {
      if (job.current === id) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (job.current === id) {
        job.current = '';
        setBusy('');
      }
    }
  };
  // 块菜单里的"翻译并分类"：打开编辑并翻译
  useEffect(() => {
    if (!translateRequest || handled.current === translateRequest) return;
    handled.current = translateRequest;
    const text = editing ? en : block.content;
    if (!editing) {
      setEn(block.content);
      setZh(block.translation || '');
    }
    setEditing(true);
    void invokeUI('settings.ai.get', {}).then((s) => {
      setConfigured(!!s.model);
      if (s.model) void transform('translate', text);
    });
  }, [translateRequest]);
  const open = () => {
    setEn(block.content);
    setZh(block.translation || '');
    setZhDirty(false);
    setError('');
    setEditing(true);
  };
  const cancel = () => {
    if (job.current) void invokeUI('paragraph.cancel', { id: job.current });
    job.current = '';
    setBusy('');
    setEditing(false);
    onDismiss?.();
  };
  if (!editing)
    return (
      <div
        className="para-view"
        role="button"
        tabIndex={0}
        aria-label="编辑段落"
        data-tip="点击编辑"
        onClick={open}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            open();
          }
        }}
      >
        {language !== 'translated' || !block.translation ? (
          <p className="prose selectable">{block.content}</p>
        ) : null}
        {language !== 'original' && block.translation ? (
          <p className={`trans selectable ${language === 'translated' ? 'only' : ''}`}>
            {block.translation}
          </p>
        ) : null}
      </div>
    );
  const off = !configured ? '请先在设置的"AI 服务"中完成配置' : '';
  return (
    <div
      className="editor"
      data-enter="fade"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          cancel();
        }
      }}
    >
      <AutoArea
        className="area prose-edit para-in"
        value={en}
        onChange={setEn}
        autoFocus
        label="英文段落"
      />
      <div className="row para-mid">
        <button
          className={`btn quiet sm ${busy === 'translate' ? 'loading' : ''} ${off ? 'is-off' : ''}`}
          data-tip={off || undefined}
          onClick={() => !off && !busy && void transform('translate')}
        >
          <Icon name={busy === 'translate' ? 'loader-4-line' : 'arrow-down-line'} />
          翻译成中文
        </button>
        <button
          className={`btn quiet sm ${busy === 'rewrite' ? 'loading' : ''} ${off ? 'is-off' : ''}`}
          data-tip={off || undefined}
          onClick={() => !off && !busy && void transform('rewrite')}
        >
          <Icon name={busy === 'rewrite' ? 'loader-4-line' : 'arrow-up-line'} />
          根据中文改写英文
        </button>
        <span className="help">生成时使用上方的英文</span>
      </div>
      <AutoArea
        className="area para-in"
        value={zh}
        label="中文段落"
        onChange={(v) => {
          setZh(v);
          setZhDirty(true);
        }}
      />
      {error && (
        <div className="banner danger" data-enter="fade">
          <Icon name="error-warning-line" />
          <span className="selectable">{error}</span>
        </div>
      )}
      <div className="row para-foot">
        <span className="help">{zhDirty ? '中文已修改，英文未同步' : ''}</span>
        <span className="sp" />
        <button className="btn quiet sm" onClick={cancel}>
          取消
        </button>
        <button
          className="btn ink sm"
          disabled={!!busy}
          onClick={() => {
            if (!en.trim()) {
              cancel();
              return;
            }
            onSave(en, zh);
            setEditing(false);
          }}
        >
          完成
        </button>
      </div>
    </div>
  );
}
