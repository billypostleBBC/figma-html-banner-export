# HTML Banner Export (Figma Plugin)

Figma plugin for exporting selected design frames into GAM-ready HTML5 creative ZIP files.

## MVP Scope
- Selected frames only.
- Supported sizes only: `970x250`, `1024x400`, `300x600`, `300x250`, `728x90`, `320x50`, `300x50`.
- One creative ZIP per size.
- Multi-size exports download as one bundle ZIP containing each size ZIP.
- No campaign slug or fallback URL input in plugin UI.
- Single `clickTag` exit implementation.
- Optional CDN video (`mp4`) per size.
- Hard budget: `1.5MB` per creative excluding video files.
- Backup image included as `backup.jpg`.
- Text exported as SVG artwork (no web fonts, no editable runtime copy).

## Setup
1. Install dependencies:
- `npm install`
2. Build plugin:
- `npm run build`
3. In Figma Desktop:
- `Plugins -> Development -> Import plugin from manifest...`
- select `manifest.json`

## Required Layer Naming Contract
Each selected frame must include exact layer names:

Required:
- `background-image` (image/shape background)
- `Heading` (text)
- `Branding` (image)
- `compliance` (text)
- `cta` (exportable CTA artwork with at least one visible non-text fill behind the label)
- `click_area` (hit area rectangle)

CTA naming note:
- Canonical layer name is `cta`.
- Plugin also accepts `CTA` for component-instance based CTA layers.

Optional:
- `Subheading` (text)
- `Image/Video` (sized scene node used as video slot only when MP4 is configured)

Video behavior:
- If an MP4 URL is supplied for a size, `Image/Video` is used as the video slot geometry.
- Runtime video uses `object-fit: cover`, `autoplay`, `muted` by default, and `loop = false`.
- Runtime control buttons are rendered above `click_area` (play/pause/replay bottom-left, mute/unmute bottom-right).

If required layers are missing, mistyped, or wrong type, export fails with an actionable error.

## Output ZIP Contract
Each creative ZIP is named:
- `creative_{size}.zip`

Download behavior:
- If one creative is exported, that creative ZIP is downloaded directly.
- If multiple creatives are exported, one `creative_bundle.zip` is downloaded containing all `creative_{size}.zip` files.

Each creative ZIP contains:
- `index.html`
- `main.js`
- `videoTracking.js` (video creatives only)
- `styles.css`
- `backup.jpg`
- `manifest.json`
- `assets/bg.webp`
- `assets/logo.webp`
- `assets/cta.webp`
- `assets/text-headline.svg`
- `assets/text-compliance.svg`
- optional: `assets/text-subhead.svg`

## ClickTag Behavior
Runtime click URL priority:
1. `clickTag` query param
2. `window.clickTag`
3. `[https://ClickThroughDestination]` placeholder token

If neither `clickTag` source is present, click is a no-op (the placeholder is not opened).

## Compression Policy
- First pass: WebP quality `0.76` for raster assets.
- Raster layers are exported from Figma at `@2x` before compression for higher visual fidelity.
- If over budget: each pass scales rasters to `90%` and reduces quality by `0.06`.
- Quality floor: `0.52`.
- Backup image is always exported at `@1x` dimensions and encoded as JPEG at quality `0.62`.
- If still over 1.5MB at floor, that creative fails export.

## Typography Policy
- No font files are exported.
- No `@font-face` or live HTML text rendering in output.
- Text layers are exported as SVG vectors.

## Tests
Run unit tests:
- `npm test`

Run type check:
- `npx tsc --noEmit`

## V2+ Awareness (Not Implemented)
- Internal hosted link flow replacing ZIP handoff.
- Interscroller with host-page integration.
- Figma prototype interaction mapping.
- Custom code embeds.
- Independent custom metrics separate from GAM.
