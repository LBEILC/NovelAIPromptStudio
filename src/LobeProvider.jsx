import ConfigProvider from '@lobehub/ui/es/ConfigProvider/index';
import ThemeProvider from '@lobehub/ui/es/ThemeProvider/index';
import { motion } from 'motion/react';

export default function LobeProvider({ children }) {
  return <ConfigProvider locale="zh-CN" motion={motion}>
    <ThemeProvider
      appearance="dark"
      className="lobe-root"
      customTheme={{ neutralColor: 'slate', primaryColor: 'gold' }}
      enableCustomFonts={false}
      enableGlobalStyle={false}
      themeMode="dark"
    >
      {children}
    </ThemeProvider>
  </ConfigProvider>;
}
