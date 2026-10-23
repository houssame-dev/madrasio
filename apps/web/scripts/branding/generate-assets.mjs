/* Deterministic derivatives of the six owner-supplied PNGs. No artwork changes. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
// Reuse Next's installed image processor; do not add a second dependency.
const resolveModule = createRequire(import.meta.url);
const { default: sharp } = await import(pathToFileURL(resolveModule.resolve('sharp', { paths: [path.dirname(resolveModule.resolve('next/package.json'))] })).href);

async function generate(sourceDirectory) {
  if (!sourceDirectory) throw new Error('Pass the directory containing the six official PNG assets.');
  const web = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), destination = path.join(web, 'public/brand');
  const originals = path.join(destination, 'originals');
  fs.mkdirSync(originals, { recursive: true });
  const manifest = { source: 'Owner-supplied Madrasio Logo V2 PNGs', processing: 'Originals unchanged; transparent-margin trim and proportional PNG resize only.', images: {} };
  for (const kind of ['Logo', 'Wordmark Logo']) for (const color of ['Colored', 'Black', 'White']) {
    const name = `${kind} ${color}.png`, input = fs.readFileSync(path.join(sourceDirectory, name));
    const key = `${kind === 'Logo' ? 'logo' : 'wordmark'}-${color.toLowerCase()}`;
    fs.writeFileSync(path.join(originals, name), input);
    const trimmed = await sharp(input).trim({ background: '#00000000', threshold: 1 }).toBuffer();
    const { data, info } = await sharp(trimmed).resize({ width: kind === 'Logo' ? 192 : 640, withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
    fs.writeFileSync(path.join(destination, `${key}.png`), data);
    manifest.images[key] = { original: name, sha256: crypto.createHash('sha256').update(input).digest('hex'), width: info.width, height: info.height };
  }
  async function icon(color, size, whiteBackground = false) {
    const padding = Math.max(1, Math.round(size * 0.08));
    return sharp(path.join(destination, `logo-${color}.png`)).resize(size - padding * 2, size - padding * 2, { fit: 'contain', background: '#00000000' }).extend({ top: padding, bottom: padding, left: padding, right: padding, background: whiteBackground ? '#ffffff' : '#00000000' }).png().toBuffer();
  }
  for (const [color, label] of [['colored', 'light'], ['white', 'dark']]) fs.writeFileSync(path.join(destination, `favicon-${label}.png`), await icon(color, 32));
  fs.writeFileSync(path.join(destination, 'apple-touch-icon.png'), await icon('colored', 180, true));
  for (const size of [192, 512]) fs.writeFileSync(path.join(destination, `icon-${size}.png`), await icon('colored', size, true));
  const frames = await Promise.all([16, 32, 48].map(size => icon('colored', size)));
  const header = Buffer.alloc(6 + 16 * frames.length); header.writeUInt16LE(1, 2); header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => { const size = [16, 32, 48][index], position = 6 + index * 16; header[position] = size; header[position + 1] = size; header.writeUInt16LE(1, position + 4); header.writeUInt16LE(32, position + 6); header.writeUInt32LE(frame.length, position + 8); header.writeUInt32LE(offset, position + 12); offset += frame.length; });
  fs.writeFileSync(path.join(web, 'app/favicon.ico'), Buffer.concat([header, ...frames]));
  fs.writeFileSync(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}
generate(process.argv[2]).catch(() => { console.error('Official branding asset generation failed. Verify the input directory and six filenames.'); process.exitCode = 1; });
