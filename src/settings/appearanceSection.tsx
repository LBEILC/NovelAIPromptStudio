import { useEffect, useMemo, useState } from 'react';
import { Seg } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { invokeUI } from '../lib/commands';
import { BUNDLED_FONTS, partitionFontFamilies, quoteFontFamily } from '../lib/fonts.js';
import type { AppearanceSettings, ProductivitySettings } from '../shared/types';
import { useAppearance } from '../state/appearance';
import { Dropdown, Row, SetPage, errorText } from './parts';

// ---------- 通用（外观和关闭窗口） ----------
export function Appearance() {
  const notify = useNotifications();
  const { appearance, changeAppearance } = useAppearance();
  // 关闭主窗口时（2.28）：只在 Windows；macOS 照系统习惯，关窗口后程序留在 Dock
  const windows = document.documentElement.dataset.platform === 'windows';
  const [closeAction, setCloseAction] = useState<ProductivitySettings['closeAction']>('ask');
  useEffect(() => {
    if (!windows) return;
    invokeUI('settings.productivity.get', {})
      .then((s) => setCloseAction(s.closeAction || 'ask'))
      .catch(() => {});
  }, [windows]);
  const saveClose = (value: ProductivitySettings['closeAction']) => {
    setCloseAction(value);
    invokeUI('settings.productivity.save', { settings: { closeAction: value } })
      .then((s) => setCloseAction(s.closeAction || value))
      .catch((e) => notify({ text: errorText(e), tone: 'error' }));
  };
  const [fonts, setFonts] = useState<{ family: string; monospace: boolean }[]>([]);
  useEffect(() => {
    let live = true;
    invokeUI('fonts.list', {})
      .then((r) => {
        if (!live) return;
        if (r.ok) setFonts(r.fonts);
        else notify({ text: `读取字体列表失败：${r.error}`, tone: 'error' });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  const groups = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d');
    return partitionFontFamilies(
      [
        ...fonts,
        { family: appearance.sansFont, monospace: false },
        { family: appearance.monoFont, monospace: true },
        { family: appearance.proseFont, monospace: false },
      ],
      ctx
        ? (family: string, sample: string) => {
            ctx.font = `24px ${quoteFontFamily(family)}, sans-serif`;
            return ctx.measureText(sample).width;
          }
        : undefined,
    ) as { proportional: string[]; monospace: string[] };
  }, [fonts, appearance.sansFont, appearance.monoFont, appearance.proseFont]);
  const save = (patch: Partial<AppearanceSettings>) =>
    void changeAppearance(patch).catch((e) => notify({ text: errorText(e), tone: 'error' }));
  const name = (family: string) =>
    BUNDLED_FONTS.includes(family)
      ? `${family}（内置）`
      : family === 'system-ui' || family === 'monospace'
        ? '系统默认'
        : family;
  const font = (key: 'sansFont' | 'monoFont' | 'proseFont', title: string, help: string) => {
    const list = key === 'monoFont' ? groups.monospace : groups.proportional;
    return (
      <Row title={title} help={help}>
        <Dropdown
          label={title}
          className="set-dd"
          menuClass="font-menu scroll"
          value={
            <span style={{ fontFamily: quoteFontFamily(appearance[key]) }}>
              {name(appearance[key])}
            </span>
          }
          items={list.map((family) => ({
            label: <span style={{ fontFamily: quoteFontFamily(family) }}>{name(family)}</span>,
            checked: appearance[key] === family,
            onSelect: () => save({ [key]: family }),
          }))}
        />
      </Row>
    );
  };
  return (
    <SetPage title="通用" desc="更改会立即生效。">
      <Row title="主题">
        <Seg
          label="主题"
          items={[
            ['auto', '跟随系统'],
            ['light', '浅色'],
            ['dark', '深色'],
          ]}
          value={appearance.themeMode}
          onChange={(themeMode) => save({ themeMode })}
        />
      </Row>
      {font('sansFont', '界面字体', '用于界面和中文')}
      {font('monoFont', '等宽字体', '用于 Tag、权重和参数')}
      {font('proseFont', '段落字体', '用于成段的自然语言')}
      <Row title="动效" help="关闭后不播放过渡动画，变化立即完成">
        <Seg
          label="动效"
          items={[
            ['full', '完整'],
            ['reduced', '跟随系统'],
            ['off', '关闭'],
          ]}
          value={appearance.motion}
          onChange={(motion) => save({ motion })}
        />
      </Row>
      {windows && (
        <Row title="关闭主窗口时" help="最小化到托盘后，生成和 Agent 接入在后台继续">
          <Seg
            label="关闭主窗口时"
            items={[
              ['ask', '每次询问'],
              ['tray', '最小化到托盘'],
              ['quit', '退出'],
            ]}
            value={closeAction}
            onChange={saveClose}
          />
        </Row>
      )}
    </SetPage>
  );
}
