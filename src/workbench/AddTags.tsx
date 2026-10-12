import { useEffect, useMemo, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { Autocomplete, type Suggestion } from '../ui';
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
                // TODO(design): Neither existing dictionary stores usage counts; define the missing-value presentation.
                count: '',
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
      <Autocomplete
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
      {value && (
        <span className="nps-help">
          将添加 {analysis.tags.length} 个 · {analysis.duplicateCount} 个重复
        </span>
      )}
    </div>
  );
}
