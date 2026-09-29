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
    cornerDotColor: null, // falls back to cornerColor
    shape: 'dots',
    // Radius of a data dot in modules. 0.5 fills the module.
    dotRadius: 0.5,
    cornerShape: 'square',
    // Corner rounding for cornerShape 'rounded': 0 is square, 1 is a circle.
    cornerRadius: 0.5,
};

export const SHAPES = ['dots', 'squares'];
export const CORNER_SHAPES = ['square', 'rounded'];

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

    const cornerShape = String(o.cornerShape).toLowerCase();
    if (!CORNER_SHAPES.includes(cornerShape)) {
        throw new TypeError(
            `qrify: unknown cornerShape ${JSON.stringify(o.cornerShape)}. Expected one of ${CORNER_SHAPES.join(', ')}.`
        );
    }

    const cornerRadius = Number(o.cornerRadius);
    if (!Number.isFinite(cornerRadius) || cornerRadius < 0 || cornerRadius > 1) {
        throw new RangeError(`qrify: cornerRadius must be between 0 and 1, received ${JSON.stringify(o.cornerRadius)}.`);
    }

    // Dots much smaller than this leave too little ink for a reader to find.
    const dotRadius = Number(o.dotRadius);
    if (!Number.isFinite(dotRadius) || dotRadius < 0.2 || dotRadius > 0.5) {
        throw new RangeError(`qrify: dotRadius must be between 0.2 and 0.5, received ${JSON.stringify(o.dotRadius)}.`);
    }

    const cornerColor = o.cornerColor || o.dotColor;

    return {
        ecc: o.ecc,
        mode: o.mode,
        minVersion: o.minVersion,
        margin: Math.round(margin),
        background: o.background,
        dotColor: o.dotColor,
        cornerColor,
        cornerDotColor: o.cornerDotColor || cornerColor,
        shape,
        dotRadius,
        // Square corners are just rounded ones with no rounding.
        cornerRadius: cornerShape === 'rounded' ? cornerRadius : 0,
        className: o.class,
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
