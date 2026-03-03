# Revised MVP Plan: Figma to GAM HTML Ad Exporter (BBC Internal)

## Summary
Build a TypeScript Figma plugin that exports selected frames into GAM-ready HTML5 ZIPs (one ZIP per size), with strict layer naming validation, single `clickTag` wiring, optional CDN video embeds (`mp4`), aggressive image compression, and a hard `1.5MB` per-creative cap excluding video files.

Key scope decision: all text is exported as SVG artwork, not live web text, so no font files are shipped and no runtime font dependency exists.

## Locked MVP Scope
- Export source: selected frames only.
- Supported sizes: `970x250`, `1024x400`, `300x600`.
- Output: one ZIP per size.
- Video: manual CDN upload outside plugin; plugin accepts URLs.
- Click behavior: single `clickTag` exit.
- Backup image: always included.
- Interscroller: out of MVP.
- Backend APIs: none in MVP.

## Design Contract (Strict Naming)
- Each selected frame must exactly match one supported dimension.
- Required layer names in each frame:
- `background-image` (image/shape background)
- `Heading` (text)
- `Branding` (image)
- `compliance` (text)
- `cta` (text)
- `click_area` (hit area rectangle)
- Optional layer names:
- `Subheading` (text)
- Video URLs use `background-image` geometry as the video slot (no separate `video_slot` layer)
- Export fails per frame with actionable errors when required layers are missing, mistyped, or wrong type.

## Typography Handling (No Font Export)
- No font files, `@font-face`, or live text rendering in output.
- All text layers (`Heading`, `compliance`, `cta`, optional `Subheading`) are converted to SVG vector artwork during export.
- Runtime renders text via SVG assets (`<img>`/inline SVG), not HTML text nodes.
- Tradeoff: adops cannot edit copy directly in GAM; copy changes require re-export from Figma.

## Public Interfaces / Types
```ts
export type SupportedSize = "970x250" | "1024x400" | "300x600";

export interface ExportInput {
  frames: FrameSelection[];
  videoBySize?: Record<SupportedSize, VideoSpec | null>;
}

export interface FrameSelection {
  nodeId: string;
  size: SupportedSize;
  frameName: string;
}

export interface VideoSpec {
  url: string;
  autoplayMutedLoop: boolean;
}

export interface TextSvgAssets {
  headline: string;
  compliance: string;
  cta: string;
  subhead?: string;
}

export interface CreativeBuildResult {
  size: SupportedSize;
  zipFileName: string;
  packagedBytes: number;
  passedBudget: boolean;
  warnings: string[];
}
```

## ZIP Output Contract (Per Size)
- ZIP name: `creative_{size}.zip`
- Required files:
- `index.html`
- `main.js`
- `styles.css`
- `backup.jpg`
- `manifest.json`
- `assets/bg.*`
- `assets/logo.*`
- `assets/text-headline.svg`
- `assets/text-compliance.svg`
- `assets/text-cta.svg`
- Optional files:
- `assets/text-subhead.svg`

## GAM Runtime Contract
- Single-click exit using resolved URL priority:
- query param `clickTag`
- global `window.clickTag`
- `[https://ClickThroughDestination]` placeholder token (non-opening fallback)
- `click_area` handles all click-through behavior.
- Video runtime:
- `<video muted playsinline autoplay loop>`
- `<source type="video/mp4">`
- fallback to `backup.jpg` on load failure
- No external JS libraries.

## Compression and Budget Policy
- Hard cap per creative: `1.5MB` excluding video files.
- Aggressive image compression before packaging.
- Iterative compression/downscale until under cap or floor reached.
- If still over cap, export fails with per-asset overage detail.
- SVG text assets are included in cap calculation.

## Implementation Plan
1. Scaffold plugin (`TypeScript`, `esbuild`, `@figma/plugin-typings`, `JSZip`).
2. Implement frame/layer validation against strict naming contract.
3. Implement asset extraction for background/logo/click area metadata (video uses background-image geometry).
4. Implement text-to-SVG conversion/export pipeline for all text layers.
5. Build runtime template with single `clickTag` behavior and optional video.
6. Add aggressive compression pipeline and hard budget enforcement.
7. Generate per-size ZIPs and manifest metadata.
8. Build plugin UI for optional per-size video URLs, selection summary, and export results.
9. Add README with naming contract and non-editable text tradeoff.
10. Add fixture-based tests and manual QA checklist.

## Test Cases
- Valid export for each size without video.
- Valid export for each size with `mp4`.
- Missing required layer names/types fails with clear fixes.
- Wrong dimensions fail immediately.
- `clickTag` resolution works in all three precedence cases.
- Budget enforcement:
- recoverable case passes after compression
- non-recoverable case fails with exact overages
- ZIP structure and file naming are deterministic.
- Verify no font assets and no runtime font declarations are present.
- Verify required text layers are emitted as SVG assets.

## V2+ Roadmap Awareness (No Build Commitments Yet)
- Internal hosted creative links to replace ZIP handoff.
- True interscroller with host-page integration.
- Figma prototype interaction mapping.
- Custom code embed support.
- Independent custom metric tracking (separate from GAM).

## Assumptions and Defaults
- Plugin is distributed in BBC Figma Enterprise.
- CDN media URLs are HTTPS and playable in target browsers.
- Copy edits after export are out of scope (re-export required).
