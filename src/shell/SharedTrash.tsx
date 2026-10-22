// 删除共用的图之前先问（doc/design.md 2.23，1.5.6，用户 10-22："如果有牵连，还是要用户做决定"）：
// 一张图同时在别的作品里（只会因为"作为新作品打开"）时，问是只从这个作品去掉，还是移入回收站。
// 没有牵连的不问；批量里有好几张共用的只问一次，选择对这几张一起生效。
import { useRef, useState } from 'react';
import { Dialog } from '../kit/dialog';
import type { WorkRef } from '../shared/types';
import { namedWork, workLabel } from '../lib/workNames';

export type TrashChoice = 'cancel' | 'detach' | 'trash';
type Ask = {
  /** 这次要删的图 */
  ids: string[];
  /** 每张图属于哪几个作品 */
  refsOf: (id: string) => WorkRef[] | undefined;
  /** 在哪个作品里删的（图片库的作品组、工作台的标签页）；没有作品上下文时只能移入回收站 */
  workId?: string;
};
type Shown = { title: string; body: string; detach: string; trash: string };

// 没起名的作品不写名字（名字就是原图文件名，多半是哈希）：说"另一个作品"
const role = (r: WorkRef) =>
  workLabel(r.workName, '另一个作品') +
  (r.role === 'origin' ? '的原图' : `${namedWork(r.workName) ? '' : '的'}第 ${r.number} 版的图`);

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
    const here = refs.some((r) => r.workId === workId);
    // 有作品上下文时只说别处；当前这个作品不再列一遍
    const elsewhere = refs.filter((r) => r.workId !== workId);
    const otherWorks = new Map(elsewhere.map((r) => [r.workId, r.workName]));
    const names = [...otherWorks.values()];
    const allNamed = names.every((n) => namedWork(n)) && names.length <= 2;
    const rest = ids.length - shared.length;
    const one = shared.length === 1;
    const where = allNamed ? `「${names.join('」「')}」` : '别的作品';
    const title = workId
      ? one
        ? `这张图也在${where}里`
        : `其中 ${shared.length} 张也在${where}里`
      : one
        ? `这张图在 ${otherWorks.size} 个作品里`
        : `其中 ${shared.length} 张在几个作品里`;
    const roles = [...new Set((one ? elsewhere : []).map(role))];
    const body = one
      ? `它${workId ? '也' : ''}是${roles.join('，也是')}。`
      : allNamed
        ? `这几张也在${where}里。`
        : `这几张也在另外 ${otherWorks.size} 个作品里。`;
    return new Promise((resolve) => {
      answer.current = (choice) => resolve({ choice, shared });
      setShown({
        title,
        body: workId
          ? `${body}${rest ? `其余 ${rest} 张照常移入回收站。` : ''}`
          : `${body}移入回收站后各处都没有了。`,
        // 按钮不带作品名：名字可能很长，弹框里"这个作品"已经清楚
        detach: here ? '只从这个作品里去掉' : '',
        trash: one ? '移入回收站' : '全部移入回收站',
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
