# Manual QA Checklist

## Preconditions
- Plugin built with `npm run build`.
- Imported `manifest.json` into Figma development plugins.
- Test frames prepared with required naming contract.

## Selection + Validation
- Select one valid frame and open plugin.
- Confirm selection panel shows detected supported size.
- Add a non-frame node to selection and verify blocking validation.
- Select frame with unsupported dimensions and verify blocking validation.
- Select two frames with same supported size and verify duplicate-size error.

## Layer Contract
- Remove each required layer (`background-image`, `Heading`, `Branding`, `compliance`, `cta`, `click_area`) one at a time and verify export fails with clear message.
- Rename `Heading` to wrong case and verify failure.
- Convert required text layers (`Heading`, `compliance`) to non-text and verify failure.
- Remove/disable CTA background fill and verify export fails with an instruction to add a visible non-text fill.

## Video Handling
- Run export with no video URLs and verify success.
- Select only one supported size and verify only that size's MP4 URL field is shown.
- Provide MP4 for a size without `Image/Video` and verify failure.
- Provide MP4 with `Image/Video` present and verify exported HTML includes one MP4 `<source>` tag.
- Verify runtime starts muted/autoplay, does not loop, and playback button cycles pause/play/replay.
- Verify mute/unmute button toggles audio state.
- Verify both control buttons are clickable without triggering click-through.

## Typography / Fonts
- Verify ZIP contains SVG text files (`text-headline.svg`, `text-compliance.svg`).
- Verify CTA artwork exports as `assets/cta.webp`.
- Verify generated files include no `@font-face` and no runtime `font-family` declarations.

## clickTag Runtime
- Open exported `index.html` with query `?clickTag=https://a.example` and verify click opens that URL.
- Remove query and inject `window.clickTag = 'https://b.example'` before click, verify it is used.
- Remove both and verify click is a no-op (placeholder fallback is not opened).

## ZIP Structure
- Verify ZIP name format `creative_{size}.zip`.
- Export multiple sizes and verify `creative_bundle.zip` contains one `creative_{size}.zip` per successful size.
- Verify required files exist in each ZIP.
- Verify optional `text-subhead.svg` appears only when `Subheading` exists.

## Budget Enforcement
- Use oversized source imagery to trigger compression warnings.
- Confirm export still succeeds when under budget after compression passes.
- Confirm export fails when still over 1.5MB at quality floor and reports largest files.
