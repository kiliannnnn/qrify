import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

/**
 * Load the package against a fresh DOM. The element module caches its class,
 * so globals are installed before it is imported and the same registry is
 * reused for the whole file.
 */
const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true });
for (const key of ['window', 'document', 'HTMLElement', 'HTMLCanvasElement', 'customElements', 'DOMParser', 'CustomEvent', 'ResizeObserver']) {
    if (dom.window[key] !== undefined) globalThis[key] = dom.window[key];
}

const { defineQrify } = await import('../index.js');
defineQrify();

function mount(attributes = {}) {
    const el = document.createElement('qr-code');
    for (const [name, value] of Object.entries(attributes)) el.setAttribute(name, value);
    document.body.append(el);
    return el;
}

/** attributeChangedCallback batches into a microtask. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('registers <qr-code> and renders an svg on connect', () => {
    assert.ok(customElements.get('qr-code'));
    const el = mount({ string: 'https://example.com' });
    const svg = el.querySelector('svg');
    assert.ok(svg, 'expected an svg child');
    assert.equal(svg.getAttribute('role'), 'img');
    assert.match(svg.getAttribute('aria-label'), /^QR code: https/);
    el.remove();
});

test('defineQrify is idempotent and does not throw on re-registration', () => {
    // Double imports and HMR reloads used to throw here.
    const first = defineQrify();
    const second = defineQrify();
    assert.equal(first, second);
    assert.doesNotThrow(() => defineQrify());
});

test('re-renders when attributes change', async () => {
    // 1.x declared observedAttributes but had no attributeChangedCallback, so
    // nothing ever updated after the initial paint.
    const el = mount({ string: 'first' });
    const before = el.querySelector('svg').outerHTML;

    el.setAttribute('string', 'second');
    await settle();
    const after = el.querySelector('svg').outerHTML;
    assert.notEqual(before, after);
    assert.match(el.querySelector('svg').getAttribute('aria-label'), /second/);

    el.setAttribute('dot-color', '#ff0000');
    await settle();
    assert.match(el.querySelector('svg').innerHTML, /#ff0000/);
    el.remove();
});

test('batches several attribute changes into one render', async () => {
    const el = mount({ string: 'batch' });
    let renders = 0;
    el.addEventListener('qrify:render', () => { renders++; });
    el.setAttribute('dot-color', '#111');
    el.setAttribute('corner-color', '#222');
    el.setAttribute('margin', '2');
    el.setAttribute('ecc', 'H');
    await settle();
    assert.equal(renders, 1);
    el.remove();
});

test('the value property mirrors the string attribute', async () => {
    const el = mount({ string: 'https://example.com' });
    assert.equal(el.value, 'https://example.com');
    el.value = 'changed';
    assert.equal(el.getAttribute('string'), 'changed');
    await settle();
    assert.match(el.querySelector('svg').getAttribute('aria-label'), /changed/);
    el.remove();
});

test('never accumulates children across reconnects', async () => {
    // Moving the node in the DOM used to append another canvas every time.
    const el = mount({ string: 'https://example.com', renderer: 'svg' });
    const other = document.createElement('div');
    document.body.append(other);
    for (let i = 0; i < 5; i++) {
        other.append(el);
        document.body.append(el);
    }
    await settle();
    assert.equal(el.children.length, 1);
    el.remove();
    other.remove();
});

test('applies canvas-class and canvas-style, including the camelCase aliases', async () => {
    // The 1.x README documented canvasClass/canvasStyle, which HTML lowercases
    // to canvasclass/canvasstyle - they never reached the old code at all.
    const el = mount({ string: 'x', 'canvas-class': 'round-lg', 'canvas-style': 'padding: 10px' });
    assert.equal(el.querySelector('svg').getAttribute('class'), 'round-lg');
    assert.match(el.querySelector('svg').style.cssText, /padding/);

    const legacy = mount({ string: 'x', canvasclass: 'round-lg', canvasstyle: 'padding: 10px' });
    assert.equal(legacy.querySelector('svg').getAttribute('class'), 'round-lg');
    el.remove();
    legacy.remove();
});

test('renders nothing, and does not throw, without a payload', async () => {
    const el = mount({});
    assert.equal(el.children.length, 0);
    el.setAttribute('string', 'now set');
    await settle();
    assert.equal(el.children.length, 1);
    el.setAttribute('string', '');
    await settle();
    assert.equal(el.children.length, 0);
    el.remove();
});

test('reports encoding failures as an event instead of crashing', async () => {
    const el = mount({ string: 'ok' });
    const errors = [];
    el.addEventListener('qrify:error', (event) => errors.push(event.detail.error));

    const console_error = console.error;
    console.error = () => {};
    try {
        el.setAttribute('string', 'z'.repeat(5000));
        await settle();
    } finally {
        console.error = console_error;
    }

    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof RangeError);
    assert.equal(el.children.length, 0, 'a failed render must not leave a stale code behind');
    el.remove();
});

test('exposes toSVG() for downloads', () => {
    const el = mount({ string: 'https://example.com', ecc: 'H' });
    const svg = el.toSVG();
    assert.match(svg, /^<svg /);
    assert.match(svg, /<\/svg>$/);
    el.remove();
});

test('injects overridable layout styles once', () => {
    mount({ string: 'a' });
    mount({ string: 'b' });
    const styles = document.querySelectorAll('style[id^="qrify-style"]');
    assert.equal(styles.length, 1);
    assert.match(styles[0].textContent, /qr-code\{display:block\}/);
});

test('honours a custom tag name', () => {
    const Registered = defineQrify('my-qr');
    assert.ok(Registered);
    const el = document.createElement('my-qr');
    el.setAttribute('string', 'https://example.com');
    document.body.append(el);
    assert.ok(el.querySelector('svg'));
    assert.ok(document.getElementById('qrify-style-my-qr'));
    el.remove();
});
