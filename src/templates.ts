import { BuildManifest, CreativeFileSet, CreativeTemplateInput } from './types';
import {
  buildVideoTrackingConfigAssignment,
  buildVideoTrackingJs,
  createDefaultVideoTrackingConfig,
} from './videoTracking';

function px(value: number): string {
  return `${Math.round(value * 100) / 100}px`;
}

export function buildIndexHtml(input: CreativeTemplateInput): string {
  const adSizeMeta = `width=${input.dimensions.width},height=${input.dimensions.height}`;
  const trackingConfig = createDefaultVideoTrackingConfig(`creative_${input.size}`);
  const trackingConfigScript = buildVideoTrackingConfigAssignment(trackingConfig);

  const fallbackMarkup = input.hasVideo
    ? '<img id="video-fallback" src="backup.jpg" alt="" aria-hidden="true" hidden>'
    : '';

  const videoMarkup = input.hasVideo
    ? [
        '<video id="video" muted playsinline autoplay preload="auto" aria-hidden="true">',
        `  <source src="${escapeHtmlAttr(input.video?.mp4Url ?? '')}" type="video/mp4">`,
        '</video>',
        '<div id="video-controls" aria-hidden="true">',
        '  <button id="video-playback-toggle" class="video-control" type="button" aria-label="Pause video"></button>',
        '  <button id="video-audio-toggle" class="video-control" type="button" aria-label="Unmute video"></button>',
        '</div>',
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
    `  ${fallbackMarkup}`,
    '  <div id="creative">',
    '    <img id="bg" src="assets/bg.webp" alt="" aria-hidden="true">',
    `    ${videoMarkup}`,
    `    ${videoControlsMarkup}`,
    '    <img id="logo" src="assets/logo.webp" alt="" aria-hidden="true">',
    '    <img id="text-headline" src="assets/text-headline.svg" alt="" aria-hidden="true">',
    `    ${subheadMarkup}`,
    '    <img id="text-compliance" src="assets/text-compliance.svg" alt="" aria-hidden="true">',
    '    <img id="cta" src="assets/cta.webp" alt="" aria-hidden="true">',
    '    <button id="click_area" type="button" aria-label="Open advertiser website"></button>',
    '  </div>',
    ...(input.hasVideo
      ? [
          '  <script>',
          `    ${trackingConfigScript}`,
          '  </script>',
          '  <script src="videoTracking.js"></script>',
        ]
      : []),
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
    '  position: relative;',
    '}',
    '#creative {',
    `  width: ${px(dimensions.width)};`,
    `  height: ${px(dimensions.height)};`,
    '  position: relative;',
    '  z-index: 1;',
    '  overflow: hidden;',
    '  box-sizing: border-box;',
    '  background: #000;',
    '}',
    '#creative img, #creative video, #creative button {',
    '  position: absolute;',
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
    const controlInset = 16;
    const controlSize = 38;
    const controlsWidth = Math.max(controlSize * 2 + 12, layout.videoSlot.width - controlInset * 2);
    const controlsHeight = controlSize;
    const controlsLeft = layout.videoSlot.x + Math.max(0, (layout.videoSlot.width - controlsWidth) / 2);
    const controlsTop = Math.max(
      layout.videoSlot.y + 8,
      layout.videoSlot.y + layout.videoSlot.height - controlsHeight - controlInset,
    );

    lines.push(
      '#video {',
      `  left: ${px(layout.videoSlot.x)};`,
      `  top: ${px(layout.videoSlot.y)};`,
      `  width: ${px(layout.videoSlot.width)};`,
      `  height: ${px(layout.videoSlot.height)};`,
      '  object-fit: cover;',
      '  pointer-events: none;',
      '}',
      '#video-controls {',
      `  left: ${px(layout.videoSlot.x)};`,
      `  top: ${px(layout.videoSlot.y)};`,
      `  width: ${px(layout.videoSlot.width)};`,
      `  height: ${px(layout.videoSlot.height)};`,
      '  position: absolute;',
      '  pointer-events: none;',
      '  z-index: 20;',
      '}',
      '.video-control {',
      '  border: 0;',
      '  margin: 0;',
      '  padding: 10px;',
      '  background: transparent;',
      '  cursor: pointer;',
      '  pointer-events: auto;',
      '  display: flex;',
      '  align-items: center;',
      '  justify-content: center;',
      '  line-height: 0;',
      '}',
      '.video-control svg {',
      '  display: block;',
      '}',
      '#video-playback-toggle {',
      '  left: 0;',
      '  bottom: 0;',
      '}',
      '#video-audio-toggle {',
      '  right: 0;',
      '  bottom: 0;',
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
    '  z-index: 10;',
    '}',
  );

  return `${lines.join('\n')}\n`;
}

export function buildMainJs(): string {
  return [
    '(function () {',
    '  var placeholderClickTag = "[https://ClickThroughDestination]";',
    '  var ICONS = {',
    '    play: \'<svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="38" height="38" rx="19" fill="white"/><path d="M26.3406 18.0501L16.21 11.8527C16.0392 11.7481 15.8436 11.691 15.6433 11.6873C15.4431 11.6836 15.2455 11.7334 15.0709 11.8316C14.898 11.9283 14.754 12.0693 14.6537 12.2401C14.5533 12.4108 14.5003 12.6053 14.5 12.8033V25.1966C14.5013 25.4938 14.6205 25.7782 14.8315 25.9874C15.0425 26.1967 15.3279 26.3136 15.625 26.3125C15.8324 26.3124 16.0358 26.2552 16.2128 26.1472L26.3406 19.9499C26.5034 19.8507 26.638 19.7113 26.7313 19.545C26.8247 19.3788 26.8737 19.1913 26.8737 19.0007C26.8737 18.81 26.8247 18.6226 26.7313 18.4564C26.638 18.2901 26.5034 18.1507 26.3406 18.0515V18.0501ZM15.625 25.1833V12.8125L25.738 19L15.625 25.1833Z" fill="#343330"/></svg>\',',
    '    pause: \'<svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="38" height="38" rx="19" fill="white"/><path d="M24.0625 12.25H21.25C20.9516 12.25 20.6655 12.3685 20.4545 12.5795C20.2435 12.7905 20.125 13.0766 20.125 13.375V24.625C20.125 24.9234 20.2435 25.2095 20.4545 25.4205C20.6655 25.6315 20.9516 25.75 21.25 25.75H24.0625C24.3609 25.75 24.647 25.6315 24.858 25.4205C25.069 25.2095 25.1875 24.9234 25.1875 24.625V13.375C25.1875 13.0766 25.069 12.7905 24.858 12.5795C24.647 12.3685 24.3609 12.25 24.0625 12.25ZM24.0625 24.625H21.25V13.375H24.0625V24.625ZM16.75 12.25H13.9375C13.6391 12.25 13.353 12.3685 13.142 12.5795C12.931 12.7905 12.8125 13.0766 12.8125 13.375V24.625C12.8125 24.9234 12.931 25.2095 13.142 25.4205C13.353 25.6315 13.6391 25.75 13.9375 25.75H16.75C17.0484 25.75 17.3345 25.6315 17.5455 25.4205C17.7565 25.2095 17.875 24.9234 17.875 24.625V13.375C17.875 13.0766 17.7565 12.7905 17.5455 12.5795C17.3345 12.3685 17.0484 12.25 16.75 12.25ZM16.75 24.625H13.9375V13.375H16.75V24.625Z" fill="#343330"/></svg>\',',
    '    replay: \'<svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="38" height="38" rx="19" fill="white"/><path d="M26.3406 18.0501L16.21 11.8527C16.0392 11.7481 15.8436 11.691 15.6433 11.6873C15.4431 11.6836 15.2455 11.7334 15.0709 11.8316C14.898 11.9283 14.754 12.0693 14.6537 12.2401C14.5533 12.4108 14.5003 12.6053 14.5 12.8033V25.1966C14.5013 25.4938 14.6205 25.7782 14.8315 25.9874C15.0425 26.1967 15.3279 26.3136 15.625 26.3125C15.8324 26.3124 16.0358 26.2552 16.2128 26.1472L26.3406 19.9499C26.5034 19.8507 26.638 19.7113 26.7313 19.545C26.8247 19.3788 26.8737 19.1913 26.8737 19.0007C26.8737 18.81 26.8247 18.6226 26.7313 18.4564C26.638 18.2901 26.5034 18.1507 26.3406 18.0515V18.0501ZM15.625 25.1833V12.8125L25.738 19L15.625 25.1833Z" fill="#343330"/></svg>\',',
    '    mute: \'<svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="38" height="38" rx="19" fill="white"/><path d="M20.9343 11.7445C20.8397 11.6984 20.7341 11.6797 20.6294 11.6907C20.5248 11.7016 20.4253 11.7417 20.3423 11.8063L15.4316 15.625H12.25C11.9516 15.625 11.6655 15.7435 11.4545 15.9545C11.2435 16.1655 11.125 16.4516 11.125 16.75V21.25C11.125 21.5484 11.2435 21.8345 11.4545 22.0455C11.6655 22.2565 11.9516 22.375 12.25 22.375H15.4316L20.3423 26.1937C20.4254 26.2583 20.5249 26.2983 20.6296 26.3091C20.7343 26.3199 20.8399 26.3012 20.9345 26.255C21.0291 26.2087 21.1088 26.1369 21.1645 26.0476C21.2203 25.9584 21.2499 25.8553 21.25 25.75V12.25C21.25 12.1446 21.2204 12.0414 21.1646 11.952C21.1088 11.8626 21.029 11.7907 20.9343 11.7445ZM12.25 16.75H15.0625V21.25H12.25V16.75ZM20.125 24.5997L16.1875 21.5376V16.4624L20.125 13.4003V24.5997ZM23.9219 17.1409C24.3743 17.6546 24.6239 18.3155 24.6239 19C24.6239 19.6845 24.3743 20.3455 23.9219 20.8591C23.8225 20.9683 23.6842 21.034 23.5367 21.0421C23.3893 21.0502 23.2446 21 23.1339 20.9024C23.0231 20.8048 22.9552 20.6675 22.9448 20.5202C22.9343 20.3729 22.9822 20.2274 23.0781 20.1152C23.3494 19.807 23.4991 19.4106 23.4991 19C23.4991 18.5895 23.3494 18.193 23.0781 17.8849C22.9822 17.7726 22.9343 17.6271 22.9448 17.4798C22.9552 17.3325 23.0231 17.1953 23.1339 17.0976C23.2446 17 23.3893 16.9498 23.5367 16.9579C23.6842 16.966 23.8225 17.0317 23.9219 17.1409ZM27.4375 19C27.4383 20.3839 26.9283 21.7194 26.0052 22.7505C25.905 22.8589 25.7662 22.9236 25.6187 22.9306C25.4713 22.9376 25.327 22.8863 25.217 22.7878C25.107 22.6893 25.0401 22.5516 25.0308 22.4042C25.0214 22.2569 25.0704 22.1118 25.1671 22.0002C25.905 21.1752 26.3129 20.1072 26.3129 19.0004C26.3129 17.8935 25.905 16.8255 25.1671 16.0005C25.1165 15.9457 25.0772 15.8813 25.0517 15.8112C25.0261 15.7411 25.0148 15.6666 25.0183 15.5921C25.0219 15.5175 25.0402 15.4445 25.0722 15.3771C25.1043 15.3097 25.1494 15.2494 25.205 15.1996C25.2606 15.1498 25.3256 15.1116 25.3961 15.0872C25.4666 15.0628 25.5413 15.0526 25.6157 15.0573C25.6902 15.062 25.763 15.0815 25.8299 15.1146C25.8967 15.1478 25.9564 15.1939 26.0052 15.2502C26.9285 16.2809 27.4386 17.6163 27.4375 19Z" fill="#343330"/></svg>\',',
    '    unmute: \'<svg width="38" height="38" viewBox="0 0 38 38" fill="none" xmlns="http://www.w3.org/2000/svg"><rect width="38" height="38" rx="19" fill="white"/><path d="M13.7912 12.4342C13.7419 12.3785 13.6819 12.3332 13.6149 12.3009C13.5478 12.2685 13.475 12.2498 13.4007 12.2458C13.3264 12.2418 13.252 12.2526 13.1818 12.2776C13.1117 12.3025 13.0472 12.3412 12.9922 12.3912C12.9371 12.4413 12.8925 12.5018 12.8609 12.5692C12.8294 12.6366 12.8116 12.7096 12.8085 12.784C12.8053 12.8584 12.817 12.9326 12.8428 13.0025C12.8686 13.0723 12.908 13.1363 12.9588 13.1908L15.1715 15.625H12.25C11.9516 15.625 11.6655 15.7435 11.4545 15.9545C11.2435 16.1655 11.125 16.4516 11.125 16.75V21.25C11.125 21.5484 11.2435 21.8345 11.4545 22.0455C11.6655 22.2565 11.9516 22.375 12.25 22.375H15.4316L20.3423 26.1937C20.4254 26.2583 20.5249 26.2982 20.6296 26.3091C20.7343 26.3199 20.8399 26.3012 20.9345 26.2549C21.0291 26.2087 21.1088 26.1369 21.1645 26.0476C21.2203 25.9584 21.2499 25.8552 21.25 25.75V22.311L24.2087 25.5658C24.2581 25.6215 24.3181 25.6668 24.3852 25.6991C24.4522 25.7315 24.525 25.7502 24.5993 25.7542C24.6736 25.7582 24.748 25.7474 24.8182 25.7224C24.8883 25.6975 24.9528 25.6588 25.0078 25.6088C25.0629 25.5587 25.1075 25.4982 25.1391 25.4308C25.1706 25.3633 25.1884 25.2903 25.1915 25.216C25.1947 25.1416 25.183 25.0673 25.1572 24.9975C25.1314 24.9277 25.092 24.8637 25.0413 24.8092L13.7912 12.4342ZM12.25 16.75H15.0625V21.25H12.25V16.75ZM20.125 24.5997L16.1875 21.5376V16.7423L20.125 21.0735V24.5997ZM23.0781 20.1158C23.3494 19.8077 23.4991 19.4112 23.4991 19.0007C23.4991 18.5901 23.3494 18.1937 23.0781 17.8855C23.0264 17.8306 22.9863 17.7658 22.9602 17.6951C22.934 17.6244 22.9224 17.5491 22.9259 17.4737C22.9295 17.3984 22.9481 17.3245 22.9808 17.2566C23.0134 17.1886 23.0594 17.1278 23.116 17.078C23.1726 17.0281 23.2386 16.9902 23.3102 16.9664C23.3818 16.9426 23.4574 16.9334 23.5326 16.9394C23.6078 16.9454 23.681 16.9664 23.7478 17.0013C23.8147 17.0362 23.8739 17.0841 23.9219 17.1423C24.3743 17.6559 24.6239 18.3169 24.6239 19.0014C24.6239 19.6859 24.3743 20.3468 23.9219 20.8605C23.873 20.9159 23.8137 20.9611 23.7473 20.9936C23.6809 21.026 23.6088 21.0451 23.5351 21.0497C23.4613 21.0543 23.3874 21.0444 23.3175 21.0204C23.2476 20.9964 23.1831 20.9589 23.1277 20.91C23.0723 20.8611 23.0271 20.8018 22.9946 20.7354C22.9621 20.6691 22.943 20.5969 22.9384 20.5232C22.9338 20.4495 22.9438 20.3755 22.9678 20.3056C22.9917 20.2357 23.0292 20.1712 23.0781 20.1158ZM17.4419 14.7721C17.3965 14.7138 17.363 14.6471 17.3434 14.5759C17.3237 14.5046 17.3184 14.4302 17.3275 14.3569C17.3366 14.2836 17.3601 14.2128 17.3967 14.1485C17.4332 14.0843 17.482 14.0279 17.5403 13.9825L20.3423 11.8028C20.4256 11.738 20.5255 11.698 20.6305 11.6873C20.7355 11.6766 20.8414 11.6956 20.9361 11.7423C21.0308 11.7889 21.1104 11.8613 21.1659 11.9511C21.2215 12.0408 21.2506 12.1444 21.25 12.25V17.5115C21.25 17.6607 21.1907 17.8037 21.0852 17.9092C20.9798 18.0147 20.8367 18.074 20.6875 18.074C20.5383 18.074 20.3952 18.0147 20.2898 17.9092C20.1843 17.8037 20.125 17.6607 20.125 17.5115V13.4003L18.2308 14.8769C18.1126 14.968 17.9632 15.0084 17.8152 14.9893C17.6673 14.9701 17.533 14.893 17.4419 14.7749V14.7721ZM27.4375 19C27.4383 20.3839 26.9283 21.7194 26.0052 22.7505C25.905 22.8589 25.7662 22.9236 25.6187 22.9305C25.4713 22.9375 25.327 22.8863 25.217 22.7878C25.107 22.6893 25.0401 22.5516 25.0308 22.4042C25.0214 22.2569 25.0704 22.1118 25.1671 22.0002C25.905 21.1752 26.3129 20.1072 26.3129 19.0003C26.3129 17.8935 25.905 16.8255 25.1671 16.0005C25.1165 15.9457 25.0772 15.8813 25.0517 15.8112C25.0261 15.7411 25.0148 15.6666 25.0183 15.5921C25.0219 15.5175 25.0402 15.4444 25.0722 15.3771C25.1043 15.3097 25.1494 15.2493 25.205 15.1996C25.2606 15.1498 25.3256 15.1116 25.3961 15.0872C25.4666 15.0627 25.5413 15.0526 25.6157 15.0573C25.6902 15.062 25.763 15.0815 25.8299 15.1146C25.8967 15.1477 25.9564 15.1938 26.0052 15.2502C26.9285 16.2809 27.4386 17.6163 27.4375 19Z" fill="#343330"/></svg>\',',
    '  };',
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
    '  function stopEvent(event) {',
    '    event.preventDefault();',
    '    event.stopPropagation();',
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
    '  function setButtonIcon(button, icon, label) {',
    '    if (!button) return;',
    '    button.innerHTML = icon;',
    '    button.setAttribute("aria-label", label);',
    '  }',
    '',
    '  var video = document.getElementById("video");',
    '  var videoControls = document.getElementById("video-controls");',
    '  var playbackToggle = document.getElementById("video-playback-toggle");',
    '  var audioToggle = document.getElementById("video-audio-toggle");',
    '  if (video) {',
    '    video.loop = false;',
    '    video.muted = true;',
    '',
    '    var hideVideoControls = function () {',
    '      if (videoControls) {',
    '        videoControls.hidden = true;',
    '      }',
    '    };',
    '',
    '    var syncPlaybackControl = function () {',
    '      if (video.ended) {',
    '        setButtonIcon(playbackToggle, ICONS.replay, "Replay video");',
    '        return;',
    '      }',
    '',
    '      if (video.paused) {',
    '        setButtonIcon(playbackToggle, ICONS.play, "Play video");',
    '        return;',
    '      }',
    '',
    '      setButtonIcon(playbackToggle, ICONS.pause, "Pause video");',
    '    };',
    '',
    '    var syncAudioControl = function () {',
    '      if (video.muted) {',
    '        setButtonIcon(audioToggle, ICONS.unmute, "Unmute video");',
    '        return;',
    '      }',
    '',
    '      setButtonIcon(audioToggle, ICONS.mute, "Mute video");',
    '    };',
    '',
    '    var safePlay = function () {',
    '      var playAttempt = video.play();',
    '      if (playAttempt && typeof playAttempt.catch === "function") {',
    '        playAttempt.catch(function () {',
    '          syncPlaybackControl();',
    '        });',
    '      }',
    '    };',
    '',
    '    if (playbackToggle) {',
    '      playbackToggle.addEventListener("click", function (event) {',
    '        event.preventDefault();',
    '        event.stopPropagation();',
    '',
    '        if (video.ended) {',
    '          video.currentTime = 0;',
    '          safePlay();',
    '          return;',
    '        }',
    '',
    '        if (video.paused) {',
    '          safePlay();',
    '          return;',
    '        }',
    '',
    '        video.pause();',
    '      });',
    '    }',
    '',
    '    if (audioToggle) {',
    '      audioToggle.addEventListener("click", function (event) {',
    '        event.preventDefault();',
    '        event.stopPropagation();',
    '        video.muted = !video.muted;',
    '        syncAudioControl();',
    '      });',
    '    }',
    '',
    '    video.addEventListener("play", syncPlaybackControl);',
    '    video.addEventListener("pause", syncPlaybackControl);',
    '    video.addEventListener("ended", syncPlaybackControl);',
    '    video.addEventListener("volumechange", syncAudioControl);',
    '    video.addEventListener("error", hideVideoControls);',
    '    video.addEventListener("stalled", hideVideoControls);',
    '    video.addEventListener("abort", hideVideoControls);',
    '',
    '    syncPlaybackControl();',
    '    syncAudioControl();',
    '    safePlay();',
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
    videoTrackingJs: input.hasVideo ? buildVideoTrackingJs() : null,
  };
}

function escapeHtmlAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
