import { SizeDimensions, SupportedSize, VideoSpec } from './types';

export const SUPPORTED_SIZES: Record<SupportedSize, SizeDimensions> = {
  '970x250': { width: 970, height: 250 },
  '1024x400': { width: 1024, height: 400 },
  '300x600': { width: 300, height: 600 },
  '300x250': { width: 300, height: 250 },
  '728x90': { width: 728, height: 90 },
  '320x50': { width: 320, height: 50 },
  '300x50': { width: 300, height: 50 },
};

export const REQUIRED_LAYERS = ['background-image', 'Branding', 'Heading', 'compliance', 'cta', 'click_area'] as const;
export const OPTIONAL_LAYERS = ['Subheading'] as const;

export const MAX_CREATIVE_BYTES = 1_572_864;
export const INITIAL_WEBP_QUALITY = 0.76;
export const QUALITY_STEP = 0.06;
export const QUALITY_FLOOR = 0.52;
export const SCALE_STEP = 0.9;
export const BACKUP_JPEG_QUALITY = 0.62;

export function parseSupportedSize(width: number, height: number): SupportedSize | null {
  for (const [size, dimensions] of Object.entries(SUPPORTED_SIZES) as Array<[SupportedSize, SizeDimensions]>) {
    if (Math.abs(width - dimensions.width) < 0.01 && Math.abs(height - dimensions.height) < 0.01) {
      return size;
    }
  }
  return null;
}

export function assertValidUrl(value: string, fieldName: string): void {
  const normalized = normalizeUrlInput(value);
  if (!normalized) {
    throw new Error(`${fieldName} must be a valid URL.`);
  }

  if (!normalized.toLowerCase().startsWith('https://')) {
    throw new Error(`${fieldName} must use https://.`);
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== 'https:') {
      throw new Error(`${fieldName} must use https://.`);
    }
  } catch {
    // Figma plugin runtime can reject some pasted strings with hidden chars.
    // Keep MVP permissive: if it clearly looks like an https URL with no spaces, accept it.
    if (!/^https:\/\/\S+$/i.test(normalized)) {
      throw new Error(`${fieldName} must be a valid URL.`);
    }
  }
}

type ParsedUrl = {
  protocol: string;
  hostname: string;
};

function parseUrl(value: string): ParsedUrl | null {
  if (typeof URL === 'function') {
    try {
      const parsed = new URL(value);
      if (!parsed.hostname) {
        return null;
      }
      return {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
      };
    } catch {
      return null;
    }
  }

  const match = value.match(/^([a-z][a-z0-9+.-]*):\/\/([^/?#\s]+)(?:[/?#]|$)/i);
  if (!match) {
    return null;
  }

  const mp4Url = normalizeUrlInput(video.mp4Url);
  if (!mp4Url) {
    return null;
  }

  assertValidUrl(mp4Url, 'Video MP4 URL');

  return {
    mp4Url,
  };
}

function normalizeUrlInput(value: string): string {
  let trimmed = value
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .trim();

  trimmed = stripWrapped(trimmed, '\'', '\'');
  trimmed = stripWrapped(trimmed, '"', '"');
  trimmed = stripWrapped(trimmed, '“', '”');
  trimmed = stripWrapped(trimmed, '‘', '’');
  trimmed = stripWrapped(trimmed, '<', '>');

  return trimmed.trim();
}

function stripWrapped(value: string, start: string, end: string): string {
  if (value.length < 2) {
    return value;
  }

  if (value.startsWith(start) && value.endsWith(end)) {
    return value.slice(start.length, value.length - end.length).trim();
  }

  return value;
}

export function bytesToKB(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)}KB`;
}

export function fileNameForZip(size: SupportedSize): string {
  return `creative_${size}.zip`;
}

export function encodeUtf8(value: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value);
  }
  return encodeUtf8Fallback(value);
}

function encodeUtf8Fallback(value: string): Uint8Array {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];

  for (let i = 0; i < encoded.length; i += 1) {
    const char = encoded.charCodeAt(i);
    if (char === 37) {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    bytes.push(char);
  }

  return new Uint8Array(bytes);
}
