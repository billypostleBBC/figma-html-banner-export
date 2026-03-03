# Figma Naming Schema for HTML Banner Export

This is the exact naming contract the plugin uses when extracting layers from selected frames.

## What the plugin enforces

- Node type in selection: `FRAME` only.
- Supported frame sizes only:
  - `970x250`
  - `1024x400`
  - `300x600`
- One selected frame per supported size (no duplicates in the same export run).
- Layer name matching is exact and case-sensitive.
- The plugin searches by name anywhere inside the frame (`findOne`), not by hierarchy path.

## Required layer names (exact)

| Layer name | Required type | Purpose |
| --- | --- | --- |
| `background-image` | Exportable scene node | Background image/shape |
| `Branding` | Exportable scene node | Brand mark |
| `Heading` | Text node | Main copy (exported as SVG) |
| `compliance` | Text node | Legal/compliance copy (exported as SVG) |
| `cta` | Exportable scene node with visible non-text fill | CTA artwork (exported as raster) |
| `click_area` | Sized scene node | Click hit area geometry |

CTA naming compatibility:
- Canonical: `cta`
- Also accepted: `CTA` (for component-instance CTA patterns)

## Optional layer names (exact)

| Layer name | Type | Rule |
| --- | --- | --- |
| `Subheading` | Text node | Optional. Exported as `text-subhead.svg` when present |
| `video` | Any scene node | Optional hint only. If present without a video URL, export warns and outputs static (no video/tracking). |

## Video slot rule

- If a video URL is supplied for a size, the plugin uses `background-image` as the video slot geometry.
- No separate `video_slot` layer is used.
- No `poster` layer is used.
- Fallback static is always generated automatically from a JPG export of the parent frame (`backup.jpg`).

## Recommended frame naming (not enforced)

The plugin uses frame dimensions, not frame names, to detect size.  
For team clarity, use:

- `creative_970x250`
- `creative_1024x400`
- `creative_300x600`

Example:

- `creative_970x250`

## Recommended layer structure template

Use this as a copy pattern inside each size frame:

```text
creative_{size} (FRAME)
  background-image
  Branding
  Heading
  Subheading (optional)
  compliance
  cta
  click_area
```

## Rules to avoid export failures

- Do not rename required layers.
- Do not change text layers (`Heading`, `Subheading`, `compliance`) to non-text nodes.
- Keep only one layer for each required name per frame to avoid first-match ambiguity.
- Ensure `cta` includes a visible non-text fill behind the label so black CTA text remains legible.
- If you configure video for a size in the plugin UI, that frame must include `background-image`.
- Keep `click_area` as a real sized layer (not hidden metadata/group name only).

## Common failure causes

- Wrong case: `heading` instead of `Heading`.
- Typo: `clickarea` instead of `click_area`.
- Missing required layer.
- Selecting non-frame nodes with frames.
- Selecting two frames with the same supported size.
- Using unsupported frame dimensions.
