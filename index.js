/**
 * Default entry point.
 *
 * Re-exports the pure API and registers `<qr-code>` in the browser, so the
 * 1.x usage keeps working:
 *
 * ```js
 * import '@kiliannnnn/qrify';
 * ```
 *
 * Registration is skipped when there is no custom element registry, which
 * makes this module safe to evaluate during server-side rendering. For a
 * guaranteed side-effect-free import, use `@kiliannnnn/qrify/core`.
 */
import { defineQrify } from './src/element.js';

export * from './core.js';
export { defineQrify, getQrifyElement } from './src/element.js';

defineQrify();
