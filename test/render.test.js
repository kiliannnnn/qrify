import test from 'node:test';
import assert from 'node:assert/strict';

import { toSVG, toCanvas, encode } from '../core.js';
import { fakeCanvas } from './helpers.js';

test('produces a self-contained svg sized by its viewBox', () => {
    const svg = toSVG('https://example.com');
    const { size } = encode('https://example.com');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(svg, new RegExp(`viewBox="0 0 ${size + 8} ${size + 8}"`));
    assert.match(svg, /<\/svg>$/);
    // No width/height on the root by default, so it scales to its container.
    const openTag = svg.slice(0, svg.indexOf('>') + 1);
    assert.doesNotMatch(openTag, /\swidth=/);
    assert.doesNotMatch(openTag, /\sheight=/);
});

test('includes the four-module quiet zone the spec requires', () => {
    const { size } = encode('hello');
    assert.match(toSVG('hello'), new RegExp(`viewBox="0 0 ${size + 8} ${size + 8}"`));
    assert.match(toSVG('hello', { margin: 0 }), new RegExp(`viewBox="0 0 ${size} ${size}"`));
    assert.match(toSVG('hello', { margin: 10 }), new RegExp(`viewBox="0 0 ${size + 20} ${size + 20}"`));
});

test('paints an opaque background by default', () => {
    // Without this a dark page background sits behind the code and readers fail.
    assert.match(toSVG('hello'), /<rect width="\d+" height="\d+" fill="#ffffff"\/>/);
    assert.doesNotMatch(toSVG('hello', { background: 'transparent' }), /<rect/);
    assert.doesNotMatch(toSVG('hello', { background: false }), /<rect/);
    assert.match(toSVG('hello', { background: '#111' }), /fill="#111"/);
});

test('honours size, colours and shape', () => {
    const svg = toSVG('hello', { size: 320, dotColor: '#123456', cornerColor: '#abcdef' });
    assert.match(svg, /width="320" height="320"/);
    assert.match(svg, /fill="#123456"/);
    assert.match(svg, /fill="#abcdef"/);

    // Dots are arcs, squares are straight runs.
    assert.match(toSVG('hello', { shape: 'dots' }), /a\.5\.5 0 1 0/);
    assert.doesNotMatch(toSVG('hello', { shape: 'squares' }), /a\.5\.5 0 1 0/);
    assert.throws(() => toSVG('hello', { shape: 'triangles' }), TypeError);
    assert.throws(() => toSVG('hello', { margin: -1 }), RangeError);
});

test('finder patterns stay solid squares even in dot mode', () => {
    const svg = toSVG('hello', { shape: 'dots', dotColor: '#000', cornerColor: '#f00' });
    const finder = svg.match(/<path fill="#f00" d="([^"]+)"/);
    assert.ok(finder, 'expected a separate finder path');
    assert.doesNotMatch(finder[1], /a\.5\.5/, 'finders must not be drawn as dots');
});

test('escapes payload-derived text', () => {
    // The label is derived from user input and the result is inserted into the
    // DOM, so an unescaped payload would be an injection vector.
    const svg = toSVG('</svg><script>alert(1)</script>', { title: '"><img src=x>' });
    assert.doesNotMatch(svg, /<script>/);
    assert.doesNotMatch(svg, /<img/);
    assert.match(svg, /&lt;script&gt;/);
    assert.equal(svg.match(/<\/svg>/g).length, 1);
});

test('svg carries an accessible name', () => {
    assert.match(toSVG('https://example.com'), /role="img"/);
    assert.match(toSVG('https://example.com'), /aria-label="QR code: https:\/\/example\.com"/);
    assert.match(toSVG('x', { label: 'Ticket' }), /aria-label="Ticket"/);
    // A long payload is truncated rather than read out in full.
    const long = toSVG('u'.repeat(500));
    assert.ok(long.match(/aria-label="([^"]*)"/)[1].length < 140);
});

test('canvas modules land on whole device pixels', () => {
    // Fractional module sizes were what made 1.x output blurry and seamed.
    for (const [size, dpr] of [[256, 1], [256, 2], [200, 3], [137, 1.5]]) {
        const canvas = fakeCanvas();
        const { scale, pixels } = toCanvas(canvas, 'https://example.com', { size, devicePixelRatio: dpr });
        assert.ok(Number.isInteger(scale) && scale >= 1, `scale ${scale} must be a positive integer`);
        assert.equal(canvas.width, pixels);
        assert.equal(canvas.height, pixels);
        for (const call of canvas.calls.filter((c) => c.op === 'rect')) {
            assert.ok(call.args.every(Number.isInteger), `non-integer rect ${call.args}`);
        }
        // Backing store is scaled for the display, CSS size stays in layout px.
        assert.equal(canvas.style.width, `${pixels / dpr}px`);
    }
});

test('canvas falls back to layout width, then to a default', () => {
    const measured = fakeCanvas(180);
    toCanvas(measured, 'hello');
    assert.ok(measured.width > 0);

    // A zero-width canvas must still produce something visible rather than 0x0.
    const unlaid = fakeCanvas(0);
    toCanvas(unlaid, 'hello');
    assert.ok(unlaid.width > 0);
});

test('canvas gets an accessible name and rejects non-canvases', () => {
    const canvas = fakeCanvas(200);
    toCanvas(canvas, 'https://example.com');
    assert.equal(canvas.getAttribute('role'), 'img');
    assert.match(canvas.getAttribute('aria-label'), /^QR code: https/);
    assert.throws(() => toCanvas({}, 'hello'), TypeError);
});

test('transparent background clears instead of filling', () => {
    const filled = fakeCanvas(200);
    toCanvas(filled, 'hello');
    assert.ok(filled.calls.some((c) => c.op === 'fillRect'));

    const clear = fakeCanvas(200);
    toCanvas(clear, 'hello', { background: 'transparent' });
    assert.ok(clear.calls.some((c) => c.op === 'clearRect'));
    assert.ok(!clear.calls.some((c) => c.op === 'fillRect'));
});
