import { useState } from 'react';
import { Icon, Seg, Slider, Switch } from '../kit/controls';
import { Pop } from '../kit/layer';
import { MenuItems } from '../kit/menu';
import type { LibraryProps } from '../library/types';
import type { GalleryDisplay } from './Grid';
import { COVERS, GROUPS, MERGE_HELP, PROMPT_SCOPES, ROW, SIM, SORTS } from './toolOptions';

export function ViewPop({
  p,
  open,
  onClose,
  rowHeight,
  onRowHeight,
  display,
  onDisplay,
}: {
  p: LibraryProps;
  open: boolean;
  onClose: () => void;
  rowHeight: number;
  onRowHeight: (h: number) => void;
  display: GalleryDisplay;
  onDisplay: (patch: Partial<GalleryDisplay>) => void;
}) {
  const [sort, setSort] = useState(false);
  const sim = p.grouping.promptScope === 'similar';
  const group =
    p.grouping.promptScope === 'work' || p.grouping.promptScope === 'separate'
      ? p.grouping.promptScope
      : 'prompt';
  return (
    <>
      <Pop
        open={open}
        onClose={() => {
          setSort(false);
          onClose();
        }}
        anchor='[data-trigger="lview"]'
        trigger='[data-trigger="lview"]'
        place="below-right"
        className="popover wide lsp lview-pop"
        label="视图"
      >
        <div className="frow">
          <span className="label">大小</span>
          <span className="lsize">
            <Slider {...ROW} value={rowHeight} onChange={onRowHeight} label="大小" />
            <span className="lval mono">{rowHeight}</span>
          </span>
        </div>
        <div className="frow">
          <span className="label">排序</span>
          <button
            className={`field sm ldd ${sort ? 'open' : ''}`}
            data-trigger="lsort"
            onClick={() => setSort(!sort)}
          >
            <span>{SORTS.find(([k]) => k === p.sort)?.[1] || SORTS[0][1]}</span>
            <Icon name="arrow-down-s-line" />
          </button>
        </div>
        {/* 分组（1.5.6，用户 10-22："给用户太多选项可能增加使用负担"）：三选一，按提示词的三种方式收在里面，选了才展开 */}
        <div className="frow top">
          <span className="label">分组</span>
          <div className="lcolm">
            <Seg
              items={GROUPS}
              value={group}
              label="分组"
              onChange={(g) =>
                p.onGroupingChange({
                  promptScope: g === 'prompt' ? display.promptScope || 'full' : g,
                })
              }
            />
            <span className="help lmerge-help">{MERGE_HELP[p.grouping.promptScope]}</span>
          </div>
        </div>
        <div className={`expand ${group === 'work' ? 'open' : ''}`}>
          <div>
            <div className="frow">
              <span className="label">封面</span>
              <Seg
                label="封面"
                items={COVERS}
                value={display.cover}
                onChange={(cover) => onDisplay({ cover })}
              />
            </div>
          </div>
        </div>
        <div className={`expand ${group === 'prompt' ? 'open' : ''}`}>
          <div>
            <div className="frow">
              <span className="label">方式</span>
              <Seg
                label="按提示词分组的方式"
                items={PROMPT_SCOPES}
                value={
                  (group === 'prompt'
                    ? p.grouping.promptScope
                    : display.promptScope || 'full') as (typeof PROMPT_SCOPES)[number][0]
                }
                onChange={(promptScope) => {
                  onDisplay({ promptScope });
                  p.onGroupingChange({ promptScope });
                }}
              />
            </div>
            <div className={`expand ${sim ? 'open' : ''}`}>
              <div>
                <div className="frow">
                  <span className="label">相似度</span>
                  <span className="lsize">
                    <Slider
                      {...SIM}
                      value={p.grouping.similarityThreshold}
                      label="相似度"
                      onChange={(similarityThreshold) =>
                        p.onGroupingChange({ similarityThreshold })
                      }
                    />
                    <span className="lval mono">{p.grouping.similarityThreshold}%</span>
                  </span>
                </div>
              </div>
            </div>
            <div className="frow">
              <span className="label">Vibe</span>
              <span className="lswrow">
                <Switch
                  on={p.grouping.mergeVibes}
                  label="Vibe 不同的也合并"
                  onChange={(mergeVibes) => p.onGroupingChange({ mergeVibes })}
                />
                <span>不同的也合并</span>
              </span>
            </div>
          </div>
        </div>
      </Pop>
      <Pop
        open={open && sort}
        onClose={() => setSort(false)}
        anchor='[data-trigger="lsort"]'
        trigger='[data-trigger="lsort"]'
        className="menu lsp"
        restoreFocus
      >
        <MenuItems
          onClose={() => setSort(false)}
          items={SORTS.map(([k, t]) => ({
            label: t,
            checked: p.sort === k,
            onSelect: () => p.onSortChange(k),
          }))}
        />
      </Pop>
    </>
  );
}
