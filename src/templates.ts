import { BuildManifest, CreativeFileSet, CreativeTemplateInput } from './types';

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}

export function buildIndexHtml(input: CreativeTemplateInput): string {
  const adSizeMeta = `width=${input.dimensions.width},height=${input.dimensions.height}`;
  const videoMarkup = input.hasVideo
    ? [
        '<video id="video" muted playsinline autoplay loop preload="auto" aria-hidden="true">',
        `  <source src="${escapeHtmlAttr(input.video?.mp4Url ?? '')}" type="video/mp4">`,
        `  <source src="${escapeHtmlAttr(input.video?.webmUrl ?? '')}" type="video/webm">`,
        '</video>',
        '<img id="video-fallback" src="backup.jpg" alt="" aria-hidden="true" hidden>',
      ].join('\n')
    : '';

  const subheadMarkup = input.hasSubhead
    ? '<img id="text-subhead" src="assets/text-subhead.svg" alt="" aria-hidden="true">'
    : '';

  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '  <meta charset="utf-8">',
    `  <meta name="ad.size" content="${adSizeMeta}">`,
    '  <meta name="viewport" content="width=device-width, initial-scale=1">',
    '  <title>HTML Banner Export</title>',
    '  <link rel="stylesheet" href="styles.css">',
    '</head>',
    '<body>',
    '  <div id="creative">',
    '    <img id="bg" src="assets/bg.webp" alt="" aria-hidden="true">',
    `    ${videoMarkup}`,
    '    <img id="logo" src="assets/logo.webp" alt="" aria-hidden="true">',
    '    <img id="text-headline" src="assets/text-headline.svg" alt="" aria-hidden="true">',
    `    ${subheadMarkup}`,
    '    <img id="text-compliance" src="assets/text-compliance.svg" alt="" aria-hidden="true">',
    '    <img id="cta" src="assets/cta.webp" alt="" aria-hidden="true">',
    '    <button id="click_area" type="button" aria-label="Open advertiser website"></button>',
    '  </div>',
    '  <script src="main.js"></script>',
    '</body>',
    '</html>',
    '',
  ]
    .filter((line) => line.trim() !== '')
    .join('\n');
}

export function buildStylesCss(input: CreativeTemplateInput): string {
  const { dimensions, layout, hasVideo, hasSubhead } = input;

  const lines = [
    'html, body {',
    '  margin: 0;',
    '  padding: 0;',
    '  width: 100%;',
    '  height: 100%;',
    '  overflow: hidden;',
    '  background: transparent;',
    '}',
    '#creative {',
    `  width: ${px(dimensions.width)};`,
    `  height: ${px(dimensions.height)};`,
    '  position: relative;',
    '  overflow: hidden;',
    '  box-sizing: border-box;',
    '  background: #000;',
    '}',
    '#creative img, #creative video, #creative button {',
    '  position: absolute;',
    '  display: block;',
    '}',
    '#bg {',
    `  left: ${px(layout.bg.x)};`,
    `  top: ${px(layout.bg.y)};`,
    `  width: ${px(layout.bg.width)};`,
    `  height: ${px(layout.bg.height)};`,
    '}',
    '#logo {',
    `  left: ${px(layout.logo.x)};`,
    `  top: ${px(layout.logo.y)};`,
    `  width: ${px(layout.logo.width)};`,
    `  height: ${px(layout.logo.height)};`,
    '  object-fit: contain;',
    '}',
    '#text-headline {',
    `  left: ${px(layout.text.headline.x)};`,
    `  top: ${px(layout.text.headline.y)};`,
    `  width: ${px(layout.text.headline.width)};`,
    `  height: ${px(layout.text.headline.height)};`,
    '}',
    '#text-compliance {',
    `  left: ${px(layout.text.compliance.x)};`,
    `  top: ${px(layout.text.compliance.y)};`,
    `  width: ${px(layout.text.compliance.width)};`,
    `  height: ${px(layout.text.compliance.height)};`,
    '}',
    '#cta {',
    `  left: ${px(layout.text.cta.x)};`,
    `  top: ${px(layout.text.cta.y)};`,
    `  width: ${px(layout.text.cta.width)};`,
    `  height: ${px(layout.text.cta.height)};`,
    '  object-fit: contain;',
    '}',
  ];

  if (hasSubhead && layout.text.subhead) {
    lines.push(
      '#text-subhead {',
      `  left: ${px(layout.text.subhead.x)};`,
      `  top: ${px(layout.text.subhead.y)};`,
      `  width: ${px(layout.text.subhead.width)};`,
      `  height: ${px(layout.text.subhead.height)};`,
      '}',
    );
  }

  if (hasVideo && layout.videoSlot) {
    lines.push(
      '#video {',
      `  left: ${px(layout.videoSlot.x)};`,
      `  top: ${px(layout.videoSlot.y)};`,
      `  width: ${px(layout.videoSlot.width)};`,
      `  height: ${px(layout.videoSlot.height)};`,
      '  object-fit: cover;',
      '}',
      '#video-fallback {',
      `  left: ${px(layout.videoSlot.x)};`,
      `  top: ${px(layout.videoSlot.y)};`,
      `  width: ${px(layout.videoSlot.width)};`,
      `  height: ${px(layout.videoSlot.height)};`,
      '  object-fit: cover;',
      '}',
    );
  }

  lines.push(
    '#click_area {',
    `  left: ${px(layout.clickArea.x)};`,
    `  top: ${px(layout.clickArea.y)};`,
    `  width: ${px(layout.clickArea.width)};`,
    `  height: ${px(layout.clickArea.height)};`,
    '  border: 0;',
    '  margin: 0;',
    '  padding: 0;',
    '  background: transparent;',
    '  cursor: pointer;',
    '}',
  );

  return `${lines.join('\n')}\n`;
}

export function buildMainJs(): string {
  return [
    '(function () {',
    '  var placeholderClickTag = "[https://ClickThroughDestination]";',
    '',
    '  function resolveClickTag() {',
    '    try {',
      '      var queryValue = new URLSearchParams(window.location.search).get("clickTag");',
    '      if (queryValue) return queryValue;',
    '    } catch (_) {}',
    '',
    '    var globalValue = window.clickTag;',
    '    if (typeof globalValue === "string" && globalValue.trim().length > 0) {',
    '      return globalValue.trim();',
    '    }',
    '',
    '    return placeholderClickTag;',
    '  }',
    '',
    '  var clickArea = document.getElementById("click_area");',
    '  if (clickArea) {',
    '    clickArea.addEventListener("click", function (event) {',
    '      event.preventDefault();',
    '      var url = resolveClickTag();',
    '      if (!url || url === placeholderClickTag) return;',
    '      window.open(url, "_blank");',
    '    });',
    '  }',
    '',
    '  var video = document.getElementById("video");',
    '  var videoFallback = document.getElementById("video-fallback");',
    '  if (video && videoFallback) {',
    '    var fallback = function () {',
    '      video.hidden = true;',
    '      videoFallback.hidden = false;',
    '    };',
    '',
    '    video.addEventListener("error", fallback);',
    '    video.addEventListener("stalled", fallback);',
    '    video.addEventListener("abort", fallback);',
    '  }',
    '})();',
    '',
  ].join('\n');
}

export function buildManifestJson(input: CreativeTemplateInput): string {
  const manifest: BuildManifest = {
    version: '1.0',
    size: input.size,
    dimensions: input.dimensions,
    hasVideo: input.hasVideo,
    clickTagMode: 'single',
    backupImage: 'backup.jpg',
    maxBytesExcludingVideo: 1_572_864,
  };

  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export function buildCreativeFiles(input: CreativeTemplateInput): CreativeFileSet {
  return {
    indexHtml: buildIndexHtml(input),
    stylesCss: buildStylesCss(input),
    mainJs: buildMainJs(),
    manifestJson: buildManifestJson(input),
  };
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
