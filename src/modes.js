/**
 * QR encoding modes.
 *
 * Byte mode can carry anything, but it spends 8 bits per character. Digits
 * cost 3.33 bits in numeric mode and the uppercase/symbol subset costs 5.5
 * bits in alphanumeric mode, so picking the right mode can shrink a code by
 * several versions.
 */

export const MODES = ['numeric', 'alphanumeric', 'byte'];

// Mode indicators from the specification.
const INDICATOR = { numeric: 0b0001, alphanumeric: 0b0010, byte: 0b0100 };

// Character count indicator width, by mode and version group.
const COUNT_BITS = {
    numeric: [10, 12, 14],
    alphanumeric: [9, 11, 13],
    byte: [8, 16, 16],
};

/** The 45 characters alphanumeric mode can represent, in their code order. */
export const ALPHANUMERIC_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const ALPHANUMERIC_CODES = new Map(
    [...ALPHANUMERIC_CHARS].map((char, index) => [char, index]),
);

const NUMERIC_RE = /^[0-9]+$/;

function versionGroup(version) {
    if (version <= 9) return 0;
    if (version <= 26) return 1;
    return 2;
}

export function countBits(mode, version) {
    return COUNT_BITS[mode][versionGroup(version)];
}

/**
 * Pick the cheapest mode that can represent `text`.
 *
 * Only single-mode codes are produced. Splitting a payload into mixed-mode
 * segments can be smaller still, but it is rarely worth the complexity for
 * the payloads this library sees.
 *
 * @param {string} text
 * @returns {'numeric'|'alphanumeric'|'byte'}
 */
export function detectMode(text) {
    // An empty payload goes through byte mode, matching what a reader expects
    // from an empty string.
    if (text.length === 0) return 'byte';
    if (NUMERIC_RE.test(text)) return 'numeric';
    for (const char of text) {
        if (!ALPHANUMERIC_CODES.has(char)) return 'byte';
    }
    return 'alphanumeric';
}

/** True when `text` can actually be represented in `mode`. */
export function supportsMode(text, mode) {
    if (mode === 'byte') return true;
    if (text.length === 0) return false;
    if (mode === 'numeric') return NUMERIC_RE.test(text);
    for (const char of text) {
        if (!ALPHANUMERIC_CODES.has(char)) return false;
    }
    return true;
}

/**
 * Bits needed to encode `length` units in `mode`, excluding the header.
 */
function payloadBits(mode, length) {
    switch (mode) {
        case 'numeric': {
            const remainder = length % 3;
            return 10 * Math.floor(length / 3) + (remainder === 0 ? 0 : remainder === 1 ? 4 : 7);
        }
        case 'alphanumeric':
            return 11 * Math.floor(length / 2) + 6 * (length % 2);
        default:
            return 8 * length;
    }
}

/**
 * Total bits a segment occupies, header included.
 */
export function segmentBits(mode, length, version) {
    return 4 + countBits(mode, version) + payloadBits(mode, length);
}

/**
 * How many units of `mode` fit in `dataCodewords` codewords at `version`.
 *
 * @returns {number} Characters for numeric/alphanumeric, bytes for byte mode.
 */
export function capacityFor(mode, version, dataCodewords) {
    const available = dataCodewords * 8 - 4 - countBits(mode, version);
    if (available <= 0) return 0;

    switch (mode) {
        case 'numeric': {
            const triples = Math.floor(available / 10);
            const spare = available - triples * 10;
            return triples * 3 + (spare >= 7 ? 2 : spare >= 4 ? 1 : 0);
        }
        case 'alphanumeric': {
            const pairs = Math.floor(available / 11);
            const spare = available - pairs * 11;
            return pairs * 2 + (spare >= 6 ? 1 : 0);
        }
        default:
            return Math.floor(available / 8);
    }
}

/**
 * Sequential bit writer over a zero-initialised byte buffer.
 */
function bitWriter(target) {
    let at = 0;
    return {
        put(value, bits) {
            for (let i = bits - 1; i >= 0; i--) {
                if ((value >>> i) & 1) target[at >> 3] |= 0x80 >> (at & 7);
                at++;
            }
        },
        skip(bits) {
            at += bits;
        },
        get bits() {
            return at;
        },
    };
}

/**
 * Write the mode indicator, character count, payload, terminator and padding
 * into `target`, which must be zero-initialised.
 *
 * @param {Uint8Array} target Data codeword region of the working buffer.
 * @param {object} segment
 * @param {'numeric'|'alphanumeric'|'byte'} segment.mode
 * @param {string|null} segment.text Source text, for numeric/alphanumeric.
 * @param {Uint8Array} segment.bytes UTF-8 bytes, for byte mode.
 * @param {number} version
 * @param {number} dataCodewords Data capacity in codewords.
 */
export function writeSegment(target, { mode, text, bytes }, version, dataCodewords) {
    const writer = bitWriter(target);
    const length = mode === 'byte' ? bytes.length : text.length;

    writer.put(INDICATOR[mode], 4);
    writer.put(length, countBits(mode, version));

    if (mode === 'numeric') {
        let i = 0;
        for (; i + 3 <= length; i += 3) writer.put(Number(text.slice(i, i + 3)), 10);
        const remainder = length - i;
        if (remainder === 2) writer.put(Number(text.slice(i)), 7);
        else if (remainder === 1) writer.put(Number(text.slice(i)), 4);
    } else if (mode === 'alphanumeric') {
        let i = 0;
        for (; i + 2 <= length; i += 2) {
            writer.put(ALPHANUMERIC_CODES.get(text[i]) * 45 + ALPHANUMERIC_CODES.get(text[i + 1]), 11);
        }
        if (i < length) writer.put(ALPHANUMERIC_CODES.get(text[i]), 6);
    } else {
        for (let i = 0; i < bytes.length; i++) writer.put(bytes[i], 8);
    }

    // Terminator, then pad to a codeword boundary. The buffer is already zero,
    // so this is only bookkeeping.
    const capacityBits = dataCodewords * 8;
    writer.skip(Math.min(4, capacityBits - writer.bits));
    if (writer.bits % 8) writer.skip(8 - (writer.bits % 8));

    // Fill the remainder with the specified pad pattern.
    for (let i = writer.bits / 8, pad = 0; i < dataCodewords; i++, pad++) {
        target[i] = pad % 2 === 0 ? 0xec : 0x11;
    }
}
