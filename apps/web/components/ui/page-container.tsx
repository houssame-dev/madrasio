import { cn } from '@school/shared';
import type { HTMLAttributes } from 'react';

export const pageWidths = {
  MANAGEMENT_WIDE: 'max-w-[110rem]',
  FORM_DETAIL: 'max-w-6xl',
  READING_CONTENT: 'max-w-3xl',
} as const;

/** Width only: the application shell continues to own responsive page padding. */
export function PageContainer({ variant, className, ...props }: HTMLAttributes<HTMLDivElement> & { variant: keyof typeof pageWidths }) {
  return <div {...props} className={cn('mx-auto w-full min-w-0', pageWidths[variant], className)} />;
}
