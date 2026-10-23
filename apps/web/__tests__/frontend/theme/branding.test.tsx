import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BrandMark } from '@/components/branding/brand-mark';
import manifest from '@/public/brand/manifest.json';
import config from '@/components.json';

afterEach(cleanup);
it.each(['wordmark', 'logo'] as const)('preserves official %s proportions with CSS-controlled Light/Dark variants and one accessible name', variant => {
  render(<BrandMark variant={variant} />);
  const brand = screen.getByRole('img', { name: 'Madrasio' });
  expect(brand).toHaveAttribute('dir', 'ltr');
  const images = brand.querySelectorAll('img'); expect(images).toHaveLength(2);
  expect(images[0]).toHaveAttribute('src', `/brand/${variant}-colored.png`);
  expect(images[1]).toHaveAttribute('src', `/brand/${variant}-white.png`);
  expect(images[0]).toHaveClass('dark:hidden'); expect(images[1]).toHaveClass('hidden', 'dark:block');
  for (const image of images) { expect(image).toHaveAttribute('alt', ''); expect(image).toHaveClass('object-contain'); }
});
it('retains all six originals byte-for-byte and records actual derivative dimensions', () => {
  expect(Object.keys(manifest.images)).toHaveLength(6);
  for (const [key, value] of Object.entries(manifest.images)) {
    const original = readFileSync(resolve(process.cwd(), 'public/brand/originals', value.original));
    expect(createHash('sha256').update(original).digest('hex')).toBe(value.sha256);
    const png = readFileSync(resolve(process.cwd(), 'public/brand', `${key}.png`));
    expect(png.readUInt32BE(16)).toBe(value.width); expect(png.readUInt32BE(20)).toBe(value.height);
  }
});
it('provides real multi-resolution ICO, Apple and browser icons from the approved logo', () => {
  const ico = readFileSync(resolve(process.cwd(), 'app/favicon.ico'));
  expect(ico.readUInt16LE(0)).toBe(0); expect(ico.readUInt16LE(2)).toBe(1); expect(ico.readUInt16LE(4)).toBe(3);
  for (const [index, size] of [16, 32, 48].entries()) { expect(ico[6 + index * 16]).toBe(size); const offset = ico.readUInt32LE(6 + index * 16 + 12); expect(ico.subarray(offset, offset + 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])); }
  for (const [file, size] of [['apple-touch-icon.png', 180], ['favicon-light.png', 32], ['favicon-dark.png', 32], ['icon-192.png', 192], ['icon-512.png', 512]] as const) {
    const png = readFileSync(resolve(process.cwd(), 'public/brand', file)); expect(png.readUInt32BE(16)).toBe(size); expect(png.readUInt32BE(20)).toBe(size);
  }
});
it('configures Base UI against the existing Tailwind 3 app without migrating controls', () => {
  expect(config.style).toBe('base-nova'); expect(config.rtl).toBe(true); expect(config.tailwind.config).toBe('tailwind.config.ts');
  expect(config.tailwind.css).toBe('app/globals.css'); expect(config.aliases.utils).toBe('@school/shared');
});
