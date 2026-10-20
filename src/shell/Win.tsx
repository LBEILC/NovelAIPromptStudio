import { useMemo, useState, type ReactNode } from 'react';
import { WinProvider } from '../kit/layer';
import { TipLayer } from '../kit/tip';
import { ScrollLayer } from '../kit/ScrollLayer';

/** 整个窗口（.win）：标题栏、页面、浮层、通知都在它里面。浮层按它定位。 */
export function Win({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const ref = useMemo(() => ({ current: el }), [el]);
  return (
    <div className="win" id="win" ref={setEl}>
      {el && <WinProvider value={ref}>{children}</WinProvider>}
      <TipLayer />
      <ScrollLayer />
    </div>
  );
}
