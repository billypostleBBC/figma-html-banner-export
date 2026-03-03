import { SizeDimensions, SupportedSize, VideoSpec } from './types';

export const SUPPORTED_SIZES: Record<SupportedSize, SizeDimensions> = {
  '970x250': { width: 970, height: 250 },
  '1024x400': { width: 1024, height: 400 },
  '300x600': { width: 300, height: 600 },
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
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${fieldName} must be a valid URL.`);
  }

  if (url.protocol !== 'https:') {
    throw new Error(`${fieldName} must use https://.`);
  }
}

export function normalizeVideoSpec(video: VideoSpec | null | undefined): VideoSpec | null {
  if (!video) {
    return null;
  }

  const url = video.url.trim();
  if (!url) {
    return null;
  }

  assertValidUrl(url, 'Video URL');

  return {
    url,
    autoplayMutedLoop: video.autoplayMutedLoop,
  };
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
