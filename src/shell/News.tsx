// 更新后的新功能（doc/design.md 2.36，1.8.2）：和完整引导同一张卡片，只放上次看过之后每一版标了重点的功能，最新的在前，最多 6 页；
// 跳过好几版的也能看到中间各版的重点，多出来的在最后一页按版本列标题，点了看更新日志。
// 每页写版本号、图标、标题和说明，更新说明里写了跳到哪的（goto）有"去试试"。只修 bug、没有重点的版本不弹（由外面判断）。
// 自动验收按 data-news / data-news-page 找元素。
import { useState } from 'react';
import { Icon } from '../kit/controls';
import { Dialog } from '../kit/dialog';
import { useSwap } from '../kit/motion';
import { RELEASE_ICONS, type ReleaseNotes } from '../lib/releaseNotes.js';
import type { newsSince } from '../app/changelog';

type Target = NonNullable<ReleaseNotes['items'][number]['goto']>;
type News = ReturnType<typeof newsSince>;

export function NewsCard({
  news,
  onClose,
  onGo,
  onChangelog,
}: {
  news: News | null;
  /** 看完、跳过都会调；由外面记成"看过" */
  onClose: () => void;
  onGo: (target: Target) => void;
  onChangelog: () => void;
}) {
  const [at, setAt] = useState(0);
  const [dir, setDir] = useState(0);
  // 关的时候外面把 news 清掉了，照最后那份淡出
  const [kept, setKept] = useState<News | null>(news);
  if (news && news !== kept) setKept(news);
  const data = news || kept;
  const pages = data
    ? [
        ...data.pages.map((p) => ({ key: `${p.version}:${p.item.title}`, page: p })),
        ...(data.more.length ? [{ key: 'more', page: null }] : []),
      ]
    : [];
  const i = Math.min(at, Math.max(0, pages.length - 1));
  const go = (n: number) => {
    setDir(n > i ? 1 : -1);
    setAt(n);
  };
  const close = () => {
    onClose();
    setTimeout(() => {
      setAt(0);
      setDir(0);
    }, 300);
  };
  const cur = pages[i] || { key: 'none', page: null };
  const swap = useSwap(cur, (v) => v.key);
  const last = i >= pages.length - 1;
  return (
    <Dialog
      open={!!news && pages.length > 0}
      onClose={close}
      label="新功能"
      className="onboard news"
      initialFocus=".ob-next"
      data={{ 'data-news-page': String(i + 1) }}
    >
      <div className="ob">
        <div className="ob-swap swap">
          {swap.map(({ key, value, leaving }) => (
            <div
              key={key}
              className={`ob-page ${leaving ? 'leaving' : ''}`}
              data-enter={dir > 0 ? 'right' : dir < 0 ? 'left' : 'fade'}
              aria-hidden={leaving || undefined}
            >
              {value.page ? (
                <>
                  <span className="news-ver">
                    <Icon
                      name={
                        RELEASE_ICONS[value.page.item.icon as keyof typeof RELEASE_ICONS] ||
                        'sparkling-2-line'
                      }
                    />
                    {value.page.version} 新功能
                  </span>
                  <h3>{value.page.item.title}</h3>
                  <p className="news-detail">{value.page.item.detail}</p>
                  {value.page.item.goto && (
                    <button
                      className="btn"
                      data-news={leaving ? undefined : 'go'}
                      tabIndex={leaving ? -1 : undefined}
                      onClick={() => {
                        close();
                        onGo(value.page!.item.goto!);
                      }}
                    >
                      去试试
                    </button>
                  )}
                </>
              ) : (
                <>
                  <span className="news-ver">
                    <Icon name="list-check-2" />
                    还有这些更新
                  </span>
                  <div className="news-more" data-scroll="">
                    {data?.more.map((m) => (
                      <div key={m.version}>
                        <span className="label mono">{m.version}</span>
                        <ul className="ob-points">
                          {m.titles.map((t) => (
                            <li key={t}>{t}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn"
                    data-news={leaving ? undefined : 'changelog'}
                    tabIndex={leaving ? -1 : undefined}
                    onClick={() => {
                      close();
                      onChangelog();
                    }}
                  >
                    查看更新日志
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <div className="acts">
          {pages.length > 1 && (
            <span className="ob-dots" aria-label={`第 ${i + 1} 页，共 ${pages.length} 页`}>
              {pages.map((p, n) => (
                <i key={p.key} className={n === i ? 'on' : ''} />
              ))}
            </span>
          )}
          {!last && (
            <button className="btn quiet" data-news="skip" onClick={close}>
              跳过
            </button>
          )}
          {i > 0 && (
            <button className="btn" data-news="back" onClick={() => go(i - 1)}>
              上一页
            </button>
          )}
          {last ? (
            <button className="btn ink ob-next" data-news="done" onClick={close}>
              知道了
            </button>
          ) : (
            <button className="btn ink ob-next" data-news="next" onClick={() => go(i + 1)}>
              下一页
            </button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
