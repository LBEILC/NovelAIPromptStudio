import { ConfigProvider, ThemeProvider } from '@lobehub/ui';
import { zhCn } from '@lobehub/ui/i18n/resources/index';
import { motion } from 'motion/react';
import { DEFAULT_MONO_FONT, DEFAULT_SANS_FONT, fontStack } from './lib/fonts.js';

export default function LobeProvider({ children, monoFont = DEFAULT_MONO_FONT, primaryColor = 'blue', sansFont = DEFAULT_SANS_FONT, themeMode = 'dark' }) {
  const activeSansFont = fontStack(sansFont, 'sans');
  const activeMonoFont = fontStack(monoFont, 'mono');
  return <ConfigProvider locale="zh-CN" motion={motion} resources={zhCn}>
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
