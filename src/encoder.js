import {
    ECC_BLOCKS,
    ALIGN_DELTA,
    VERSION_PATTERN,
    FORMAT_WORD,
    GF_LOG,
    GF_EXP,
} from './tables.js';
import { MODES, detectMode, supportsMode, capacityFor, writeSegment } from './modes.js';

/**
 * Error correction levels, in the order used by the lookup tables.
 * L recovers ~7% of the code, M ~15%, Q ~25%, H ~30%.
 */
export const ECC_LEVELS = ['L', 'M', 'Q', 'H'];

// Badness coefficients used when scoring mask candidates.
const N1 = 3, N2 = 3, N3 = 40, N4 = 10;

const encoder = new TextEncoder();

function eccIndex(level) {
    const i = ECC_LEVELS.indexOf(String(level).toUpperCase());
    if (i === -1) {
        throw new TypeError(
            `Unknown error correction level ${JSON.stringify(level)}. Expected one of ${ECC_LEVELS.join(', ')}.`
        );
    }
    return i + 1; // tables are 1-indexed on ECC level
}

/**
 * Read one version's block layout out of ECC_BLOCKS.
 */
function blockLayout(version, ecclevel) {
    const k = (ecclevel - 1) * 4 + (version - 1) * 16;
    return {
        neccblk1: ECC_BLOCKS[k],
        neccblk2: ECC_BLOCKS[k + 1],
        datablkw: ECC_BLOCKS[k + 2],
        eccblkwid: ECC_BLOCKS[k + 3],
    };
}

/**
 * Number of data codewords available at a version/ECC pair.
 */
function dataCodewordsFor(version, ecclevel) {
    const { neccblk1, neccblk2, datablkw } = blockLayout(version, ecclevel);
    return datablkw * (neccblk1 + neccblk2) + neccblk2;
}

/**
 * Maximum payload length at a given ECC level and mode.
 *
 * @param {'L'|'M'|'Q'|'H'} [ecc]
 * @param {'numeric'|'alphanumeric'|'byte'} [mode]
 * @returns {number} Characters for numeric/alphanumeric, bytes for byte mode.
 */
export function maxLength(ecc = 'M', mode = 'byte') {
    if (!MODES.includes(mode)) {
        throw new TypeError(`qrify: unknown mode ${JSON.stringify(mode)}. Expected one of ${MODES.join(', ')}.`);
    }
    const ecclevel = eccIndex(ecc);
    return capacityFor(mode, 40, dataCodewordsFor(40, ecclevel));
}

/**
 * Maximum number of bytes encodable at a given ECC level.
 *
 * @param {'L'|'M'|'Q'|'H'} [ecc]
 * @returns {number}
 */
export function maxBytes(ecc = 'M') {
    return maxLength(ecc, 'byte');
}

/**
 * Smallest version that fits `length` units of `mode`, or null when none does.
 */
function selectVersion(mode, length, ecclevel, minVersion) {
    for (let version = Math.max(1, minVersion); version <= 40; version++) {
        if (length <= capacityFor(mode, version, dataCodewordsFor(version, ecclevel))) return version;
    }
    return null;
}

/**
 * Encode text (or raw bytes) as a QR code matrix.
 *
 * Digits are encoded in numeric mode and the uppercase/symbol subset in
 * alphanumeric mode, both of which pack tighter than byte mode. Anything else
 * is encoded as UTF-8 in byte mode, so any Unicode input round-trips through a
 * standards-compliant reader.
 *
 * @param {string|Uint8Array} input Text or raw bytes to encode.
 * @param {object} [options]
 * @param {'L'|'M'|'Q'|'H'} [options.ecc='M'] Error correction level.
 * @param {'auto'|'numeric'|'alphanumeric'|'byte'} [options.mode='auto']
 *   Encoding mode. 'auto' picks the tightest one the payload allows.
 * @param {number} [options.minVersion=1] Force at least this version (1-40).
 * @returns {{modules: Uint8Array, size: number, version: number, ecc: string, mode: string}}
 *   `modules` is a row-major `size * size` matrix; 1 is a dark module.
 * @throws {TypeError} when the input is not a string or Uint8Array, or the
 *   requested mode cannot represent it.
 * @throws {RangeError} when the input does not fit in a version 40 code.
 */
export function encode(input, options = {}) {
    const { ecc = 'M', minVersion = 1, mode = 'auto' } = options;

    let bytes;
    let text = null;
    if (typeof input === 'string') {
        text = input;
        bytes = encoder.encode(input);
    } else if (input instanceof Uint8Array) {
        bytes = input;
    } else {
        throw new TypeError(
            `qrify: expected a string or Uint8Array to encode, received ${input === null ? 'null' : typeof input}.`
        );
    }

    // Raw bytes have no character semantics, so they always go through byte mode.
    let selected;
    if (text === null) {
        selected = 'byte';
    } else if (mode === 'auto') {
        selected = detectMode(text);
    } else if (!MODES.includes(mode)) {
        throw new TypeError(
            `qrify: unknown mode ${JSON.stringify(mode)}. Expected 'auto' or one of ${MODES.join(', ')}.`
        );
    } else if (!supportsMode(text, mode)) {
        throw new TypeError(`qrify: the payload cannot be represented in ${mode} mode.`);
    } else {
        selected = mode;
    }

    const ecclevel = eccIndex(ecc);
    const length = selected === 'byte' ? bytes.length : text.length;
    const version = selectVersion(selected, length, ecclevel, minVersion);
    if (version === null) {
        const limit = capacityFor(selected, 40, dataCodewordsFor(40, ecclevel));
        const unit = selected === 'byte' ? 'bytes' : 'characters';
        throw new RangeError(
            `qrify: ${length} ${unit} is too much data for a QR code. ` +
            `The maximum in ${selected} mode at error correction level ${ECC_LEVELS[ecclevel - 1]} is ${limit} ${unit}.`
        );
    }

    const { neccblk1, neccblk2, datablkw, eccblkwid } = blockLayout(version, ecclevel);
    const width = 17 + 4 * version;

    // Total data codewords, and the full codeword count including ECC.
    const dataCodewords = datablkw * (neccblk1 + neccblk2) + neccblk2;
    const totalCodewords = dataCodewords + eccblkwid * (neccblk1 + neccblk2);

    // Working buffers. `strinbuf` holds data then ECC; `eccbuf` receives the
    // interleaved result. Both carry slack because appendrs() reads one past
    // the end of a block while shifting.
    let strinbuf = new Uint8Array(totalCodewords + eccblkwid + 8);
    const eccbuf = new Uint8Array(totalCodewords + 8);
    let qrframe = new Uint8Array(width * width);
    const framask = new Uint8Array(((width * (width + 1) + 1) >> 1) + 1);
    const genpoly = new Uint8Array(eccblkwid + 1);

    let x, y, k, t, v, i, j;

    // Set bit to indicate cell in qrframe is immutable. Symmetric around diagonal.
    function setmask(x, y) {
        let bt;
        if (x > y) {
            bt = x;
            x = y;
            y = bt;
        }
        // y*y = 1+3+5...
        bt = y;
        bt *= y;
        bt += y;
        bt >>= 1;
        bt += x;
        framask[bt] = 1;
    }

    // Check mask - since symmetrical use half.
    function ismasked(x, y) {
        let bt;
        if (x > y) {
            bt = x;
            x = y;
            y = bt;
        }
        bt = y;
        bt += y * y;
        bt >>= 1;
        bt += x;
        return framask[bt];
    }

    // Enter alignment pattern - black to qrframe, white to mask
    // (later black frame merged to mask).
    function putalign(x, y) {
        let j;

        qrframe[x + width * y] = 1;
        for (j = -2; j < 2; j++) {
            qrframe[(x + j) + width * (y - 2)] = 1;
            qrframe[(x - 2) + width * (y + j + 1)] = 1;
            qrframe[(x + 2) + width * (y + j)] = 1;
            qrframe[(x + j + 1) + width * (y + 2)] = 1;
        }
        for (j = 0; j < 2; j++) {
            setmask(x - 1, y + j);
            setmask(x + 1, y - j);
            setmask(x - j, y - 1);
            setmask(x + j, y + 1);
        }
    }

    //========================================================================
    // Reed Solomon error correction
    // exponentiation mod N
    function modnn(x) {
        while (x >= 255) {
            x -= 255;
            x = (x >> 8) + (x & 255);
        }
        return x;
    }

    // Calculate and append ECC data to data block. Block is in strinbuf,
    // indexes to buffers given.
    function appendrs(data, dlen, ecbuf, eclen) {
        let i, j, fb;

        for (i = 0; i < eclen; i++)
            strinbuf[ecbuf + i] = 0;
        for (i = 0; i < dlen; i++) {
            fb = GF_LOG[strinbuf[data + i] ^ strinbuf[ecbuf]];
            if (fb != 255)     /* fb term is non-zero */
                for (j = 1; j < eclen; j++)
                    strinbuf[ecbuf + j - 1] = strinbuf[ecbuf + j] ^ GF_EXP[modnn(fb + genpoly[eclen - j])];
            else
                for (j = ecbuf; j < ecbuf + eclen; j++)
                    strinbuf[j] = strinbuf[j + 1];
            strinbuf[ecbuf + eclen - 1] = fb == 255 ? 0 : GF_EXP[modnn(fb + genpoly[0])];
        }
    }

    //========================================================================
    //  Apply the selected mask out of the 8.
    function applymask(m) {
        let x, y, r3x, r3y;

        switch (m) {
            case 0:
                for (y = 0; y < width; y++)
                    for (x = 0; x < width; x++)
                        if (!((x + y) & 1) && !ismasked(x, y))
                            qrframe[x + y * width] ^= 1;
                break;
            case 1:
                for (y = 0; y < width; y++)
                    for (x = 0; x < width; x++)
                        if (!(y & 1) && !ismasked(x, y))
                            qrframe[x + y * width] ^= 1;
                break;
            case 2:
                for (y = 0; y < width; y++)
                    for (r3x = 0, x = 0; x < width; x++, r3x++) {
                        if (r3x == 3)
                            r3x = 0;
                        if (!r3x && !ismasked(x, y))
                            qrframe[x + y * width] ^= 1;
                    }
                break;
            case 3:
                for (r3y = 0, y = 0; y < width; y++, r3y++) {
                    if (r3y == 3)
                        r3y = 0;
                    for (r3x = r3y, x = 0; x < width; x++, r3x++) {
                        if (r3x == 3)
                            r3x = 0;
                        if (!r3x && !ismasked(x, y))
                            qrframe[x + y * width] ^= 1;
                    }
                }
                break;
            case 4:
                for (y = 0; y < width; y++)
                    for (r3x = 0, r3y = ((y >> 1) & 1), x = 0; x < width; x++, r3x++) {
                        if (r3x == 3) {
                            r3x = 0;
                            r3y = !r3y;
                        }
                        if (!r3y && !ismasked(x, y))
                            qrframe[x + y * width] ^= 1;
                    }
                break;
            case 5:
                for (r3y = 0, y = 0; y < width; y++, r3y++) {
                    if (r3y == 3)
                        r3y = 0;
                    for (r3x = 0, x = 0; x < width; x++, r3x++) {
                        if (r3x == 3)
                            r3x = 0;
                        if (!((x & y & 1) + !(!r3x | !r3y)) && !ismasked(x, y))
                            qrframe[x + y * width] ^= 1;
                    }
                }
                break;
            case 6:
                for (r3y = 0, y = 0; y < width; y++, r3y++) {
                    if (r3y == 3)
                        r3y = 0;
                    for (r3x = 0, x = 0; x < width; x++, r3x++) {
                        if (r3x == 3)
                            r3x = 0;
                        if (!(((x & y & 1) + (r3x && (r3x == r3y))) & 1) && !ismasked(x, y))
                            qrframe[x + y * width] ^= 1;
                    }
                }
                break;
            case 7:
                for (r3y = 0, y = 0; y < width; y++, r3y++) {
                    if (r3y == 3)
                        r3y = 0;
                    for (r3x = 0, x = 0; x < width; x++, r3x++) {
                        if (r3x == 3)
                            r3x = 0;
                        if (!(((r3x && (r3x == r3y)) + ((x + y) & 1)) & 1) && !ismasked(x, y))
                            qrframe[x + y * width] ^= 1;
                    }
                }
                break;
        }
    }

    // Penalty scoring from ISO/IEC 18004 section 8.8.2. The original code
    // used a cheaper heuristic here; its approximation of rule 3 under-counted
    // false finder patterns, and codes with large regular regions (numeric or
    // alphanumeric payloads with a lot of padding) could end up masked such
    // that a real scanner's detector could not locate the symbol at all.

    // Rule 3 looks for the finder-like sequence 1:1:3:1:1 with four light
    // modules on either side, in both orientations.
    const RULE3_A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const RULE3_B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];

    function matchesAt(line, at, pattern) {
        for (let i = 0; i < pattern.length; i++) {
            if (line[at + i] !== pattern[i]) return false;
        }
        return true;
    }

    // Rules 1 and 3 applied to a single row or column.
    function scoreLine(line) {
        let score = 0;

        // Rule 1: runs of five or more modules of the same colour.
        let run = 1;
        for (let i = 1; i < width; i++) {
            if (line[i] === line[i - 1]) {
                run++;
            } else {
                if (run >= 5) score += N1 + run - 5;
                run = 1;
            }
        }
        if (run >= 5) score += N1 + run - 5;

        // Rule 3: finder-like patterns.
        for (let i = 0; i + 11 <= width; i++) {
            if (matchesAt(line, i, RULE3_A) || matchesAt(line, i, RULE3_B)) score += N3;
        }

        return score;
    }

    /**
     * Total penalty for the current qrframe. Lower is better.
     */
    function badcheck() {
        let score = 0;
        let dark = 0;

        const row = new Uint8Array(width);
        const column = new Uint8Array(width);

        for (let y = 0; y < width; y++) {
            for (let x = 0; x < width; x++) {
                row[x] = qrframe[x + width * y];
                column[x] = qrframe[y + width * x];
                if (row[x]) dark++;
            }
            score += scoreLine(row);
            score += scoreLine(column);
        }

        // Rule 2: blocks of the same colour, counted as overlapping 2x2 boxes.
        for (let y = 0; y < width - 1; y++) {
            for (let x = 0; x < width - 1; x++) {
                const a = qrframe[x + width * y];
                if (a === qrframe[(x + 1) + width * y]
                    && a === qrframe[x + width * (y + 1)]
                    && a === qrframe[(x + 1) + width * (y + 1)]) {
                    score += N2;
                }
            }
        }

        // Rule 4: deviation from an even split of dark and light modules.
        const percent = (dark * 100) / (width * width);
        score += Math.floor(Math.abs(percent - 50) / 5) * N4;

        return score;
    }

    // insert finders - black to frame, white to mask
    for (t = 0; t < 3; t++) {
        k = 0;
        y = 0;
        if (t == 1)
            k = (width - 7);
        if (t == 2)
            y = (width - 7);
        qrframe[(y + 3) + width * (k + 3)] = 1;
        for (x = 0; x < 6; x++) {
            qrframe[(y + x) + width * k] = 1;
            qrframe[y + width * (k + x + 1)] = 1;
            qrframe[(y + 6) + width * (k + x)] = 1;
            qrframe[(y + x + 1) + width * (k + 6)] = 1;
        }
        for (x = 1; x < 5; x++) {
            setmask(y + x, k + 1);
            setmask(y + 1, k + x + 1);
            setmask(y + 5, k + x);
            setmask(y + x + 1, k + 5);
        }
        for (x = 2; x < 4; x++) {
            qrframe[(y + x) + width * (k + 2)] = 1;
            qrframe[(y + 2) + width * (k + x + 1)] = 1;
            qrframe[(y + 4) + width * (k + x)] = 1;
            qrframe[(y + x + 1) + width * (k + 4)] = 1;
        }
    }

    // alignment blocks
    if (version > 1) {
        t = ALIGN_DELTA[version];
        y = width - 7;
        for (; ;) {
            x = width - 7;
            while (x > t - 3) {
                putalign(x, y);
                if (x < t)
                    break;
                x -= t;
            }
            if (y <= t + 9)
                break;
            y -= t;
            putalign(6, y);
            putalign(y, 6);
        }
    }

    // single black
    qrframe[8 + width * (width - 8)] = 1;

    // timing gap - mask only
    for (y = 0; y < 7; y++) {
        setmask(7, y);
        setmask(width - 8, y);
        setmask(7, y + width - 7);
    }
    for (x = 0; x < 8; x++) {
        setmask(x, 7);
        setmask(x + width - 8, 7);
        setmask(x, width - 8);
    }

    // reserve mask-format area
    for (x = 0; x < 9; x++)
        setmask(x, 8);
    for (x = 0; x < 8; x++) {
        setmask(x + width - 8, 8);
        setmask(8, x);
    }
    for (y = 0; y < 7; y++)
        setmask(8, y + width - 7);

    // timing row/col
    for (x = 0; x < width - 14; x++)
        if (x & 1) {
            setmask(8 + x, 6);
            setmask(6, 8 + x);
        }
        else {
            qrframe[(8 + x) + width * 6] = 1;
            qrframe[6 + width * (8 + x)] = 1;
        }

    // version block
    if (version > 6) {
        t = VERSION_PATTERN[version - 7];
        k = 17;
        for (x = 0; x < 6; x++)
            for (y = 0; y < 3; y++, k--)
                if (1 & (k > 11 ? version >> (k - 12) : t >> k)) {
                    qrframe[(5 - x) + width * (2 - y + width - 11)] = 1;
                    qrframe[(2 - y + width - 11) + width * (5 - x)] = 1;
                }
                else {
                    setmask(5 - x, 2 - y + width - 11);
                    setmask(2 - y + width - 11, 5 - x);
                }
    }

    // sync mask bits - only set above for white spaces, so add in black bits
    for (y = 0; y < width; y++)
        for (x = 0; x <= y; x++)
            if (qrframe[x + width * y])
                setmask(x, y);

    // Mode indicator, character count, payload, terminator and pad pattern.
    writeSegment(strinbuf, { mode: selected, text, bytes }, version, dataCodewords);

    // calculate generator polynomial
    genpoly[0] = 1;
    for (i = 0; i < eccblkwid; i++) {
        genpoly[i + 1] = 1;
        for (j = i; j > 0; j--)
            genpoly[j] = genpoly[j]
                ? genpoly[j - 1] ^ GF_EXP[modnn(GF_LOG[genpoly[j]] + i)] : genpoly[j - 1];
        genpoly[0] = GF_EXP[modnn(GF_LOG[genpoly[0]] + i)];
    }
    for (i = 0; i <= eccblkwid; i++)
        genpoly[i] = GF_LOG[genpoly[i]]; // use logs for genpoly[] to save calc step

    // append ecc to data buffer
    k = dataCodewords;
    y = 0;
    for (i = 0; i < neccblk1; i++) {
        appendrs(y, datablkw, k, eccblkwid);
        y += datablkw;
        k += eccblkwid;
    }
    for (i = 0; i < neccblk2; i++) {
        appendrs(y, datablkw + 1, k, eccblkwid);
        y += datablkw + 1;
        k += eccblkwid;
    }

    // interleave blocks
    y = 0;
    for (i = 0; i < datablkw; i++) {
        for (j = 0; j < neccblk1; j++)
            eccbuf[y++] = strinbuf[i + j * datablkw];
        for (j = 0; j < neccblk2; j++)
            eccbuf[y++] = strinbuf[(neccblk1 * datablkw) + i + (j * (datablkw + 1))];
    }
    for (j = 0; j < neccblk2; j++)
        eccbuf[y++] = strinbuf[(neccblk1 * datablkw) + i + (j * (datablkw + 1))];
    for (i = 0; i < eccblkwid; i++)
        for (j = 0; j < neccblk1 + neccblk2; j++)
            eccbuf[y++] = strinbuf[dataCodewords + i + j * eccblkwid];
    strinbuf = eccbuf;

    // pack bits into frame avoiding masked area.
    x = y = width - 1;
    k = v = 1;         // up, minus
    /* interleaved data and ecc codes */
    const m = (datablkw + eccblkwid) * (neccblk1 + neccblk2) + neccblk2;
    for (i = 0; i < m; i++) {
        t = strinbuf[i];
        for (j = 0; j < 8; j++, t <<= 1) {
            if (0x80 & t)
                qrframe[x + width * y] = 1;
            do {        // find next fill position
                if (v)
                    x--;
                else {
                    x++;
                    if (k) {
                        if (y != 0)
                            y--;
                        else {
                            x -= 2;
                            k = !k;
                            if (x == 6) {
                                x--;
                                y = 9;
                            }
                        }
                    }
                    else {
                        if (y != width - 1)
                            y++;
                        else {
                            x -= 2;
                            k = !k;
                            if (x == 6) {
                                x--;
                                y -= 8;
                            }
                        }
                    }
                }
                v = !v;
            } while (ismasked(x, y));
        }
    }

    // Score all eight masks and keep the best. The original code stopped early
    // when a mask looked "good enough", inherited from the Arduino version
    // where the later masks were expensive; there is no reason to skip them
    // here, and evaluating all eight is what the specification asks for.
    const cleanframe = qrframe.slice(0);
    t = 0;             // best mask
    y = Infinity;      // best penalty
    for (k = 0; k < 8; k++) {
        qrframe = cleanframe.slice(0);
        applymask(k);
        x = badcheck();
        if (x < y) {
            y = x;
            t = k;
        }
    }
    qrframe = cleanframe.slice(0);
    applymask(t);

    // add in final mask/ecclevel bytes
    y = FORMAT_WORD[t + ((ecclevel - 1) << 3)];
    // low byte
    for (k = 0; k < 8; k++, y >>= 1)
        if (y & 1) {
            qrframe[(width - 1 - k) + width * 8] = 1;
            if (k < 6)
                qrframe[8 + width * k] = 1;
            else
                qrframe[8 + width * (k + 1)] = 1;
        }
    // high byte
    for (k = 0; k < 7; k++, y >>= 1)
        if (y & 1) {
            qrframe[8 + width * (width - 7 + k)] = 1;
            if (k)
                qrframe[(6 - k) + width * 8] = 1;
            else
                qrframe[7 + width * 8] = 1;
        }

    return {
        modules: qrframe,
        size: width,
        version,
        ecc: ECC_LEVELS[ecclevel - 1],
        mode: selected,
    };
}

/**
 * True when (x, y) falls inside one of the three 7x7 finder patterns.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} size Matrix width, excluding any quiet zone.
 * @returns {boolean}
 */
export function isFinder(x, y, size) {
    const f = 7;
    return (
        (x < f && y < f) ||                 // top-left
        (x < f && y >= size - f) ||         // bottom-left
        (x >= size - f && y < f)            // top-right
    );
}
