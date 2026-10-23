import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import postcss from 'postcss';

const css = postcss.parse(readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8'));
function tokens(dark: boolean) {
  const result: Record<string, string> = {};
  css.walkRules(rule => {
    if (rule.selector === ':root' || dark && rule.selector === '.dark') rule.walkDecls(decl => { result[decl.prop] = decl.value; });
  });
  return result;
}
function rgb(values: Record<string, string>, token: string): number[] {
  let value = values[token];
  while (value.startsWith('var(')) value = values[value.slice(4, -1)];
  const [h, saturation, lightness] = value.split(' ').map(Number.parseFloat);
  const s = saturation / 100, l = lightness / 100, a = s * Math.min(l, 1 - l);
  return [0, 8, 4].map(n => { const k = (n + h / 30) % 12; return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); });
}
function luminance(color: number[]) {
  return color.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a: number[], b: number[]) {
  const [bright, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (bright + 0.05) / (dark + 0.05);
}
it('uses the exact approved backgrounds, chrome and brand accents', () => {
  expect(rgb(tokens(false), '--background')).toEqual([255, 255, 255]);
  expect(rgb(tokens(false), '--chrome')).toEqual([229, 229, 229]);
  expect(rgb(tokens(true), '--background')).toEqual([20, 33, 61]);
  expect(rgb(tokens(true), '--chrome')).toEqual([0, 0, 0]);
  expect(rgb(tokens(false), '--accent')).toEqual([252, 163, 17]);
  expect(rgb(tokens(false), '--destructive')).toEqual([255, 0, 0]);
});
it.each([false, true])('retains AA text, input boundaries and keyboard ring contrast (dark: %s)', dark => {
  const values = tokens(dark);
  for (const [background, foreground] of [
    ['--background', '--foreground'], ['--card', '--card-foreground'], ['--popover', '--popover-foreground'],
    ['--primary', '--primary-foreground'], ['--secondary', '--secondary-foreground'], ['--accent', '--accent-foreground'],
    ['--chrome', '--chrome-foreground'], ['--background', '--muted-foreground'], ['--card', '--muted-foreground'],
    ['--destructive', '--destructive-foreground'], ['--background', '--destructive-text'], ['--card', '--destructive-text'],
  ]) expect(contrast(rgb(values, background), rgb(values, foreground)), `${background}/${foreground}`).toBeGreaterThanOrEqual(4.5);
  expect(contrast(rgb(values, '--background'), rgb(values, '--input'))).toBeGreaterThanOrEqual(3);
  expect(contrast(rgb(values, '--background'), rgb(values, '--ring'))).toBeGreaterThanOrEqual(3);
});
