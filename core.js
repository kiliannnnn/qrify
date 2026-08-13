/**
 * Pure entry point: encoding and rendering only, with no DOM access and no
 * side effects. Safe to import during a static build or on a server.
 *
 * ```js
 * import { toSVG } from '@kiliannnnn/qrify/core';
 * const svg = toSVG('https://example.com', { ecc: 'Q' });
 * ```
 */
export { encode, maxBytes, isFinder, ECC_LEVELS } from './src/encoder.js';
export { toSVG } from './src/svg.js';
export { toCanvas } from './src/canvas.js';
export { DEFAULTS, SHAPES } from './src/options.js';
