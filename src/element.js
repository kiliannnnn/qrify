import { toSVG } from './svg.js';
import { toCanvas } from './canvas.js';
import { defaultLabel } from './options.js';

/**
 * Observed attributes. `canvasclass`/`canvasstyle` are the lowercase forms of
 * the camelCase names the 1.x README documented — HTML lowercases attribute
 * names, so those never reached the 1.x code. They are accepted as aliases so
 * existing markup keeps working.
 */
const OBSERVED = [
    'string',
    'dot-color',
    'corner-color',
    'bg',
    'margin',
    'ecc',
    'mode',
    'size',
    'shape',
    'renderer',
    'label',
    'canvas-class',
    'canvas-style',
    'canvasclass',
    'canvasstyle',
];

let ElementClass = null;

/**
 * Build (once) the custom element class.
 *
 * The class is created lazily rather than at module scope so that importing
 * this package on a server — Astro's SSR pass, a Node script, a bundler's
 * prerender step — does not touch `HTMLElement` and blow up.
 *
 * @returns {typeof HTMLElement}
 */
export function getQrifyElement() {
    if (ElementClass) return ElementClass;
    if (typeof HTMLElement === 'undefined') {
        throw new Error('qrify: custom elements require a DOM. Import "@kiliannnnn/qrify/core" for server-side rendering.');
    }

    ElementClass = class QrifyElement extends HTMLElement {
        static observedAttributes = OBSERVED;

        #pending = false;
        #observer = null;
        #lastWidth = -1;

        connectedCallback() {
            this.#render();
        }

        disconnectedCallback() {
            this.#observer?.disconnect();
            this.#observer = null;
            this.#lastWidth = -1;
        }

        attributeChangedCallback() {
            if (!this.isConnected || this.#pending) return;
            // Setting several attributes in a row should repaint once.
            this.#pending = true;
            queueMicrotask(() => {
                this.#pending = false;
                if (this.isConnected) this.#render();
            });
        }

        /** Current payload. Mirrors the `string` attribute. */
        get value() {
            return this.getAttribute('string') ?? '';
        }

        set value(next) {
            this.setAttribute('string', next == null ? '' : String(next));
        }

        /**
         * Serialise the current code as an SVG string, whatever renderer is
         * in use. Handy for download buttons.
         */
        toSVG() {
            return toSVG(this.value, this.#options());
        }

        #attr(...names) {
            for (const name of names) {
                const value = this.getAttribute(name);
                if (value != null) return value;
            }
            return null;
        }

        #options() {
            const options = {
                dotColor: this.#attr('dot-color') ?? '#000000',
                cornerColor: this.#attr('corner-color') ?? undefined,
                ecc: this.#attr('ecc') ?? 'M',
                mode: this.#attr('mode') ?? 'auto',
                shape: this.#attr('shape') ?? 'dots',
                background: this.#attr('bg') ?? '#ffffff',
                label: this.#attr('label') ?? undefined,
            };
            const margin = this.#attr('margin');
            if (margin != null) options.margin = Number(margin);
            const size = this.#attr('size');
            if (size != null && size !== '') options.size = Number(size);
            return options;
        }

        #fail(error) {
            // Surface the problem without taking the whole page down.
            console.error('[qrify]', error.message);
            this.replaceChildren();
            this.dispatchEvent(new CustomEvent('qrify:error', {
                detail: { error },
                bubbles: true,
            }));
        }

        #render() {
            const value = this.getAttribute('string');
            if (value == null || value === '') {
                this.replaceChildren();
                this.#observer?.disconnect();
                this.#observer = null;
                return;
            }

            const renderer = (this.#attr('renderer') ?? 'svg').toLowerCase();
            try {
                if (renderer === 'canvas') this.#renderCanvas(value);
                else this.#renderSVG(value);
            } catch (error) {
                this.#fail(error);
                return;
            }

            this.dispatchEvent(new CustomEvent('qrify:render', {
                detail: { renderer },
                bubbles: true,
            }));
        }

        #applyPresentation(node) {
            const cls = this.#attr('canvas-class', 'canvasclass');
            const style = this.#attr('canvas-style', 'canvasstyle');
            if (cls) node.setAttribute('class', cls);
            if (style) node.style.cssText = style;
        }

        #renderSVG(value) {
            const options = this.#options();
            const markup = toSVG(value, options);
            // Parsed as XML rather than assigned with innerHTML: the payload is
            // escaped by toSVG(), and this keeps the SVG out of HTML parsing
            // quirks entirely.
            const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
            const svg = document.importNode(doc.documentElement, true);

            if (options.size != null) {
                svg.style.width = `${options.size}px`;
                svg.style.height = `${options.size}px`;
            }
            this.#applyPresentation(svg);
            this.replaceChildren(svg);

            this.#observer?.disconnect();
            this.#observer = null;
        }

        #renderCanvas(value) {
            let canvas = this.firstElementChild;
            if (!(canvas instanceof HTMLCanvasElement)) {
                canvas = document.createElement('canvas');
                this.replaceChildren(canvas);
            } else if (this.children.length > 1) {
                // Never accumulate canvases across reconnects.
                this.replaceChildren(canvas);
            }
            this.#applyPresentation(canvas);

            const options = this.#options();
            if (options.size == null) {
                const width = this.clientWidth;
                // A zero-width box means layout has not happened yet; watch for
                // it instead of silently drawing a 0x0 canvas.
                if (width > 0) options.size = width;
                this.#watchSize();
            }
            this.#lastWidth = this.clientWidth;
            toCanvas(canvas, value, options);
        }

        #watchSize() {
            if (this.#observer || typeof ResizeObserver === 'undefined') return;
            this.#observer = new ResizeObserver(() => {
                const width = this.clientWidth;
                // Guard against the feedback loop of our own canvas resize.
                if (width === this.#lastWidth) return;
                this.#lastWidth = width;
                this.#render();
            });
            this.#observer.observe(this);
        }
    };

    return ElementClass;
}

/**
 * Inject the small amount of layout CSS the element needs. A stylesheet rather
 * than inline styles, so that page CSS can override it.
 */
function injectStyles(name) {
    if (typeof document === 'undefined') return;
    const id = `qrify-style-${name}`;
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent =
        `${name}{display:block}` +
        `${name}[hidden]{display:none}` +
        `${name}>svg{display:block;width:100%;height:auto}` +
        `${name}>canvas{display:block}`;
    document.head.append(style);
}

/**
 * Register the custom element.
 *
 * Safe to call repeatedly and on the server, where it is a no-op.
 *
 * @param {string} [name='qr-code'] Tag name to register.
 * @returns {typeof HTMLElement|undefined} The registered class, or undefined
 *   when there is no custom element registry (i.e. during SSR).
 */
export function defineQrify(name = 'qr-code') {
    if (typeof customElements === 'undefined') return undefined;
    const existing = customElements.get(name);
    if (existing) return existing;
    // A constructor can only be registered once, so each tag name gets its own
    // trivial subclass of the shared implementation.
    const Element = class extends getQrifyElement() { };
    customElements.define(name, Element);
    injectStyles(name);
    return Element;
}

export { defaultLabel };
