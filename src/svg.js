import { encode, isFinder, finderOrigins } from './encoder.js';
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
 * Format a coordinate compactly: no float noise, no leading zero.
 */
function num(value) {
    return String(Math.round(value * 1e4) / 1e4).replace(/^(-?)0\./, '$1.');
}

/**
 * Build a path of circles of radius `r`, one per module.
 */
function dotsPath(cells, size, margin, r) {
    const R = num(r);
    const D = num(r * 2);
    const arcs = `a${R} ${R} 0 1 0 ${D} 0a${R} ${R} 0 1 0-${D} 0z`;
    const parts = [];
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!cells[y * size + x]) continue;
            parts.push(`M${num(x + margin + 0.5 - r)} ${num(y + margin + 0.5)}${arcs}`);
        }
    }
    return parts.join('');
}

/**
 * A `w`-wide square at (x, y) with corners of radius `r`, drawn clockwise.
 */
function roundedSquare(x, y, w, r) {
    if (r <= 0) return `M${x} ${y}h${w}v${w}h-${w}z`;
    const R = num(r);
    const s = num(w - r * 2);
    const arc = (dx, dy) => `a${R} ${R} 0 0 1 ${num(dx)} ${num(dy)}`;
    return (
        `M${num(x + r)} ${y}h${s}${arc(r, r)}v${s}${arc(-r, r)}` +
        `h-${s}${arc(-r, -r)}v-${s}${arc(r, -r)}z`
    );
}

/**
 * Finder patterns as geometry rather than modules, so they can be rounded.
 * `k` scales every radius in proportion, keeping the three squares concentric.
 *
 * @returns {{ring: string, center: string}} The 7×7 ring (an outer square
 *   with a 5×5 hole, filled even-odd) and the 3×3 centre.
 */
function finderPaths(size, margin, k) {
    let ring = '';
    let center = '';
    for (const [fx, fy] of finderOrigins(size)) {
        const x = fx + margin;
        const y = fy + margin;
        ring += roundedSquare(x, y, 7, 3.5 * k) + roundedSquare(x + 1, y + 1, 5, 2.5 * k);
        center += roundedSquare(x + 2, y + 2, 3, 1.5 * k);
    }
    return { ring, center };
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
 * @param {string} [options.cornerDotColor] Colour of the 3×3 centre of each
 *   finder pattern. Defaults to `cornerColor`.
 * @param {'dots'|'squares'} [options.shape='dots'] Data module shape.
 * @param {number} [options.dotRadius=0.5] Radius of a data dot, in modules,
 *   from 0.2 to 0.5. Only used by the 'dots' shape.
 * @param {'square'|'rounded'} [options.cornerShape='square'] Finder pattern
 *   shape.
 * @param {number} [options.cornerRadius=0.5] Rounding for 'rounded' corners,
 *   from 0 (square) to 1 (circular).
 * @param {string} [options.class] Class attribute for the root `<svg>`.
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

    // Finders are drawn separately, in their own colours and never as dots,
    // which is what keeps a dotted code readable.
    const data = new Uint8Array(size * size);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const i = y * size + x;
            if (modules[i] && !isFinder(x, y, size)) data[i] = 1;
        }
    }

    const dataPath = o.shape === 'squares'
        ? squaresPath(data, size, o.margin)
        : dotsPath(data, size, o.margin, o.dotRadius);
    const finder = finderPaths(size, o.margin, o.cornerRadius);

    const dimensions = o.size != null
        ? ` width="${esc(o.size)}" height="${esc(o.size)}"`
        : '';

    const parts = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}"${dimensions}` +
        `${o.className ? ` class="${esc(o.className)}"` : ''}` +
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
    const cornerRendering = o.cornerRadius > 0 ? ' shape-rendering="geometricPrecision"' : '';
    if (o.cornerDotColor === o.cornerColor) {
        // The centre sits inside the ring's hole, so even-odd fills it too.
        parts.push(
            `<path fill="${esc(o.cornerColor)}" fill-rule="evenodd"${cornerRendering}` +
            ` d="${finder.ring}${finder.center}"/>`
        );
    } else {
        parts.push(`<path fill="${esc(o.cornerColor)}" fill-rule="evenodd"${cornerRendering} d="${finder.ring}"/>`);
        parts.push(`<path fill="${esc(o.cornerDotColor)}"${cornerRendering} d="${finder.center}"/>`);
    }
    parts.push('</svg>');

    return parts.join('');
}
