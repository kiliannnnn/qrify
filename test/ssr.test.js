import test from 'node:test';
import assert from 'node:assert/strict';

test('the default entry point imports without a DOM', async () => {
    // 1.x declared `class QRCode extends HTMLElement` at module scope, so
    // merely importing the package threw ReferenceError on any server render.
    assert.equal(typeof globalThis.HTMLElement, 'undefined');
    assert.equal(typeof globalThis.customElements, 'undefined');

    const mod = await import('../index.js');
    assert.equal(typeof mod.toSVG, 'function');
    assert.equal(typeof mod.encode, 'function');
    assert.equal(typeof mod.defineQrify, 'function');
});

test('defineQrify is a no-op without a custom element registry', async () => {
    const { defineQrify } = await import('../index.js');
    assert.equal(defineQrify(), undefined);
    assert.equal(defineQrify('some-other-name'), undefined);
});

test('getQrifyElement explains itself when there is no DOM', async () => {
    const { getQrifyElement } = await import('../index.js');
    assert.throws(() => getQrifyElement(), /require a DOM/);
});

test('the core entry point renders on the server', async () => {
    const { toSVG } = await import('../core.js');
    const svg = toSVG('https://example.com', { ecc: 'Q' });
    assert.match(svg, /^<svg /);
    assert.match(svg, /<\/svg>$/);
});

test('the core entry point never reaches for the DOM', async () => {
    // Anything that touches document/window at import time breaks static builds.
    const { readFile } = await import('node:fs/promises');
    for (const file of ['../core.js', '../src/encoder.js', '../src/svg.js', '../src/options.js', '../src/tables.js']) {
        const source = await readFile(new URL(file, import.meta.url), 'utf8');
        const stripped = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        assert.doesNotMatch(stripped, /\b(document|window|HTMLElement|customElements)\b/, `${file} touches the DOM`);
    }
});
