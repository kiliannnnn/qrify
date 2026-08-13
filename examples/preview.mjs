/**
 * Generate a static page showing every render option, as inline SVG.
 *
 *   node examples/preview.mjs && open examples/preview.html
 *
 * The output page contains no JavaScript at all — which is the point of
 * rendering at build time.
 */
import { writeFileSync } from 'node:fs';
import { toSVG } from '../core.js';

const url = 'https://kilian.dev/posts/qrify';

const variants = [
    ['dots · ECC M (defaults)', toSVG(url)],
    ['squares · ECC M', toSVG(url, { shape: 'squares' })],
    ['dots · ECC H', toSVG(url, { ecc: 'H' })],
    ['coloured', toSVG(url, { dotColor: '#7c5cff', cornerColor: '#1f2937' })],
    ['light on dark', toSVG(url, { background: '#111827', dotColor: '#f9fafb', cornerColor: '#38bdf8' })],
    ['margin 0 (harder to scan)', toSVG(url, { margin: 0 })],
    ['unicode payload', toSVG('café 👋 こんにちは')],
    ['300 bytes', toSVG('D'.repeat(300))],
];

const page = `<!doctype html>
<meta charset="utf-8">
<title>qrify preview</title>
<style>
  body { font: 14px/1.5 system-ui, sans-serif; margin: 0; padding: 2rem; background: #fafafa; color: #111; }
  h1 { font-size: 1.1rem; margin: 0 0 .25rem; }
  p { margin: 0 0 2rem; color: #666; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 1.5rem; }
  figure { margin: 0; }
  figure > svg { width: 100%; height: auto; border: 1px solid #e5e5e5; border-radius: 8px; }
  figcaption { margin-top: .5rem; font-size: 12px; color: #555; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b0b0c; color: #eee; }
    p, figcaption { color: #999; }
    figure > svg { border-color: #27272a; }
  }
</style>
<h1>qrify — rendered output</h1>
<p>Every code below is inline SVG generated at build time. This page ships no JavaScript.</p>
<div class="grid">
${variants.map(([label, svg]) => `  <figure>${svg}<figcaption>${label}</figcaption></figure>`).join('\n')}
</div>
`;

const out = new URL('./preview.html', import.meta.url);
writeFileSync(out, page);
console.log(`wrote ${out.pathname}`);
