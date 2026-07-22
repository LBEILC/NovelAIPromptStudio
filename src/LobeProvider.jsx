import ConfigProvider from '@lobehub/ui/es/ConfigProvider/index';
import ThemeProvider from '@lobehub/ui/es/ThemeProvider/index';
import { motion } from 'motion/react';

const FONT_FAMILIES = {
  sans: '"Geist", "HarmonyOS Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  mono: '"Geist Mono", "HarmonyOS Sans SC", "SFMono-Regular", "Cascadia Mono", Consolas, monospace',
};

export default function LobeProvider({ children, fontFamily = 'sans', primaryColor = 'blue', themeMode = 'dark' }) {
  const activeFont = FONT_FAMILIES[fontFamily] || FONT_FAMILIES.sans;
  return <ConfigProvider locale="zh-CN" motion={motion}>
    <ThemeProvider
      className="lobe-root"
      customTheme={{ neutralColor: 'slate', primaryColor }}
      enableCustomFonts={false}
      enableGlobalStyle
      theme={{ token: { fontFamily: activeFont, fontFamilyCode: activeFont } }}
      themeMode={themeMode}
    >
      {children}
    </ThemeProvider>
  </ConfigProvider>;
}
