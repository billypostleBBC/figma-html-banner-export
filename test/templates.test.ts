import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { buildCreativeFiles } from '../src/templates';
import { CreativeTemplateInput } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, 'fixtures', 'template-assertions.json');

const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  htmlContains: string[];
  cssContains: string[];
  jsContains: string[];
  manifestContains: string[];
};

const sampleInput: CreativeTemplateInput = {
  size: '970x250',
  dimensions: { width: 970, height: 250 },
  hasVideo: true,
  video: {
    mp4Url: 'https://cdn.example.com/demo.mp4',
    webmUrl: 'https://cdn.example.com/demo.webm',
    autoplayMutedLoop: true,
  },
  hasSubhead: true,
  layout: {
    bg: { x: 0, y: 0, width: 970, height: 250 },
    clickArea: { x: 0, y: 0, width: 970, height: 250 },
    logo: { x: 10, y: 10, width: 140, height: 42 },
    text: {
      headline: { x: 20, y: 70, width: 500, height: 80 },
      compliance: { x: 20, y: 220, width: 260, height: 18 },
      cta: { x: 760, y: 200, width: 180, height: 40 },
      subhead: { x: 20, y: 160, width: 460, height: 36 },
    },
    videoSlot: { x: 620, y: 20, width: 330, height: 180 },
  },
};

describe('template generation', () => {
  test('generates expected html/css/js/manifest structure', () => {
    const output = buildCreativeFiles(sampleInput);

    for (const part of fixture.htmlContains) {
      expect(output.indexHtml).toContain(part);
    }

    for (const part of fixture.cssContains) {
      expect(output.stylesCss).toContain(part);
    }

    for (const part of fixture.jsContains) {
      expect(output.mainJs).toContain(part);
    }

    for (const part of fixture.manifestContains) {
      expect(output.manifestJson).toContain(part);
    }
  });

  test('does not include font declarations in runtime output', () => {
    const output = buildCreativeFiles(sampleInput);
    const merged = `${output.indexHtml}\n${output.stylesCss}\n${output.mainJs}`;

    expect(merged).not.toContain('@font-face');
    expect(merged.toLowerCase()).not.toContain('font-family');
  });
});
