// 托盘菜单（doc/design.md 2.28，1.5.2）：托盘的菜单窗口里只有这一张菜单，样子和软件里的菜单一家。
// 位置由主进程按右键那一刻的鼠标位置算好，弹出后不再挪（图标在任务栏折叠区里时，折叠区一收起图标就"消失"）；
// 这里只报尺寸、执行菜单项。每次弹出（tray-menu-open）都回到初始状态。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MenuItems, type MenuEntry } from '../kit/menu';
import { useGeneration } from '../state/generation';
import { invokeUI } from '../lib/commands';
import { saveBlurSettings, useBlurSettings } from '../state/blur';

export function TrayMenu() {
  const { jobs } = useGeneration();
  const [round, setRound] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.classList.add('tray');
    return window.studio?.onCommandEvent((event) => {
      if (event.type === 'tray-menu-open') setRound((n) => n + 1);
    });
  }, []);
  // 尺寸含外面一圈透明的边（给阴影留地方）；内容变了（开始或结束生成）就重报
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const report = () =>
      void invokeUI('tray.menu-size', {
        width: Math.ceil(el.offsetWidth),
        height: Math.ceil(el.offsetHeight),
      }).catch(() => {});
    report();
    const watch = new ResizeObserver(report);
    watch.observe(el);
    return () => watch.disconnect();
  }, [round]);
  const act = (action: 'show' | 'quit' | 'close') => () =>
    void invokeUI('tray.action', { action }).catch(() => {});
  const running = jobs.find((j) => j.state === 'generating');
  const blur = useBlurSettings();
  const items: MenuEntry[] = [
    ...(running
      ? ([
          {
            header: running.continuous
              ? `生成中 · 第 ${running.index} 张`
              : `生成中 · ${running.index} / ${running.count}`,
          },
          'sep',
        ] as MenuEntry[])
      : []),
    { label: '打开主窗口', icon: 'window-line', onSelect: act('show') },
    // 图片模糊（1.8.3，2.37）：和标题栏的按钮是同一个开关
    ...(blur
      ? ([
          {
            label: '模糊所有图片',
            icon: 'eye-off-line',
            checked: blur.mode === 'all' || blur.quickAll,
            disabled: blur.mode === 'all' ? '设置里选了所有图片都模糊' : false,
            onSelect: () => void saveBlurSettings({ quickAll: !blur.quickAll }).catch(() => {}),
          },
        ] as MenuEntry[])
      : []),
    'sep',
    {
      label: '退出',
      icon: 'shut-down-line',
      hint: running ? '会中断生成' : undefined,
      onSelect: act('quit'),
    },
  ];
  return (
    <div
      ref={box}
      className="tray-wrap"
      onKeyDown={(e) => {
        if (e.key === 'Escape') act('close')();
      }}
    >
      <div className="menu tray-menu">
        {/* key 换了就是新的一张：清掉悬停和键盘选中 */}
        <MenuItems key={round} items={items} onClose={act('close')} />
      </div>
    </div>
  );
}
