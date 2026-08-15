import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Conditional className composer used across the UI surface.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
