import Image from 'next/image';
import { cn } from '@school/shared';
import assets from '@/public/brand/manifest.json';

/** CSS theme variants match the pre-paint theme and never mirror the official wordmark in RTL. */
export function BrandMark({ variant = 'wordmark', className, priority = false }: { variant?: 'wordmark' | 'logo'; className?: string; priority?: boolean }) {
  const light = assets.images[`${variant}-colored`], dark = assets.images[`${variant}-white`];
  return <span role="img" aria-label="Madrasio" dir="ltr" data-brand={variant} className={cn('inline-flex shrink-0 items-center', variant === 'logo' ? 'size-10' : 'h-10 w-44', className)}>
    <Image src={`/brand/${variant}-colored.png`} width={light.width} height={light.height} alt="" aria-hidden="true" draggable={false} unoptimized priority={priority} className="h-full w-full object-contain dark:hidden" />
    <Image src={`/brand/${variant}-white.png`} width={dark.width} height={dark.height} alt="" aria-hidden="true" draggable={false} unoptimized priority={priority} className="hidden h-full w-full object-contain dark:block" />
  </span>;
}
