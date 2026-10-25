import { type ReactNode } from 'react';
import { Icon } from '../kit/controls';

export const Fail = ({ children }: { children: ReactNode }) =>
  children ? (
    <div className="banner danger set-banner" data-enter="fade">
      <Icon name="error-warning-line" />
      <span className="selectable">{children}</span>
    </div>
  ) : null;
