import test from 'node:test';
import assert from 'node:assert/strict';

import { toSVG } from '../core.js';
import { decode } from './helpers.js';

/**
 * Flatten an SVG path into polygons, in viewBox units. Handles the commands
 * toSVG() emits — M, h, v, a (circular arcs only) and z — in either case.
 */
function flatten(d) {
    const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)/g);
    const polygons = [];
    let poly = null;
    let x = 0;
    let y = 0;
    let sx = 0;
    let sy = 0;
    let i = 0;
    let cmd = null;
    const next = () => Number(tokens[i++]);

    while (i < tokens.length) {
        if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
        const rel = cmd === cmd.toLowerCase();
        switch (cmd.toLowerCase()) {
            case 'm': {
                const nx = next();
                const ny = next();
                x = rel ? x + nx : nx;
                y = rel ? y + ny : ny;
                sx = x;
                sy = y;
                poly = [[x, y]];
                polygons.push(poly);
                break;
            }
            case 'h': x = rel ? x + next() : next(); poly.push([x, y]); break;
            case 'v': y = rel ? y + next() : next(); poly.push([x, y]); break;
            case 'a': {
                const r = next();
                next(); // ry, always equal to rx here
                next(); // rotation
                const large = next();
                const sweep = next();
                const ex = rel ? x + next() : next();
                const ey = rel ? y + next() : next();
                // Endpoint to centre parameterisation (SVG spec, F.6.5).
                const hx = (x - ex) / 2;
                const hy = (y - ey) / 2;
                const d2 = hx * hx + hy * hy;
                const f = Math.sqrt(Math.max(0, (r * r - d2) / d2)) * (large === sweep ? -1 : 1);
                const cx = f * hy + (x + ex) / 2;
                const cy = -f * hx + (y + ey) / 2;
                const a0 = Math.atan2(y - cy, x - cx);
                let delta = Math.atan2(ey - cy, ex - cx) - a0;
                if (sweep && delta < 0) delta += 2 * Math.PI;
                if (!sweep && delta > 0) delta -= 2 * Math.PI;
                const rad = Math.max(r, Math.sqrt(d2));
                const steps = 16;
                for (let s = 1; s <= steps; s++) {
                    const a = a0 + (delta * s) / steps;
                    poly.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
                }
                x = ex;
                y = ey;
                break;
            }
            case 'z': x = sx; y = sy; break;
            default: throw new Error(`rasterise: unsupported path command ${cmd}`);
        }
    }
    return polygons;
}

/**
 * Rasterise the SVG this library emits, then decode it. Testing the matrix
 * only proves the encoder is right; this proves the thing users actually ship
 * still scans after the dots, corners, quiet zone and colours are applied.
 *
 * Every <path> counts as dark ink (the tests only use dark-on-light colours),
 * filled even-odd, sampled at pixel centres.
 */
function rasterise(svg, scale = 6) {
    const total = Number(svg.match(/viewBox="0 0 (\d+)/)[1]);
    const side = total * scale;
    const dark = new Uint8Array(side * side);

    for (const [, d] of svg.matchAll(/<path[^>]* d="([^"]+)"/g)) {
        const edges = [];
        for (const poly of flatten(d)) {
            for (let k = 0; k < poly.length; k++) {
                const [x0, y0] = poly[k];
                const [x1, y1] = poly[(k + 1) % poly.length];
                if (y0 !== y1) edges.push([x0 * scale, y0 * scale, x1 * scale, y1 * scale]);
            }
        }
        for (let py = 0; py < side; py++) {
            const sy = py + 0.5;
            const xs = [];
            for (const [x0, y0, x1, y1] of edges) {
                if ((y0 <= sy) !== (y1 <= sy)) xs.push(x0 + ((sy - y0) * (x1 - x0)) / (y1 - y0));
            }
            xs.sort((a, b) => a - b);
            for (let k = 0; k + 1 < xs.length; k += 2) {
                const from = Math.max(0, Math.ceil(xs[k] - 0.5));
                const to = Math.min(side - 1, Math.floor(xs[k + 1] - 0.5));
                for (let px = from; px <= to; px++) dark[py * side + px] = 1;
            }
        }
    }

    // decode() adds its own quiet zone; pass 0 so we only exercise the margin
    // baked into the SVG itself.
    return { modules: dark, size: side };
}

function scan(payload, options = {}) {
    // ZXing's pure-barcode shortcut locates a code by its top-left black
    // pixel, which a rounded corner does not have. Rounded output goes
    // through the finder-pattern detector cameras rely on instead.
    const pure = options.cornerShape !== 'rounded';
    return decode(rasterise(toSVG(payload, options)), { scale: 1, quiet: 0, pure });
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

test('rounded corners scan back at every radius', () => {
    for (const cornerRadius of [0, 0.25, 0.5, 0.75, 1]) {
        for (const payload of PAYLOADS) {
            assert.equal(
                scan(payload, { cornerShape: 'rounded', cornerRadius }),
                payload,
                `failed at cornerRadius ${cornerRadius}: ${payload.slice(0, 24)}`
            );
        }
    }
});

test('smaller dots scan back', () => {
    for (const dotRadius of [0.3, 0.4]) {
        for (const payload of PAYLOADS) {
            assert.equal(scan(payload, { dotRadius }), payload, `failed at dotRadius ${dotRadius}`);
        }
    }
});

test('the 1.x look scans: rounded corners, two-tone finders, 0.4 dots', () => {
    const payload = 'https://kilian.dev/posts/why-i-built-qrify';
    const options = {
        cornerShape: 'rounded',
        cornerColor: '#333333',
        cornerDotColor: '#000000',
        dotRadius: 0.4,
    };
    assert.equal(scan(payload, options), payload);
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
