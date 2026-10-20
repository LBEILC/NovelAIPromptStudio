// Settings use the compact controls shown in the interactive reference.
// Kept local until the shared component rewrite is merged.
import type { ComponentProps } from 'react';
import {
  Button as SharedButton,
  Input as SharedInput,
  Select as SharedSelect,
  OptionGroup as SharedOptionGroup,
} from '../ui';

export function Button(props: ComponentProps<typeof SharedButton>) {
  return <SharedButton size="small" {...props} />;
}
export function Input(props: ComponentProps<typeof SharedInput>) {
  return <SharedInput size="small" {...props} />;
}
export function Select(props: ComponentProps<typeof SharedSelect>) {
  return <SharedSelect size="small" {...props} />;
}
export function OptionGroup(props: ComponentProps<typeof SharedOptionGroup>) {
  return <SharedOptionGroup size="small" {...props} />;
}
