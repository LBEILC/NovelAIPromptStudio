import { useEffect, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Autocomplete, Button, type Suggestion } from '../ui';
import { analyzePromptBatch, formatTag } from '../lib/prompt.js';
import type { Tag } from '../shared/types';

export function AddTags({
  section,
  block,
  tags,
  onAdd,
}: {
  section: number;
  block: number;
  tags: Tag[];
  onAdd: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [items, setItems] = useState<Suggestion[]>([]);
  const analysis = useMemo(() => analyzePromptBatch(value, tags), [value, tags]);
  const drop = useDroppable({
    id: `end:${section}:${block}`,
    data: { target: { section, block } },
  });
  useEffect(() => {
    let active = true;
    if (!value.trim() || /[,，\n]/.test(value)) {
      setItems([]);
      return;
    }
    const timer = setTimeout(() => {
      window.studio
        ?.suggestTags(value)
        .then((result) => {
          if (active && result.ok)
            setItems(
              result.items.map((item) => ({
                id: item.tag,
                text: item.tag,
                translation: item.translation,
                count: item.count ? String(item.count) : '',
              })),
            );
        })
        .catch(() => {
          if (active) setItems([]);
        });
    }, 120);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [value]);
  const add = (text: string) => {
    if (!text.trim()) return;
    onAdd(text);
    setValue('');
    setItems([]);
  };
  return (
    <div className="wb-add-tags" ref={drop.setNodeRef} data-drop-active={drop.isOver || undefined}>
      {editing ? (
        <>
          <Autocomplete
            autoFocus
            onDismiss={() => {
              if (!value.trim()) setEditing(false);
            }}
            label="输入中文或英文"
            placeholder="输入中文或英文"
            value={value}
            onChange={setValue}
            items={items}
            onSelect={(item) => add(item.text)}
            directAdd={{
              label: `将添加 ${analysis.tags.length} 个 · ${analysis.duplicateCount} 个重复`,
              onSelect: () => add(analysis.tags.map(formatTag).join(', ')),
            }}
          />
          <span className="nps-help">
            回车添加。用逗号或换行可以一次添加多个；输入中文会找对应的英文 Tag。
          </span>
          {value && (
            <span className="nps-help">
              将添加 {analysis.tags.length} 个 · {analysis.duplicateCount} 个重复
            </span>
          )}
        </>
      ) : (
        <Button
          className="wb-add-trigger"
          variant="quiet"
          size="small"
          onClick={() => setEditing(true)}
        >
          <i className="ri-add-line" />
          输入中文或英文
        </Button>
      )}
    </div>
  );
}
