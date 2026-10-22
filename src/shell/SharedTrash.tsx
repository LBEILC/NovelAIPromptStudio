// 删除共用的图之前先问（doc/design.md 2.23，1.5.6，用户 10-22："如果有牵连，还是要用户做决定"）：
// 一张图同时在别的作品里（只会因为"作为新作品打开"）时，问是只从这个作品去掉，还是移入回收站。
// 没有牵连的不问；批量里有好几张共用的只问一次，选择对这几张一起生效。
import { useRef, useState } from 'react';
import { Dialog } from '../kit/dialog';
import type { WorkRef } from '../shared/types';

export type TrashChoice = 'cancel' | 'detach' | 'trash';
type Ask = {
  /** 这次要删的图 */
  ids: string[];
  /** 每张图属于哪几个作品 */
  refsOf: (id: string) => WorkRef[] | undefined;
  /** 在哪个作品里删的（图片库的作品组、工作台的标签页）；没有作品上下文时只能移入回收站 */
  workId?: string;
};
type Shown = { title: string; body: string; detach: string; trash: string; context?: string };

const role = (r: WorkRef) =>
  `「${r.workName}」${r.role === 'origin' ? '的原图' : `第 ${r.number} 版的图`}`;

/** ask() 返回用户的选择和共用的那几张；没有共用的直接返回 trash，不弹框 */
export function useSharedTrash() {
  const [shown, setShown] = useState<Shown | null>(null);
  const answer = useRef<(c: TrashChoice) => void>(() => {});
  const last = useRef<Shown | null>(null);
  if (shown) last.current = shown;
  const ask = ({
    ids,
    refsOf,
    workId,
  }: Ask): Promise<{ choice: TrashChoice; shared: string[] }> => {
    const works = (id: string) => [...new Set((refsOf(id) || []).map((r) => r.workId))];
    const shared = ids.filter((id) =>
      workId ? works(id).some((w) => w !== workId) : works(id).length > 1,
    );
    if (!shared.length) return Promise.resolve({ choice: 'trash', shared });
    const refs = shared.flatMap((id) => refsOf(id) || []);
    const here = refs.find((r) => r.workId === workId);
    const elsewhere = [...new Set(refs.filter((r) => r.workId !== workId).map((r) => r.workName))];
    const rest = ids.length - shared.length;
    const one = shared.length === 1;
    const title = one
      ? `这张图也在「${elsewhere.join('」「')}」里`
      : `其中 ${shared.length} 张也在别的作品里`;
    const body = one
      ? `它是${(refsOf(shared[0]) || []).map(role).join('，也是')}。`
      : `这几张也在「${elsewhere.join('」「')}」里。`;
    return new Promise((resolve) => {
      answer.current = (choice) => resolve({ choice, shared });
      setShown({
        title,
        body: workId
          ? `${body}${rest ? `其余 ${rest} 张照常移入回收站。` : ''}`
          : `${body}移入回收站后各处都没有了。`,
        detach: here ? `只从「${here.workName}」里去掉` : '',
        trash: one ? '移入回收站' : '全部移入回收站',
        context: here?.workName,
      });
    });
  };
  const close = (c: TrashChoice) => {
    setShown(null);
    answer.current(c);
  };
  const o = shown || last.current;
  const node = (
    <Dialog
      open={!!shown}
      onClose={() => close('cancel')}
      label={o?.title || ''}
      initialFocus={o?.detach ? '.acts .btn.ink' : undefined}
    >
      {o && (
        <>
          <h3>{o.title}</h3>
          <p>{o.body}</p>
          <div className="acts">
            <button className="btn quiet" onClick={() => close('cancel')}>
              取消
            </button>
            {o.detach && (
              <button className="btn ink" onClick={() => close('detach')}>
                {o.detach}
              </button>
            )}
            <button className="btn line-danger" onClick={() => close('trash')}>
              {o.trash}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
  return [node, ask] as const;
}
