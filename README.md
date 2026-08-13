# QRify

A small, dependency-free QR code generator for the web.

- **Encodes UTF-8 properly** — accents, emoji and CJK all round-trip through real readers.
- **Renders without a DOM** — `toSVG()` runs during a static build, so you can ship a QR code with zero client-side JavaScript.
- **Ships a `<qr-code>` element** for the cases that genuinely need runtime generation.
- **Verified against a decoder** — the test suite decodes what it generates with ZXing, across all 40 versions and all four error correction levels.

```bash
npm install @kiliannnnn/qrify
```

## Build-time rendering (recommended)

`@kiliannnnn/qrify/core` has no side effects and never touches the DOM, so it works in Astro frontmatter, a Node script, or an edge function. The page gets a plain inline `<svg>` and no JavaScript at all.

```astro
---
import { toSVG } from '@kiliannnnn/qrify/core';

const svg = toSVG(Astro.url.href, { ecc: 'Q', size: 180 });
---
<Fragment set:html={svg} />
```

## The custom element

```js
import '@kiliannnnn/qrify';
```

```html
<qr-code string="https://example.com/some-page"></qr-code>
```

In Astro, put the import in a `<script>` tag so it runs on the client:

```astro
<script>
  import '@kiliannnnn/qrify';
</script>

<qr-code string="https://example.com" dot-color="#999" corner-color="#333"></qr-code>
```

### Attributes

| Attribute | Default | Description |
| --- | --- | --- |
| `string` | *required* | The text to encode. Rendering is skipped when it is missing or empty. |
| `ecc` | `M` | Error correction level: `L`, `M`, `Q` or `H`. Higher survives more damage but needs a bigger code. |
| `dot-color` | `#000000` | Colour of the data modules. Any CSS colour. |
| `corner-color` | `#000000` | Colour of the three finder patterns. |
| `bg` | `#ffffff` | Background fill. Use `transparent` to leave it unpainted. |
| `margin` | `4` | Quiet zone in modules. The specification requires 4; lowering it makes scanning less reliable. |
| `shape` | `dots` | `dots` or `squares`. Finder patterns are always solid squares. |
| `size` | — | Width/height in px. Omit to let the code scale to its container. |
| `renderer` | `svg` | `svg` or `canvas`. |
| `label` | derived from `string` | Accessible name for screen readers. |
| `canvas-class` | — | Class applied to the generated `<svg>`/`<canvas>`. |
| `canvas-style` | — | Inline style applied to the generated `<svg>`/`<canvas>`. |

Attributes are live: change any of them and the code re-renders on the next microtask.

### Properties, methods and events

```js
const el = document.querySelector('qr-code');

el.value = 'https://example.com';   // mirrors the `string` attribute
const svg = el.toSVG();             // serialise the current code

el.addEventListener('qrify:render', () => { /* painted */ });
el.addEventListener('qrify:error', (e) => console.warn(e.detail.error));
```

Encoding failures — a payload past capacity, an invalid option — dispatch `qrify:error` and clear the element instead of throwing into the page.

### Styling

The element is `display: block` via a stylesheet (not inline styles), so ordinary CSS wins:

```css
qr-code {
  width: 180px;
}
qr-code > svg {
  border-radius: 0.5rem;
}
```

### A different tag name

`qr-code` is a common name. If it collides, register your own:

```js
import { defineQrify } from '@kiliannnnn/qrify';
defineQrify('kilian-qr');
```

## JavaScript API

```js
import { encode, toSVG, toCanvas, maxBytes } from '@kiliannnnn/qrify/core';

toSVG('https://example.com', { ecc: 'H', shape: 'squares' });   // → '<svg …>'

toCanvas(document.querySelector('canvas'), 'https://example.com', { size: 256 });

const { modules, size, version, ecc } = encode('https://example.com');
// modules is a row-major size × size Uint8Array; 1 is a dark module

maxBytes('H');   // → 1273
```

### Options

Both renderers take `ecc`, `margin`, `background`, `dotColor`, `cornerColor`, `shape`, `size`, `label` and `minVersion`. `toSVG` also takes `title`; `toCanvas` also takes `devicePixelRatio`.

`encode()` throws a `RangeError` when the payload exceeds what a version 40 code can hold, and a `TypeError` for input that is not a string or `Uint8Array`. It never truncates silently.

TypeScript declarations are included.

## Getting codes that actually scan

- **Keep the quiet zone.** `margin="0"` looks tidier and scans worse.
- **Keep the background opaque.** A transparent code on a dark page is unreadable to most readers. If you want light-on-dark, set both `bg` and `dot-color` explicitly rather than relying on the page behind it.
- **Raise `ecc` when you decorate.** The `dots` shape removes roughly a fifth of each module's area. `Q` or `H` gives a reader more to work with.
- **Give it room.** Below about 2px per module, cameras struggle regardless of what the encoder did.

## Migrating from 1.x

1.x is still on npm, but it had a few problems worth knowing about:

- Importing the package on a server threw `ReferenceError: HTMLElement is not defined`.
- Non-ASCII payloads were silently corrupted (`café` scanned back as an empty string).
- Payloads over 2953 bytes were silently truncated to a code that scanned as the wrong data.
- `observedAttributes` was declared but nothing re-rendered when attributes changed.
- The `canvasClass` / `canvasStyle` attributes in the README never worked, because HTML lowercases attribute names.

What changed in 2.0:

| 1.x | 2.0 |
| --- | --- |
| Renders a `<canvas>` | Renders an `<svg>`; pass `renderer="canvas"` for the old output |
| Error correction fixed at `L` | Defaults to `M`, configurable with `ecc` |
| No quiet zone | 4-module quiet zone, configurable with `margin` |
| Transparent background | White background, configurable with `bg` |
| Sized from the parent box at connect time | Sized by CSS, or by the `size` attribute |
| `import '@kiliannnnn/qrify'` only | Plus `@kiliannnnn/qrify/core` for DOM-free rendering |

`<qr-code string="…" dot-color="…" corner-color="…" canvas-class="…" canvas-style="…">` keeps working, and the camelCase spellings from the old README are accepted as aliases.

## Development

```bash
npm install
npm test          # round-trip and rendering tests
npm run typecheck # validates the published .d.ts files
npm run check     # both
```

## Credits

The encoder core descends from the QR encoder written by tz for the Arduino, carried over from 1.x and refactored here. Everything above it — UTF-8 handling, error correction selection, the renderers and the element — is this package.

## Issues

[github.com/kiliannnnn/qrify](https://github.com/kiliannnnn/qrify)
