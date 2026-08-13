import zxing from '@zxing/library';

const {
    MultiFormatReader,
    BarcodeFormat,
    DecodeHintType,
    RGBLuminanceSource,
    BinaryBitmap,
    HybridBinarizer,
} = zxing;

/**
 * Decode a module matrix by rasterising it and running it through ZXing, the
 * port of the reference implementation. This is the test that actually matters
 * for a QR library: it proves a real reader recovers the exact payload.
 *
 * @param {{modules: Uint8Array, size: number}} code
 * @param {object} [opts]
 * @returns {string|null} The decoded text, or null when no code was found.
 */
export function decode({ modules, size }, { scale = 4, quiet = 4 } = {}) {
    const side = (size + quiet * 2) * scale;
    const pixels = new Int32Array(side * side).fill(0xffffffff | 0);

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if (!modules[y * size + x]) continue;
            for (let dy = 0; dy < scale; dy++) {
                for (let dx = 0; dx < scale; dx++) {
                    const py = (quiet + y) * scale + dy;
                    const px = (quiet + x) * scale + dx;
                    pixels[py * side + px] = 0xff000000 | 0;
                }
            }
        }
    }

    const bitmap = new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(pixels, side, side)));
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    hints.set(DecodeHintType.TRY_HARDER, true);

    const reader = new MultiFormatReader();
    reader.setHints(hints);
    try {
        return reader.decode(bitmap, hints).getText();
    } catch {
        return null;
    }
}

/**
 * Minimal canvas stand-in that records the drawing calls, so the canvas
 * renderer's geometry can be asserted without a native canvas dependency.
 */
export function fakeCanvas(clientWidth = 0) {
    const calls = [];
    const attributes = new Map();
    const context = {
        fillStyle: null,
        clearRect: (...a) => calls.push({ op: 'clearRect', args: a }),
        fillRect: (...a) => calls.push({ op: 'fillRect', args: a, fill: context.fillStyle }),
        beginPath: () => calls.push({ op: 'beginPath' }),
        rect: (...a) => calls.push({ op: 'rect', args: a, fill: context.fillStyle }),
        arc: (...a) => calls.push({ op: 'arc', args: a, fill: context.fillStyle }),
        moveTo: (...a) => calls.push({ op: 'moveTo', args: a }),
        fill: () => calls.push({ op: 'fill', fill: context.fillStyle }),
    };
    return {
        width: 0,
        height: 0,
        clientWidth,
        style: {},
        calls,
        getContext: () => context,
        hasAttribute: (n) => attributes.has(n),
        setAttribute: (n, v) => attributes.set(n, v),
        getAttribute: (n) => attributes.get(n) ?? null,
    };
}
