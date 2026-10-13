import { writeClipboardText } from '../lib/clipboard';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Tag, type TagCategory as UICategory } from '../ui';
import { createPromptDocument, type PromptBlock } from '../lib/promptDocument';
import { formatPositivePromptForCopy } from '../lib/promptStructure.js';
import type { ImageRecord, Tag as PromptTag, TagCategory } from '../shared/types';

const categories: Record<TagCategory, UICategory> = {
  ArtistEra: 'artist-era',
  Subject: 'subject',
  Identity: 'identity',
  Body: 'body',
  Clothing: 'clothing',
  Action: 'action',
  Environment: 'environment',
  Composition: 'composition',
  StyleQuality: 'style',
  Unsorted: 'unsorted',
};
const labels: Record<TagCategory, string> = {
  ArtistEra: '风格与画师',
  Subject: '主体',
  Identity: '身份',
  Body: '身体',
  Clothing: '服饰',
  Action: '动作',
  Environment: '环境',
  Composition: '构图',
  StyleQuality: '风格与质量',
  Unsorted: '未分类',
};

export function libraryPositivePrompt(project: ImageRecord) {
  const document = createPromptDocument(project);
  const positive = document.scopes.filter((section) => section.scope.polarity === 'prompt');
  // A single base scope is copied byte-for-byte, including its surrounding whitespace.
  return positive.length === 1
    ? positive[0].scope.raw_prompt
    : formatPositivePromptForCopy(project);
}

function TagBlock({ block, annotations }: { block: PromptBlock; annotations: PromptTag[] }) {
  const [expanded, setExpanded] = useState(false);
  const [limit, setLimit] = useState(Infinity);
  const measurement = useRef<HTMLDivElement>(null);
  const moreMeasurement = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const node = measurement.current!;
    const measure = () => {
      const tops = [...node.children].map((child) => (child as HTMLElement).offsetTop);
      const second = tops.find((top) => top > (tops[0] ?? 0));
      const third = second == null ? -1 : tops.findIndex((top) => top > second);
      let visible = third;
      if (visible > 0) {
        const gap = parseFloat(getComputedStyle(node).columnGap) || 0;
        const moreWidth = moreMeasurement.current?.getBoundingClientRect().width || 0;
        while (visible > 0 && tops[visible - 1] === second) {
          const last = node.children[visible - 1] as HTMLElement;
          if (last.offsetLeft + last.offsetWidth + gap + moreWidth <= node.clientWidth) break;
          visible--;
        }
      }
      setLimit(third < 0 ? Infinity : Math.max(1, visible));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [block]);
  const tags = block.tags.map((tag, index) => {
    const annotation = annotations.find((candidate) => candidate.tag === tag.tag);
    const category = annotation?.category || 'Unsorted';
    return (
      <Tag
        key={index}
        text={tag.tag}
        translation={annotation?.translation}
        weight={String(tag.weight)}
        category={categories[category]}
        categoryLabel={labels[category]}
      />
    );
  });
  return (
    <div className="library-tags-container">
      <div className="library-tags library-tags-measure" ref={measurement} aria-hidden="true">
        {tags}
      </div>
      <Button
        ref={moreMeasurement}
        className="library-tags-more-measure"
        aria-hidden="true"
        tabIndex={-1}
        variant="quiet"
        size="small"
      >
        还有 {tags.length} 个
      </Button>
      <div className="library-tags">
        {expanded ? tags : tags.slice(0, limit)}
        {!expanded && limit < tags.length && (
          <Button variant="quiet" size="small" onClick={() => setExpanded(true)}>
            还有 {tags.length - limit} 个
          </Button>
        )}
      </div>
    </div>
  );
}

export function LibraryPrompt({ project }: { project: ImageRecord }) {
  const document = useMemo(() => createPromptDocument(project), [project]);
  return (
    <div className="library-doc" key={project.id}>
      {document.scopes.map((section) => {
        const scope = section.scope;
        if (!scope.raw_prompt) return null;
        const negative = scope.polarity === 'undesired';
        const title =
          scope.kind === 'base'
            ? negative
              ? '负面提示词'
              : scope.label
            : `${/^Character \d+$/i.test(scope.character.label) || !scope.character.label ? `角色 ${scope.characterIndex + 1}` : scope.character.label}${negative ? ' · 负面提示词' : ''}`;
        const content = section.blocks.map((block, index) => (
          <div className="library-block" key={index}>
            <div className="library-block-label">
              {block.type === 'tags'
                ? `Tag 块${block.label ? ` · ${block.label}` : ''} · ${block.tags.length} 个`
                : `段落${block.label ? ` · ${block.label}` : ''}`}
            </div>
            {block.type === 'tags' ? (
              <TagBlock block={block} annotations={scope.tags} />
            ) : (
              <>
                <p className="library-prose">{block.content}</p>
                {scope.tags.find(
                  (tag) => tag.segment_type === 'text_block' && tag.tag === block.content,
                )?.translation && (
                  <p className="library-translation">
                    {
                      scope.tags.find(
                        (tag) => tag.segment_type === 'text_block' && tag.tag === block.content,
                      )?.translation
                    }
                  </p>
                )}
              </>
            )}
          </div>
        ));
        return negative ? (
          <details key={scope.key}>
            <summary className="library-section-title">
              <i className="ri-arrow-right-s-line disclosure-icon" aria-hidden="true" />
              {title}
              <Button
                size="small"
                variant="quiet"
                aria-label={`复制${title}`}
                onClick={(event) => {
                  event.preventDefault();
                  void writeClipboardText(scope.raw_prompt);
                }}
              >
                <i className="ri-file-copy-line" />
              </Button>
            </summary>
            {content}
          </details>
        ) : (
          <section key={scope.key}>
            <div className="library-section-title">
              {title}
              <small>{section.blocks.length} 块</small>
            </div>
            {content}
          </section>
        );
      })}
    </div>
  );
}
