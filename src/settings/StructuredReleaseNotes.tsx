import {
  RELEASE_AREAS,
  RELEASE_ICONS,
  RELEASE_KINDS,
  releaseCounts,
  type ReleaseItem,
  type ReleaseNotes,
} from '../lib/releaseNotes.js';
export function StructuredReleaseNotes({ notes }: { notes: ReleaseNotes }) {
  const highlights = notes.items.filter((item) => item.highlight).slice(0, 2);
  const rest = notes.items.filter((item) => !highlights.includes(item));
  const title = (item: ReleaseItem) => (
    <>
      <b>{item.title}</b>
      <span className="rn-area">{RELEASE_AREAS[item.area]}</span>
    </>
  );
  return (
    <div className="rn selectable">
      <div className="rn-head">
        <b>{notes.version} 更新说明</b>
        <span>
          {notes.date} · {releaseCounts(notes)}
        </span>
      </div>
      {!!highlights.length && (
        <div className="rn-hl">
          {highlights.map((item, i) => (
            <div className="rn-card" key={i}>
              <span className="rn-ic">
                <i
                  className={`ri-${item.icon ? RELEASE_ICONS[item.icon] : RELEASE_KINDS.find(([kind]) => kind === item.kind)?.[2]}`}
                />
              </span>
              <div className="rn-tx">
                <div className="rn-t">{title(item)}</div>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="rn-groups">
        {RELEASE_KINDS.map(([kind, label, icon]) => {
          const items = rest.filter((item) => item.kind === kind);
          return items.length ? (
            <section className="rn-g" key={kind}>
              <h5>
                <i className={`ri-${icon}`} />
                {label}
              </h5>
              <ul>
                {items.map((item, i) => (
                  <li key={i}>
                    <span className="rn-t">{title(item)}</span>
                    <span className="rn-d">{item.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null;
        })}
      </div>
    </div>
  );
}
