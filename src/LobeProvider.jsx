import ConfigProvider from '@lobehub/ui/es/ConfigProvider/index';
import ThemeProvider from '@lobehub/ui/es/ThemeProvider/index';
import { motion } from 'motion/react';

const SANS_FONT_FAMILIES = {
  geist: '"Geist", "HarmonyOS Sans SC", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  harmony: '"HarmonyOS Sans SC", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI Variable Text", "Segoe UI", "PingFang SC", "Microsoft YaHei UI", sans-serif',
};

const MONO_FONT_FAMILIES = {
  'geist-mono': '"Geist Mono", "HarmonyOS Sans SC", "SFMono-Regular", "Cascadia Mono", Consolas, monospace',
  'system-mono': '"SFMono-Regular", "Cascadia Mono", Consolas, Menlo, monospace',
};

export default function LobeProvider({ children, monoFont = 'geist-mono', primaryColor = 'blue', sansFont = 'geist', themeMode = 'dark' }) {
  const activeSansFont = SANS_FONT_FAMILIES[sansFont] || SANS_FONT_FAMILIES.geist;
  const activeMonoFont = MONO_FONT_FAMILIES[monoFont] || MONO_FONT_FAMILIES['geist-mono'];
  return <ConfigProvider locale="zh-CN" motion={motion}>
    <ThemeProvider
      className="lobe-root"
      customTheme={{ neutralColor: 'slate', primaryColor }}
      enableCustomFonts={false}
      enableGlobalStyle
      theme={{ token: { fontFamily: activeSansFont, fontFamilyCode: activeMonoFont } }}
      themeMode={themeMode}
    >
      {children}
    </ThemeProvider>
  </ConfigProvider>;
}
