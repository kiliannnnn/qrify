import test from 'node:test';
import assert from 'node:assert/strict';

import { encode, maxBytes, isFinder, ECC_LEVELS } from '../core.js';
import { decode } from './helpers.js';

const PAYLOADS = {
    'ascii url': 'https://kilian.dev/posts/qrify',
    'accented latin': 'café crème à Paris — été 2024',
    'emoji': 'hi 👋🇫🇷 ✨',
    'cjk': 'こんにちは世界',
    'mixed scripts': 'Ĉ 日本語 🎉 ascii',
    'whitespace': 'line one\nline two\ttabbed',
    'single character': 'A',
    'empty string': '',
};

for (const ecc of ECC_LEVELS) {
    for (const [name, payload] of Object.entries(PAYLOADS)) {
        test(`round-trips ${name} at ECC ${ecc}`, () => {
            const code = encode(payload, { ecc });
            assert.equal(decode(code), payload);
        });
    }
}

test('UTF-8 payloads survive a real decoder', () => {
    // The 1.x encoder used charCodeAt(), which truncated anything above U+00FF
    // and produced a code that scanned to garbage.
    for (const payload of ['café', '👋', 'こんにちは', 'Ω≈ç√']) {
        assert.equal(decode(encode(payload)), payload, `failed for ${payload}`);
    }
});

test('accepts raw bytes and matches the string path', () => {
    const bytes = new TextEncoder().encode('café');
    assert.deepEqual(encode(bytes).modules, encode('café').modules);
});

test('picks the smallest version that fits', () => {
    assert.equal(encode('A').version, 1);
    assert.equal(encode('A').size, 21);
    // Version n has width 17 + 4n.
    for (const ecc of ECC_LEVELS) {
        const code = encode('x'.repeat(maxBytes(ecc)), { ecc });
        assert.equal(code.version, 40);
        assert.equal(code.size, 177);
    }
});

test('minVersion raises the version without changing the payload', () => {
    const code = encode('A', { minVersion: 10 });
    assert.equal(code.version, 10);
    assert.equal(decode(code), 'A');
});

test('capacity limits match the specification', () => {
    assert.deepEqual(
        ECC_LEVELS.map((e) => maxBytes(e)),
        [2953, 2331, 1663, 1273],
    );
});

test('encodes exactly at capacity', () => {
    for (const ecc of ECC_LEVELS) {
        const payload = 'y'.repeat(maxBytes(ecc));
        assert.equal(decode(encode(payload, { ecc })), payload);
    }
});

test('throws instead of silently truncating past capacity', () => {
    // 1.x encoded 5000 characters into a code that scanned back as the first
    // 2953 - a QR that reads as the wrong data is worse than no QR at all.
    for (const ecc of ECC_LEVELS) {
        assert.throws(
            () => encode('z'.repeat(maxBytes(ecc) + 1), { ecc }),
            RangeError,
        );
    }
    assert.throws(() => encode('z'.repeat(5000)), /too much data/);
});

test('rejects non-text input', () => {
    for (const bad of [null, undefined, 42, {}, [], true]) {
        assert.throws(() => encode(bad), TypeError);
    }
});

test('rejects an unknown ECC level', () => {
    assert.throws(() => encode('a', { ecc: 'X' }), TypeError);
});

test('ECC level is honoured, not hardcoded', () => {
    // 1.x always used level L. Higher levels need more codewords, so the same
    // payload must land on a larger version.
    const sizes = ECC_LEVELS.map((ecc) => encode('x'.repeat(200), { ecc }).size);
    for (let i = 1; i < sizes.length; i++) {
        assert.ok(sizes[i] >= sizes[i - 1], `ECC ${ECC_LEVELS[i]} should not shrink the code`);
    }
    assert.ok(sizes.at(-1) > sizes[0], 'ECC H should need a bigger code than ECC L');
    assert.equal(encode('a', { ecc: 'H' }).ecc, 'H');
});

test('matrix is square and only holds 0 or 1', () => {
    const { modules, size } = encode('https://example.com');
    assert.equal(modules.length, size * size);
    assert.ok(modules.every((v) => v === 0 || v === 1));
});

test('finder patterns are where isFinder says they are', () => {
    const { modules, size } = encode('anything');
    // The three finders are 7x7 blocks with a dark ring and a 3x3 dark core.
    for (const [ox, oy] of [[0, 0], [size - 7, 0], [0, size - 7]]) {
        assert.equal(modules[oy * size + ox], 1);
        assert.equal(modules[(oy + 3) * size + (ox + 3)], 1);
        assert.equal(modules[(oy + 1) * size + (ox + 1)], 0);
        assert.ok(isFinder(ox, oy, size));
        assert.ok(isFinder(ox + 6, oy + 6, size));
    }
    // The fourth corner has no finder.
    assert.ok(!isFinder(size - 1, size - 1, size));
    assert.ok(!isFinder(Math.floor(size / 2), Math.floor(size / 2), size));
});

test('decodes across a spread of versions', () => {
    for (const length of [1, 30, 120, 300, 700, 1200, 2000]) {
        const payload = 'q'.repeat(length);
        const code = encode(payload, { ecc: 'M' });
        assert.equal(decode(code), payload, `failed at length ${length} (v${code.version})`);
    }
});
