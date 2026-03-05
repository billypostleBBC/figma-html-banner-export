import { describe, expect, test } from 'vitest';
import { fileNameForZip, normalizeVideoSpec, parseSupportedSize } from '../src/shared';

describe('shared utilities', () => {
  test('parseSupportedSize matches only supported dimensions', () => {
    expect(parseSupportedSize(970, 250)).toBe('970x250');
    expect(parseSupportedSize(1024.1, 399.8)).toBeNull();
    expect(parseSupportedSize(320, 50)).toBeNull();
  });

  test('fileNameForZip uses deterministic creative prefix', () => {
    expect(fileNameForZip('970x250')).toBe('creative_970x250.zip');
    expect(fileNameForZip('1024x400')).toBe('creative_1024x400.zip');
    expect(fileNameForZip('300x600')).toBe('creative_300x600.zip');
  });

  test('normalizeVideoSpec accepts MP4 and ignores empty values', () => {
    expect(
      normalizeVideoSpec({
        mp4Url: 'https://cdn.example.com/video.mp4',
      }),
    ).toEqual({
      mp4Url: 'https://cdn.example.com/video.mp4',
    });
  });

    expect(normalizeVideoSpec({ mp4Url: '' })).toBeNull();
  });

  test('normalizeVideoSpec accepts HTTPS URLs wrapped in quotes', () => {
    expect(
      normalizeVideoSpec({
        mp4Url: '\'https://cdn.example.com/video.mp4\'',
      }),
    ).toEqual({
      mp4Url: 'https://cdn.example.com/video.mp4',
    });

    expect(
      normalizeVideoSpec({
        mp4Url: '"https://cdn.example.com/video.mp4"',
      }),
    ).toEqual({
      mp4Url: 'https://cdn.example.com/video.mp4',
    });
  });

  test('normalizeVideoSpec accepts URLs wrapped in smart quotes and angle brackets', () => {
    expect(
      normalizeVideoSpec({
        mp4Url: '“https://cdn.example.com/video.mp4”',
      }),
    ).toEqual({
      mp4Url: 'https://cdn.example.com/video.mp4',
    });

    expect(
      normalizeVideoSpec({
        mp4Url: '<https://cdn.example.com/video.mp4>',
      }),
    ).toEqual({
      mp4Url: 'https://cdn.example.com/video.mp4',
    });
  });

  test('normalizeVideoSpec keeps https-only requirement', () => {
    expect(() =>
      normalizeVideoSpec({
        mp4Url: 'http://cdn.example.com/video.mp4',
      }),
    ).toThrow('Video MP4 URL must use https://.');
  });
});
