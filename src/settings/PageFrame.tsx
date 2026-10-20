import { useRef, type ReactNode } from 'react';
import { useScrollArea } from '../ui';

export function SettingsFrame({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  useScrollArea(scroll);
  return (
    <section className="settings-page settings-scroll" ref={scroll}>
      <header className="settings-page-head">
        <div>
          <h1>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      </header>
      <div className="settings-main">
        <div className="settings-copy">{children}</div>
      </div>
      {footer && (
        <footer className="settings-page-foot">
          <div>{footer}</div>
        </footer>
      )}
    </section>
  );
}
