import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button, Banner, TextArea } from '../ui';
import type { PromptBlock } from '../lib/promptDocument';

export function ParagraphEditor({
  block,
  children,
  onSave,
}: {
  block: PromptBlock;
  children: ReactNode;
  onSave: (text: string, translation: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [english, setEnglish] = useState(block.content);
  const [chinese, setChinese] = useState(block.translation || '');
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [changedChinese, setChangedChinese] = useState(false);
  const request = useRef('');
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
  const transform = async (direction: 'translate' | 'rewrite') => {
    const id = crypto.randomUUID();
    request.current = id;
    setBusy(direction);
    setError('');
    try {
      const result = await window.studio!.transformParagraph({
        id,
        text: direction === 'translate' ? english : chinese,
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
          按中文改写英文
        </Button>
      </div>
      <span className="nps-help">发给 NovelAI 的是上面的英文</span>
      <TextArea
        aria-label="中文段落"
        value={chinese}
        onChange={(event) => {
          setChinese(event.target.value);
          setChangedChinese(true);
        }}
      />
      {changedChinese && <span className="nps-help">改了中文还没有改写英文</span>}
      {error && <Banner tone="danger">{error}</Banner>}
      <div className="wb-editor-actions">
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
