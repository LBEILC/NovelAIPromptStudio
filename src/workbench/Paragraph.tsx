import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Banner, TextArea } from '../ui';
import type { PromptBlock } from '../lib/promptDocument';

export function ParagraphEditor({
  block,
  children,
  onSave,
  translateRequest = 0,
}: {
  block: PromptBlock;
  children: ReactNode;
  onSave: (text: string, translation: string) => void;
  translateRequest?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [english, setEnglish] = useState(block.content);
  const [chinese, setChinese] = useState(block.translation || '');
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [changedChinese, setChangedChinese] = useState(false);
  const request = useRef('');
  const handledTranslation = useRef(0);
  useEffect(() => {
    let active = true;
    window.studio
      ?.getAISettings()
      .then((settings) => {
        if (active) setConfigured(!!settings.model);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (request.current) void window.studio?.cancelParagraph(request.current);
      request.current = '';
    };
  }, [editing]);
  const cancel = () => {
    if (request.current) void window.studio?.cancelParagraph(request.current);
    request.current = '';
    setBusy('');
  };
  const transform = async (direction: 'translate' | 'rewrite', text?: string) => {
    const id = crypto.randomUUID();
    request.current = id;
    setBusy(direction);
    setError('');
    try {
      const result = await window.studio!.transformParagraph({
        id,
        text: text ?? (direction === 'translate' ? english : chinese),
        direction,
      });
      if (request.current !== id) return;
      if (!result.ok) throw new Error(result.error);
      if (direction === 'translate') setChinese(result.text);
      else setEnglish(result.text);
      setChangedChinese(false);
    } catch (e) {
      if (request.current === id) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (request.current === id) {
        request.current = '';
        setBusy('');
      }
    }
  };
  useEffect(() => {
    if (!translateRequest || handledTranslation.current === translateRequest) return;
    handledTranslation.current = translateRequest;
    const text = editing ? english : block.content;
    // TODO(design): 无 AI 配置时块菜单是否直接禁用待定；当前打开编辑器并沿用已有禁用提示。
    if (!editing) {
      setEnglish(block.content);
      setChinese(block.translation || '');
    }
    setEditing(true);
    let active = true;
    void window.studio
      ?.getAISettings()
      .then((settings) => {
        if (!active) return;
        setConfigured(!!settings.model);
        if (settings.model && !busy) void transform('translate', text);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [translateRequest]);
  if (!editing)
    return (
      <div
        role="button"
        tabIndex={0}
        aria-label="编辑段落"
        onClick={() => {
          setEnglish(block.content);
          setChinese(block.translation || '');
          setEditing(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setEditing(true);
          }
        }}
      >
        {children}
      </div>
    );
  return (
    <div className="wb-paragraph-editor">
      <TextArea
        aria-label="英文段落"
        className="wb-prose-input"
        value={english}
        onChange={(event) => setEnglish(event.target.value)}
      />
      <div className="wb-editor-actions">
        <Button
          variant="quiet"
          size="small"
          disabled={!configured || !!busy}
          disabledReason="请先在设置里配置 AI 服务"
          loading={busy === 'translate'}
          onClick={() => void transform('translate')}
        >
          <i className="ri-arrow-down-line" />
          译成中文
        </Button>
        <Button
          variant="quiet"
          size="small"
          disabled={!configured || !!busy}
          disabledReason="请先在设置里配置 AI 服务"
          loading={busy === 'rewrite'}
          onClick={() => void transform('rewrite')}
        >
          <i className="ri-arrow-up-line" />
          按中文改写英文
        </Button>
        <span className="nps-help wb-editor-note">发给 NovelAI 的是上面的英文</span>
      </div>
      <TextArea
        aria-label="中文段落"
        value={chinese}
        onChange={(event) => {
          setChinese(event.target.value);
          setChangedChinese(true);
        }}
      />
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="wb-editor-actions">
        {changedChinese && (
          <span className="nps-help wb-editor-warning">中文已修改，英文还没有更新</span>
        )}
        <Button
          variant="quiet"
          onClick={() => {
            cancel();
            if (!busy) setEditing(false);
          }}
        >
          取消
        </Button>
        <Button
          variant="ink"
          disabled={!!busy}
          onClick={() => {
            onSave(english, chinese);
            setEditing(false);
          }}
        >
          完成
        </Button>
      </div>
    </div>
  );
}
