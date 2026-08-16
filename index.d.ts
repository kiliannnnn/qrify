export * from './core.js';

import type { SvgOptions } from './core.js';

/**
 * The `<qr-code>` custom element.
 *
 * Attributes: `string` (required), `dot-color`, `corner-color`, `bg`,
 * `margin`, `ecc`, `size`, `shape`, `renderer`, `label`, `canvas-class`,
 * `canvas-style`.
 */
export interface QrifyElement extends HTMLElement {
    /** Current payload. Mirrors the `string` attribute. */
    value: string;
    /** Serialise the current code as an SVG string. */
    toSVG(): string;
}

/**
 * Build the custom element class.
 *
 * @throws {Error} when called without a DOM.
 */
export declare function getQrifyElement(): CustomElementConstructor;

/**
 * Register the custom element. Safe to call repeatedly, and a no-op on the
 * server.
 *
 * @param name Tag name to register. Defaults to 'qr-code'.
 * @returns The registered class, or undefined when there is no registry.
 */
export declare function defineQrify(name?: string): CustomElementConstructor | undefined;

declare global {
    interface HTMLElementTagNameMap {
        'qr-code': QrifyElement;
    }
}

export type { SvgOptions };
