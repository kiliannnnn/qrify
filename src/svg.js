import { encode, isFinder } from './encoder.js';
import { resolveOptions, isTransparent, defaultLabel } from './options.js';

/**
 * Escape text destined for an XML attribute or text node. Payloads are user
 * controlled and the result is frequently assigned with innerHTML, so this is
 * not optional.
 */
function esc(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * Build a path of unit squares, merging horizontal runs so the output stays
 * compact on large codes.
 */
function squaresPath(cells, size, margin) {
    const parts = [];
    for (let y = 0; y < size; y++) {
        let run = 0;
        for (let x = 0; x <= size; x++) {
            const on = x < size && cells[y * size + x];
            if (on) {
                run++;
                continue;
            }
            if (run) {
                parts.push(`M${x - run + margin} ${y + margin}h${run}v1h-${run}z`);
                run = 0;
            }
        }
    }
    return parts.join('');
}

/**
 * Build a path of unit-diameter circles, one per module.
 */
function dotsPath(cells, size, margin) {
    const parts = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!cells[y * size + x]) continue;
            const cx = x + margin;
            const cy = y + margin + 0.5;
            parts.push(`M${cx} ${cy}a.5.5 0 1 0 1 0a.5.5 0 1 0-1 0z`);
        }
    }
    return parts.join('');
}

/**
 * Render a QR code as a standalone SVG string.
 *
 * This function touches no browser API, so it can run during a static build
 * (Astro frontmatter, a Node script, an edge function) and ship zero
 * JavaScript to the client.
 *
 * @param {string|Uint8Array} input Text or bytes to encode.
 * @param {object} [options]
 * @param {'L'|'M'|'Q'|'H'} [options.ecc='M'] Error correction level.
 * @param {number} [options.margin=4] Quiet zone, in modules.
 * @param {string|false} [options.background='#ffffff'] Background fill, or
 *   'transparent'/false to leave it unpainted.
 * @param {string} [options.dotColor='#000000'] Colour of the data modules.
 * @param {string} [options.cornerColor] Colour of the three finder patterns.
 *   Defaults to `dotColor`.
 * @param {'dots'|'squares'} [options.shape='dots'] Data module shape.
 * @param {number} [options.size] Width/height in px. Omitted by default so the
 *   SVG scales to its container via the viewBox.
 * @param {string} [options.label] Accessible name. Defaults to the payload.
 * @param {string} [options.title] Optional <title> element text.
 * @param {number} [options.minVersion=1] Force at least this QR version.
 * @returns {string} A complete `<svg>…</svg>` document.
 */
export function toSVG(input, options = {}) {
    const o = resolveOptions(options);
    const { modules, size } = encode(input, { ecc: o.ecc, mode: o.mode, minVersion: o.minVersion });
    const total = size + o.margin * 2;

    // Split the matrix so finders can be drawn in their own colour and always
    // as solid squares, which is what keeps a dotted code readable.
    const data = new Uint8Array(size * size);
    const finders = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            if (!modules[i]) continue;
            if (isFinder(x, y, size)) finders[i] = 1;
            else data[i] = 1;
        }
    }

    const dataPath = o.shape === 'squares'
        ? squaresPath(data, size, o.margin)
        : dotsPath(data, size, o.margin);
    const finderPath = squaresPath(finders, size, o.margin);

    const dimensions = o.size != null
        ? ` width="${esc(o.size)}" height="${esc(o.size)}"`
        : '';

    const parts = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${dimensions}` +
        ` role="img" aria-label="${esc(o.label ?? defaultLabel(input))}"` +
        ` shape-rendering="crispEdges">`
    );
    if (o.title) parts.push(`<title>${esc(o.title)}</title>`);
    if (!isTransparent(o.background)) {
        parts.push(`<rect width="${total}" height="${total}" fill="${esc(o.background)}"/>`);
    }
    // crispEdges keeps square modules on exact pixel boundaries; circles need
    // antialiasing back on or they turn into ragged blobs.
    if (dataPath) {
        const rendering = o.shape === 'dots' ? ' shape-rendering="geometricPrecision"' : '';
        parts.push(`<path fill="${esc(o.dotColor)}"${rendering} d="${dataPath}"/>`);
    }
    if (finderPath) parts.push(`<path fill="${esc(o.cornerColor)}" d="${finderPath}"/>`);
    parts.push('</svg>');

    return parts.join('');
}
