import { encode, isFinder, finderOrigins } from './encoder.js';
import { resolveOptions, isTransparent, defaultLabel } from './options.js';

/**
 * Add a `w`-wide square at (x, y) with corners of radius `r` to the path.
 */
function roundedSquare(ctx, x, y, w, r) {
    if (r <= 0) {
        ctx.rect(x, y, w, w);
        return;
    }
    const q = Math.PI / 2;
    ctx.moveTo(x + r, y);
    ctx.arc(x + w - r, y + r, r, -q, 0);
    ctx.arc(x + w - r, y + w - r, r, 0, q);
    ctx.arc(x + r, y + w - r, r, q, 2 * q);
    ctx.arc(x + r, y + r, r, 2 * q, 3 * q);
    ctx.closePath();
}

/**
 * Draw a QR code into an existing canvas.
 *
 * The module size is snapped to a whole number of device pixels and the
 * backing store is scaled by `devicePixelRatio`, so modules land on exact
 * pixel boundaries instead of being antialiased into each other. As a result
 * the canvas may end up to one module smaller than the requested size.
 *
 * @param {HTMLCanvasElement} canvas Target canvas.
 * @param {string|Uint8Array} input Text or bytes to encode.
 * @param {object} [options] Accepts every {@link toSVG} option, plus:
 * @param {number} [options.size] Target CSS width in px. Defaults to the
 *   canvas' current layout width, then to 256.
 * @param {number} [options.devicePixelRatio] Override the detected DPR.
 * @returns {{size: number, version: number, ecc: string, scale: number, pixels: number}}
 */
export function toCanvas(canvas, input, options = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') {
        throw new TypeError('qrify: toCanvas() expects a canvas element as its first argument.');
    }

    const o = resolveOptions(options);
    const { modules, size, version, ecc } = encode(input, { ecc: o.ecc, mode: o.mode, minVersion: o.minVersion });
    const total = size + o.margin * 2;

    const dpr = options.devicePixelRatio ?? (globalThis.devicePixelRatio || 1);
    const target = o.size ?? (canvas.clientWidth || canvas.width || 256);

    // Whole device pixels per module keeps every edge sharp.
    const scale = Math.max(1, Math.floor((target * dpr) / total));
    const pixels = scale * total;

    canvas.width = pixels;
    canvas.height = pixels;
    const css = pixels / dpr;
    canvas.style.width = `${css}px`;
    canvas.style.height = `${css}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('qrify: could not acquire a 2d context for the canvas.');

    if (isTransparent(o.background)) {
        ctx.clearRect(0, 0, pixels, pixels);
    } else {
        ctx.fillStyle = o.background;
        ctx.fillRect(0, 0, pixels, pixels);
    }

    const off = o.margin * scale;

    // Data modules: one path, one fill.
    ctx.fillStyle = o.dotColor;
    ctx.beginPath();
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!modules[y * size + x] || isFinder(x, y, size)) continue;
            const px = off + x * scale;
            const py = off + y * scale;
            if (o.shape === 'squares') {
                ctx.rect(px, py, scale, scale);
            } else {
                const c = scale / 2;
                const r = o.dotRadius * scale;
                ctx.moveTo(px + c + r, py + c);
                ctx.arc(px + c, py + c, r, 0, Math.PI * 2);
            }
        }
    }
    ctx.fill();

    // Finder patterns are never dots: a 7×7 ring, then the 3×3 centre, with
    // every radius scaled by the same factor so they stay concentric.
    const k = o.cornerRadius * scale;
    ctx.fillStyle = o.cornerColor;
    ctx.beginPath();
    for (const [fx, fy] of finderOrigins(size)) {
        const x = off + fx * scale;
        const y = off + fy * scale;
        roundedSquare(ctx, x, y, 7 * scale, 3.5 * k);
        roundedSquare(ctx, x + scale, y + scale, 5 * scale, 2.5 * k);
    }
    ctx.fill('evenodd');

    ctx.fillStyle = o.cornerDotColor;
    ctx.beginPath();
    for (const [fx, fy] of finderOrigins(size)) {
        roundedSquare(ctx, off + (fx + 2) * scale, off + (fy + 2) * scale, 3 * scale, 1.5 * k);
    }
    ctx.fill();

    if (!canvas.hasAttribute('role')) canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', o.label ?? defaultLabel(input));

    return { size, version, ecc, scale, pixels };
}
