import test from 'node:test';
import assert from 'node:assert/strict';

import { encode, maxLength, maxBytes, toSVG } from '../core.js';
import { ALPHANUMERIC_CHARS } from '../src/modes.js';
import { decode } from './helpers.js';

test('picks the tightest mode the payload allows', () => {
    assert.equal(encode('0123456789').mode, 'numeric');
    assert.equal(encode('HELLO WORLD').mode, 'alphanumeric');
    assert.equal(encode('HTTPS://KILIAN.DEV').mode, 'alphanumeric');
    assert.equal(encode('TICKET-4821 $19.50').mode, 'alphanumeric');
    assert.equal(encode('WIFI:T:WPA;S:NET;').mode, 'byte');  // ';' is not in the set
    assert.equal(encode('hello world').mode, 'byte');       // lowercase
    assert.equal(encode('café').mode, 'byte');
    assert.equal(encode('https://kilian.dev').mode, 'byte'); // lowercase + unsupported chars
    assert.equal(encode('').mode, 'byte');
    // Raw bytes have no character semantics.
    assert.equal(encode(new TextEncoder().encode('123')).mode, 'byte');
});

test('numeric payloads round-trip at every length remainder', () => {
    for (let n = 1; n <= 40; n++) {
        const payload = '9876543210'.repeat(5).slice(0, n);
        const code = encode(payload);
        assert.equal(code.mode, 'numeric');
        assert.equal(decode(code), payload, `failed at length ${n}`);
    }
});

test('alphanumeric payloads round-trip at odd and even lengths', () => {
    // Rotated so every prefix starts with a letter; a digits-only prefix would
    // legitimately be detected as numeric instead.
    const alphabet = ALPHANUMERIC_CHARS.slice(10) + ALPHANUMERIC_CHARS.slice(0, 10);
    for (let n = 1; n <= 45; n++) {
        const payload = alphabet.slice(0, n);
        const code = encode(payload);
        assert.equal(code.mode, 'alphanumeric');
        assert.equal(decode(code), payload, `failed at length ${n}`);
    }
});

test('every alphanumeric character survives the round-trip', () => {
    const code = encode(ALPHANUMERIC_CHARS);
    assert.equal(code.mode, 'alphanumeric');
    assert.equal(decode(code), ALPHANUMERIC_CHARS);
});

test('tighter modes produce smaller codes', () => {
    // The whole point: 400 digits in byte mode needs a much bigger symbol.
    const digits = '1234567890'.repeat(40);
    const auto = encode(digits);
    const forced = encode(digits, { mode: 'byte' });
    assert.equal(auto.mode, 'numeric');
    assert.ok(auto.version < forced.version, `expected numeric (v${auto.version}) to beat byte (v${forced.version})`);

    const letters = 'ABCDEFGHIJ'.repeat(30);
    assert.ok(encode(letters).version < encode(letters, { mode: 'byte' }).version);
});

test('capacities match the specification', () => {
    assert.deepEqual(['L', 'M', 'Q', 'H'].map((e) => maxLength(e, 'numeric')), [7089, 5596, 3993, 3057]);
    assert.deepEqual(['L', 'M', 'Q', 'H'].map((e) => maxLength(e, 'alphanumeric')), [4296, 3391, 2420, 1852]);
    assert.deepEqual(['L', 'M', 'Q', 'H'].map((e) => maxLength(e, 'byte')), [2953, 2331, 1663, 1273]);
    assert.equal(maxLength('M'), maxBytes('M'));
});

test('encodes right up to capacity in each mode', () => {
    const digits = '7'.repeat(maxLength('L', 'numeric'));
    assert.equal(decode(encode(digits, { ecc: 'L' })), digits);

    const letters = 'K'.repeat(maxLength('L', 'alphanumeric'));
    assert.equal(decode(encode(letters, { ecc: 'L' })), letters);
});

test('overflow throws with a mode-aware message', () => {
    assert.throws(
        () => encode('7'.repeat(maxLength('L', 'numeric') + 1), { ecc: 'L' }),
        /numeric mode.*7089 characters/s,
    );
    assert.throws(() => encode('7'.repeat(maxLength('H', 'numeric') + 1), { ecc: 'H' }), RangeError);
});

test('an explicit mode is honoured, and rejected when impossible', () => {
    assert.equal(encode('123', { mode: 'byte' }).mode, 'byte');
    assert.equal(encode('123', { mode: 'alphanumeric' }).mode, 'alphanumeric');
    assert.equal(decode(encode('123', { mode: 'alphanumeric' })), '123');

    assert.throws(() => encode('abc', { mode: 'numeric' }), TypeError);
    assert.throws(() => encode('café', { mode: 'alphanumeric' }), TypeError);
    assert.throws(() => encode('123', { mode: 'octal' }), TypeError);
    assert.throws(() => maxLength('M', 'octal'), TypeError);
});

test('mode selection respects version count-indicator boundaries', () => {
    // Count indicator width changes at versions 10 and 27; a payload sitting on
    // a boundary must still fit what the header claims.
    for (const mode of ['numeric', 'alphanumeric', 'byte']) {
        const alphabet = mode === 'numeric' ? '5' : mode === 'alphanumeric' ? 'Q' : 'q';
        for (let version = 1; version <= 40; version++) {
            const code = encode(alphabet.repeat(1), { minVersion: version, mode });
            assert.equal(code.version, version);
        }
    }
});

test('a realistic numeric payload shrinks noticeably', () => {
    const ticket = '4539578763621486';           // 16 digits
    const numeric = encode(ticket);
    const byte = encode(ticket, { mode: 'byte' });
    assert.equal(numeric.mode, 'numeric');
    assert.ok(numeric.size <= byte.size);
    assert.equal(decode(numeric), ticket);
});

test('the mode option reaches the renderers', () => {
    // Regression guard: resolveOptions() must carry `mode` through to encode(),
    // otherwise the renderers silently fall back to auto-detection.
    const digits = '1234567890'.repeat(40);
    const numeric = toSVG(digits);
    const forced = toSVG(digits, { mode: 'byte' });
    const viewBox = (svg) => Number(svg.match(/viewBox="0 0 (\d+)/)[1]);
    assert.ok(viewBox(numeric) < viewBox(forced), 'numeric mode should yield a smaller symbol');
    assert.throws(() => toSVG('abc', { mode: 'numeric' }), TypeError);
});
