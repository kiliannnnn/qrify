import test from 'node:test';
import assert from 'node:assert/strict';

import { toSVG } from '../core.js';
import { decode } from './helpers.js';

/**
 * Rasterise the SVG this library emits, then decode it. Testing the matrix
 * only proves the encoder is right; this proves the thing users actually ship
 * still scans after the dots, quiet zone and colours are applied.
 *
 * Only the two path shapes toSVG() produces are understood:
 *   squares  M<x> <y>h<n>v1h-<n>z
 *   dots     M<x> <y>a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0z
 */
function rasterise(svg, scale = 6) {
    const total = Number(svg.match(/viewBox="0 0 (\d+)/)[1]);
    const side = total * scale;
    const dark = new Uint8Array(side * side);

    const paint = (px, py) => {
        if (px < 0 || py < 0 || px >= side || py >= side) return;
        dark[py * side + px] = 1;
    };

    for (const [, x, y, run] of svg.matchAll(/M(-?[\d.]+) (-?[\d.]+)h(\d+)v1h-\d+z/g)) {
        const x0 = Math.round(Number(x) * scale);
        const y0 = Math.round(Number(y) * scale);
        for (let dy = 0; dy < scale; dy++) {
            for (let dx = 0; dx < Number(run) * scale; dx++) paint(x0 + dx, y0 + dy);
        }
    }

    for (const [, x, y] of svg.matchAll(/M(-?[\d.]+) (-?[\d.]+)a\.5\.5 0 1 0 1 0a\.5\.5 0 1 0-1 0z/g)) {
        const cx = (Number(x) + 0.5) * scale;
        const cy = Number(y) * scale;
        const r = scale / 2;
        for (let py = Math.floor(cy - r); py <= Math.ceil(cy + r); py++) {
            for (let px = Math.floor(cx - r); px <= Math.ceil(cx + r); px++) {
                const ddx = px + 0.5 - cx;
                const ddy = py + 0.5 - cy;
                if (ddx * ddx + ddy * ddy <= r * r) paint(px, py);
            }
        }
    }

    // decode() adds its own quiet zone; pass 0 so we only exercise the margin
    // baked into the SVG itself.
    return { modules: dark, size: side };
}

function scan(payload, options) {
    return decode(rasterise(toSVG(payload, options)), { scale: 1, quiet: 0 });
}

const PAYLOADS = [
    'https://kilian.dev',
    'https://kilian.dev/posts/why-i-built-qrify?utm_source=qr',
    'café 👋 こんにちは',
    'D'.repeat(300),
];

for (const shape of ['dots', 'squares']) {
    for (const payload of PAYLOADS) {
        const label = payload.length > 24 ? `${payload.slice(0, 24)}…` : payload;
        test(`rendered ${shape} scan back: ${label}`, () => {
            assert.equal(scan(payload, { shape }), payload);
        });
    }
}

test('rendered output scans at every ECC level', () => {
    for (const ecc of ['L', 'M', 'Q', 'H']) {
        const payload = `https://kilian.dev/${ecc}`;
        assert.equal(scan(payload, { ecc }), payload, `failed at ECC ${ecc}`);
    }
});

test('rendered output scans with a coloured foreground', () => {
    const payload = 'https://kilian.dev/colours';
    assert.equal(scan(payload, { dotColor: '#999999', cornerColor: '#333333' }), payload);
});

test('the quiet zone is really in the rendered output', () => {
    const svg = toSVG('https://kilian.dev', { margin: 4 });
    const { modules, size } = rasterise(svg);
    // Every pixel in the outer 4-module band must be light.
    const band = 4 * 6;
    for (let i = 0; i < size; i++) {
        for (const [x, y] of [[i, 0], [i, size - 1], [0, i], [size - 1, i], [i, band - 1], [band - 1, i]]) {
            assert.equal(modules[y * size + x], 0, `dark pixel inside the quiet zone at ${x},${y}`);
        }
    }
});
