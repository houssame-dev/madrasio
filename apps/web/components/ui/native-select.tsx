'use client';

import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@school/shared';

// shadcn Base UI Native Select: https://ui.shadcn.com/docs/components/base/native-select
// Native semantics need no primitive dependency. Adapted for React 18, Tailwind 3 and logical RTL spacing.
export const NativeSelect = forwardRef<HTMLSelectElement, ComponentPropsWithoutRef<'select'> & { compact?: boolean }>(
  ({ className, children, compact = false, ...props }, ref) => <div data-slot="native-select-wrapper" className="relative min-w-0">
    <select ref={ref} data-slot="native-select" className={cn('h-10 w-full appearance-none rounded-md border border-input bg-background py-2 ps-3 pe-8 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 [&>option]:bg-background [&>option]:text-foreground', compact && 'w-10 px-0 text-transparent', className)} {...props}>{children}</select>
    {!compact ? <ChevronDown data-slot="native-select-icon" aria-hidden="true" className="pointer-events-none absolute end-2.5 top-3 size-4 text-muted-foreground" /> : null}
  </div>,
);
NativeSelect.displayName = 'NativeSelect';
export function NativeSelectOption(props: ComponentPropsWithoutRef<'option'>) { return <option data-slot="native-select-option" {...props} />; }
