# Changelog

## 2.0.0

### Fixed

- **Importing the package on a server crashed.** `class QRCode extends HTMLElement` was evaluated at module scope, so the `typeof window` guard around `customElements.define` never had a chance and any SSR pass threw `ReferenceError: HTMLElement is not defined`. The element class is now built lazily.
- **Non-ASCII payloads produced corrupt codes.** The encoder used `charCodeAt()`, which truncates anything above U+00FF. `café` scanned back as an empty string and `👋` as garbage. Payloads are now encoded as UTF-8.
- **Payloads past capacity were silently truncated.** 5000 characters produced a code that scanned as the first 2953 — a QR that reads as the wrong data. `encode()` now throws a `RangeError`.
- **Attribute changes did nothing.** `observedAttributes` was declared without an `attributeChangedCallback`. Attributes are now live, batched into a single render per microtask.
- **`canvasClass` / `canvasStyle` never worked.** The README documented camelCase names, the code read `canvas-class` / `canvas-style`, and HTML lowercases attribute names, so neither spelling reached the renderer. Both now work.
- **Canvases accumulated.** Reconnecting or moving the element appended another canvas each time.
- **Zero-sized output.** Size was read from `clientWidth`/`clientHeight` during `connectedCallback`, which yields a 0×0 canvas when layout has not run. The SVG renderer scales via its viewBox; the canvas renderer falls back to layout width and watches for resizes.
- **A missing `string` attribute threw** a `TypeError` before the element's own error handling ran.
- **Blurry, seamed modules.** Module size was fractional and the canvas ignored `devicePixelRatio`. Modules now land on whole device pixels.

### Added

- `@kiliannnnn/qrify/core` — a side-effect-free entry point with no DOM access, for static builds and SSR.
- `toSVG()`, `toCanvas()`, `encode()` and `maxBytes()` as a public API.
- `ecc`, `margin`, `bg`, `size`, `shape`, `renderer` and `label` attributes.
- A four-module quiet zone, as the specification requires.
- `role="img"` and an accessible name on the generated output.
- `qrify:render` and `qrify:error` events; encoding failures no longer throw into the page.
- `value` property and `toSVG()` method on the element.
- `defineQrify(name)` for registering under a different tag name.
- TypeScript declarations.
- A test suite that decodes what it generates with ZXing, covering all 40 versions, all four ECC levels, and the rendered SVG output.

### Changed

- **The element renders SVG by default.** Pass `renderer="canvas"` for the previous output.
- **Error correction defaults to `M`** instead of being hardcoded to `L`, the lowest level.
- **The background defaults to white** instead of transparent. Set `bg="transparent"` for the old behaviour.
- Layout styles come from an injected stylesheet rather than inline styles on the host, so page CSS can override them.
- Lookup tables are allocated once per process instead of once per generated code.

## 1.1.0

- Module compatibility fixes.

## 1.0.1

- Initial published versions.
