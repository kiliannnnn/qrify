/**
 * Compile-only check that the published type declarations match how the
 * library is actually meant to be used. Run with `npm run typecheck`.
 * Nothing here executes.
 */
import { encode, toSVG, toCanvas, maxBytes, maxLength, detectMode, isFinder, ECC_LEVELS, MODES, ALPHANUMERIC_CHARS } from '../core.js';
import { defineQrify, getQrifyElement } from '../index.js';
import type { EccLevel, EncodeResult, EncodingMode, RenderOptions, SvgOptions } from '../core.js';

const code: EncodeResult = encode('https://example.com', { ecc: 'Q', minVersion: 4 });
const dark: number = code.modules[0];
const side: number = code.size;
const version: number = code.version;
const level: EccLevel = code.ecc;
const bytes: EncodeResult = encode(new TextEncoder().encode('bytes'));
const usedMode: EncodingMode = code.mode;
const forced: EncodeResult = encode('1234', { mode: 'numeric' });
const auto: EncodeResult = encode('1234', { mode: 'auto' });

const svg: string = toSVG('https://example.com', {
    ecc: 'H',
    margin: 2,
    background: 'transparent',
    dotColor: '#111',
    cornerColor: '#f00',
    shape: 'squares',
    size: 320,
    label: 'Scan me',
    title: 'Link to the post',
});
const minimal: string = toSVG('text');
const transparent: string = toSVG('text', { background: false });

const limit: number = maxBytes('H');
const corner: boolean = isFinder(0, 0, 21);
const levels: readonly EccLevel[] = ECC_LEVELS;
const modes: readonly EncodingMode[] = MODES;
const alphabet: string = ALPHANUMERIC_CHARS;
const digitsLimit: number = maxLength('Q', 'numeric');
const detected: EncodingMode = detectMode('12345');

declare const canvasEl: HTMLCanvasElement;
const drawn = toCanvas(canvasEl, 'text', { devicePixelRatio: 2, size: 200 });
const scale: number = drawn.scale;
const pixels: number = drawn.pixels;

const registered: CustomElementConstructor | undefined = defineQrify('my-qr');
const cls: CustomElementConstructor = getQrifyElement();

// The element is typed through HTMLElementTagNameMap.
declare const doc: Document;
const el = doc.querySelector('qr-code');
if (el) {
    el.value = 'https://example.com';
    const markup: string = el.toSVG();
    void markup;
}

// Options interfaces are usable for wrapper components.
const shared: RenderOptions = { ecc: 'M', shape: 'dots' };
const svgOnly: SvgOptions = { ...shared, title: 'x' };

// @ts-expect-error - 'X' is not a valid ECC level
toSVG('text', { ecc: 'X' });
// @ts-expect-error - shape is a fixed union
toSVG('text', { shape: 'triangles' });
// @ts-expect-error - encode requires an input
encode();
// @ts-expect-error - 'kanji' is not a supported mode
encode('text', { mode: 'kanji' });

void [usedMode, forced, auto, modes, alphabet, digitsLimit, detected, dark, side, version, level, bytes, svg, minimal, transparent, limit, corner, levels, scale, pixels, registered, cls, svgOnly];
