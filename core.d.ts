export type EccLevel = 'L' | 'M' | 'Q' | 'H';
export type ModuleShape = 'dots' | 'squares';
export type EncodingMode = 'numeric' | 'alphanumeric' | 'byte';

export interface EncodeOptions {
    /** Error correction level. Defaults to 'M'. */
    ecc?: EccLevel;
    /**
     * Encoding mode. 'auto' (the default) picks the tightest mode the payload
     * allows: numeric for digits, alphanumeric for the uppercase/symbol
     * subset, byte for everything else.
     */
    mode?: 'auto' | EncodingMode;
    /** Force at least this QR version (1-40). Defaults to 1. */
    minVersion?: number;
}

export interface RenderOptions extends EncodeOptions {
    /** Quiet zone in modules. Defaults to 4, as the specification requires. */
    margin?: number;
    /** Background fill. Use 'transparent' or false to leave it unpainted. Defaults to '#ffffff'. */
    background?: string | false;
    /** Colour of the data modules. Defaults to '#000000'. */
    dotColor?: string;
    /** Colour of the three finder patterns. Defaults to `dotColor`. */
    cornerColor?: string;
    /** Data module shape. Defaults to 'dots'. */
    shape?: ModuleShape;
    /** Width/height in px. */
    size?: number;
    /** Accessible name. Defaults to a label derived from the payload. */
    label?: string;
}

export interface SvgOptions extends RenderOptions {
    /** Text for an SVG <title> element. */
    title?: string;
}

export interface CanvasOptions extends RenderOptions {
    /** Override the detected device pixel ratio. */
    devicePixelRatio?: number;
}

export interface EncodeResult {
    /** Row-major `size * size` matrix; 1 is a dark module. */
    modules: Uint8Array;
    /** Matrix width, excluding any quiet zone. */
    size: number;
    /** QR version used, 1-40. */
    version: number;
    /** Error correction level used. */
    ecc: EccLevel;
    /** Encoding mode used. */
    mode: EncodingMode;
}

export interface CanvasResult {
    size: number;
    version: number;
    ecc: EccLevel;
    /** Device pixels per module. */
    scale: number;
    /** Backing store width/height in device pixels. */
    pixels: number;
}

export declare const ECC_LEVELS: readonly EccLevel[];
export declare const MODES: readonly EncodingMode[];
/** The 45 characters alphanumeric mode can represent, in their code order. */
export declare const ALPHANUMERIC_CHARS: string;
export declare const SHAPES: readonly ModuleShape[];
export declare const DEFAULTS: Required<Pick<RenderOptions, 'ecc' | 'minVersion' | 'margin' | 'background' | 'dotColor' | 'shape'>> & { cornerColor: string | null };

/**
 * Encode text or bytes as a QR matrix. Strings are encoded as UTF-8.
 *
 * @throws {TypeError} when the input is not a string or Uint8Array.
 * @throws {RangeError} when the input exceeds the capacity of a version 40 code.
 */
export declare function encode(input: string | Uint8Array, options?: EncodeOptions): EncodeResult;

/** Maximum encodable byte length at a given error correction level. */
export declare function maxBytes(ecc?: EccLevel): number;

/**
 * Maximum payload length at a given error correction level and mode.
 * Characters for numeric/alphanumeric, bytes for byte mode.
 */
export declare function maxLength(ecc?: EccLevel, mode?: EncodingMode): number;

/** The tightest mode that can represent `text`. */
export declare function detectMode(text: string): EncodingMode;

/** True when (x, y) falls inside one of the three finder patterns. */
export declare function isFinder(x: number, y: number, size: number): boolean;

/** Render a QR code as a standalone SVG string. Runs anywhere, no DOM needed. */
export declare function toSVG(input: string | Uint8Array, options?: SvgOptions): string;

/** Draw a QR code into an existing canvas at whole-device-pixel module size. */
export declare function toCanvas(
    canvas: HTMLCanvasElement,
    input: string | Uint8Array,
    options?: CanvasOptions,
): CanvasResult;
