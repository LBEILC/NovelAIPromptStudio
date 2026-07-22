import ConfigProvider from '@lobehub/ui/es/ConfigProvider/index';
import ThemeProvider from '@lobehub/ui/es/ThemeProvider/index';
import { motion } from 'motion/react';

export default function LobeProvider({ children, primaryColor = 'blue', themeMode = 'dark' }) {
  return <ConfigProvider locale="zh-CN" motion={motion}>
    <ThemeProvider
      className="lobe-root"
      customTheme={{ neutralColor: 'slate', primaryColor }}
      enableCustomFonts={false}
      enableGlobalStyle
      themeMode={themeMode}
    >
      {children}
    </ThemeProvider>
  </ConfigProvider>;
}
