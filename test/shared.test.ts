import { describe, expect, test } from 'vitest';
import { fileNameForZip, normalizeVideoSpec, parseSupportedSize } from '../src/shared';

describe('shared utilities', () => {
  test('parseSupportedSize matches only supported dimensions', () => {
    expect(parseSupportedSize(970, 250)).toBe('970x250');
    expect(parseSupportedSize(300, 250)).toBe('300x250');
    expect(parseSupportedSize(728, 90)).toBe('728x90');
    expect(parseSupportedSize(320, 50)).toBe('320x50');
    expect(parseSupportedSize(300, 50)).toBe('300x50');
    expect(parseSupportedSize(1024.1, 399.8)).toBeNull();
    expect(parseSupportedSize(320, 49)).toBeNull();
  });

  test('fileNameForZip uses deterministic creative prefix', () => {
    expect(fileNameForZip('970x250')).toBe('creative_970x250.zip');
    expect(fileNameForZip('1024x400')).toBe('creative_1024x400.zip');
    expect(fileNameForZip('300x600')).toBe('creative_300x600.zip');
    expect(fileNameForZip('300x250')).toBe('creative_300x250.zip');
    expect(fileNameForZip('728x90')).toBe('creative_728x90.zip');
    expect(fileNameForZip('320x50')).toBe('creative_320x50.zip');
    expect(fileNameForZip('300x50')).toBe('creative_300x50.zip');
  });

  test('normalizeVideoSpec accepts valid URL and trims whitespace', () => {
    expect(
      normalizeVideoSpec({
        url: '  https://cdn.example.com/video.mp4  ',
        autoplayMutedLoop: true,
      }),
    ).toEqual({
      url: 'https://cdn.example.com/video.mp4',
      autoplayMutedLoop: true,
    });
  });

  test('normalizeVideoSpec accepts valid https URL when URL constructor is unavailable', () => {
    const originalUrl = globalThis.URL;

    Object.defineProperty(globalThis, 'URL', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    try {
      expect(
        normalizeVideoSpec({
          url: 'https://static.bbc-storyworks.com/storyworks/specials/kuwait-fund/videos/919-KuwaitFund_30s_V6_Clean_16x9_subs_1.mp4',
          autoplayMutedLoop: true,
        }),
      ).toEqual({
        url: 'https://static.bbc-storyworks.com/storyworks/specials/kuwait-fund/videos/919-KuwaitFund_30s_V6_Clean_16x9_subs_1.mp4',
        autoplayMutedLoop: true,
      });
    } finally {
      Object.defineProperty(globalThis, 'URL', {
        configurable: true,
        writable: true,
        value: originalUrl,
      });
    }
  });
});
