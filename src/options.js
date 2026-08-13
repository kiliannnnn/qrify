/**
 * Shared option handling for the renderers.
 */

export const DEFAULTS = {
    ecc: 'M',
    mode: 'auto',
    minVersion: 1,
    // Quiet zone in modules. The QR specification requires 4; anything less
    // makes the code noticeably harder for real cameras to lock onto.
    margin: 4,
    background: '#ffffff',
    dotColor: '#000000',
    cornerColor: null, // falls back to dotColor
    shape: 'dots',
};

export const SHAPES = ['dots', 'squares'];

/**
 * Normalise and validate user supplied render options.
 *
 * @param {object} [options]
 */
export function resolveOptions(options = {}) {
    const o = { ...DEFAULTS, ...options };

    const margin = Number(o.margin);
    if (!Number.isFinite(margin) || margin < 0) {
        throw new RangeError(`qrify: margin must be a non-negative number, received ${JSON.stringify(o.margin)}.`);
    }

    const shape = String(o.shape).toLowerCase();
    if (!SHAPES.includes(shape)) {
        throw new TypeError(
            `qrify: unknown shape ${JSON.stringify(o.shape)}. Expected one of ${SHAPES.join(', ')}.`
        );
    }

    return {
        ecc: o.ecc,
        mode: o.mode,
        minVersion: o.minVersion,
        margin: Math.round(margin),
        background: o.background,
        dotColor: o.dotColor,
        cornerColor: o.cornerColor || o.dotColor,
        shape,
        size: o.size,
        label: o.label,
        title: o.title,
    };
}

/**
 * A background that should not be painted at all.
 */
export function isTransparent(background) {
    return background == null || background === false || String(background).toLowerCase() === 'transparent';
}

/**
 * Default accessible name. The payload is usually the useful part for a
 * screen reader (it is typically a URL), but it is capped so a long payload
 * does not turn into an unreadable announcement.
 */
export function defaultLabel(input) {
    if (typeof input !== 'string' || input === '') return 'QR code';
    const trimmed = input.length > 120 ? `${input.slice(0, 119)}…` : input;
    return `QR code: ${trimmed}`;
}
