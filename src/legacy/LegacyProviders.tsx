import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ContextMenuHost, ToastHost } from '@lobehub/ui/base-ui';
import LobeProvider from '../LobeProvider.jsx';
import { useAppearance } from '../state/appearance';

// Only the unmigrated workbench/gallery, their menus and notifications need Lobe.
export function LegacyProviders({ children }: { children: ReactNode }) {
  const { appearance, resolvedTheme } = useAppearance();
  const [portalRoot, setPortalRoot] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = document.createElement('div');
    root.className = 'studio-toast-portal';
    document.body.append(root);
    setPortalRoot(root);
    return () => root.remove();
  }, []);
  const props = {
    monoFont: appearance.monoFont,
    sansFont: appearance.sansFont,
    themeMode: appearance.themeMode,
    resolvedTheme,
    primaryColor: 'blue',
  };
  return (
    <LobeProvider {...props}>
      {children}
      <ContextMenuHost />
      {portalRoot &&
        createPortal(
          <LobeProvider {...props}>
            <ToastHost duration={2200} position="top" />
          </LobeProvider>,
          portalRoot,
        )}
    </LobeProvider>
  );
}
