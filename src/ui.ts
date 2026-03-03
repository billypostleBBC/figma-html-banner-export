import {
  CreativeBuildResult,
  ExtractedFramePayload,
  MainToUiMessage,
  SupportedSize,
  UiToMainMessage,
  VideoSpec,
} from './types';
import {
  BACKUP_JPEG_QUALITY,
  bytesToKB,
  encodeUtf8,
  fileNameForZip,
  INITIAL_WEBP_QUALITY,
  MAX_CREATIVE_BYTES,
  QUALITY_FLOOR,
  QUALITY_STEP,
  SCALE_STEP,
  SUPPORTED_SIZES,
} from './shared';
import { buildCreativeFiles } from './templates';

const exportButton = document.getElementById('export-btn') as HTMLButtonElement;
const statusEl = document.getElementById('status') as HTMLDivElement;
const selectionList = document.getElementById('selection-list') as HTMLUListElement;
const resultList = document.getElementById('result-list') as HTMLUListElement;

const sizeOrder = Object.keys(SUPPORTED_SIZES) as SupportedSize[];
const UI_LOG_PREFIX = '[HTML Banner Export][ui]';
let crcTable: Uint32Array | null = null;

window.addEventListener('error', (event) => {
  logUi('window-error', {
    message: event.message,
    file: event.filename,
    line: event.lineno,
    column: event.colno,
    error: event.error instanceof Error
      ? { message: event.error.message, stack: event.error.stack }
      : undefined,
  });
});

window.addEventListener('unhandledrejection', (event) => {
  logUi('unhandled-rejection', {
    reason: serializeUnknown(event.reason),
  });
});

window.onmessage = (event: MessageEvent<{ pluginMessage: MainToUiMessage }>) => {
  const message = event.data.pluginMessage;
  if (!message) {
    return;
  }

  if (message.type === 'busy-state') {
    logUi('busy-state received', { busy: message.payload.busy });
    exportButton.disabled = message.payload.busy;
    return;
  }

  if (message.type === 'selection-state') {
    logUi('selection-state received', {
      selectedCount: message.payload.selectedCount,
      issues: message.payload.issues,
    });
    renderSelection(message.payload.items, message.payload.issues);
    return;
  }

  if (message.type === 'export-error') {
    logUi('export-error received', { message: message.payload.message });
    setStatus(message.payload.message, 'error');
    return;
  }

  if (message.type === 'export-prepared') {
    logUi('export-prepared received', {
      creatives: message.payload.creatives.length,
    });
    void processPreparedExport(message.payload.creatives);
  }
};

logUi('ui-script-loaded');
setStatus('UI loaded. Waiting for selection state...', 'info');
requestSelectionState();
startSelectionHeartbeat();

exportButton.addEventListener('click', () => {
  try {
    logUi('export-clicked');
    const videoBySize = collectVideoBySize();

    clearResults();
    setStatus('Preparing export from selected frames...', 'info');

    const posted = safePostToMain(
      {
        type: 'run-export',
        payload: {
          videoBySize,
        },
      },
      'Could not send export request to the plugin host. Close and reopen the plugin, then try again.',
    );
    if (!posted) {
      logUi('run-export post failed');
      return;
    }
    logUi('run-export posted', { selectedAtClick: selectionList.childElementCount });
  } catch (error) {
    logUi('export validation failed', serializeUnknown(error));
    setStatus(error instanceof Error ? error.message : 'Validation error', 'error');
  }
});

async function processPreparedExport(creatives: ExtractedFramePayload[]): Promise<void> {
  const results: CreativeBuildResult[] = [];
  const successful: ZippedCreative[] = [];

  for (const creative of creatives) {
    try {
      const prepared = await buildCreativeZip(creative);
      successful.push(prepared);
      results.push(prepared.result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown packaging error';
      results.push({
        size: creative.size,
        zipFileName: fileNameForZip(creative.size),
        packagedBytes: 0,
        passedBudget: false,
        warnings: [],
        errors: [message],
      });
    }
  }

  renderResults(results);

  const failed = results.filter((item) => !item.passedBudget || item.errors?.length);
  if (successful.length > 0) {
    if (successful.length === 1) {
      const only = successful[0];
      downloadBlob(only.fileName, only.blob);
    } else {
      const bundleBlob = await buildBundleZip(successful);
      downloadBlob('creative_bundle.zip', bundleBlob);
    }
  }

  if (successful.length === 0) {
    setStatus('Export failed for all selected creatives. Check the results list for details.', 'error');
    return;
  }

  if (failed.length > 0) {
    setStatus(
      `Export downloaded ${successful.length} ZIP file(s), with ${failed.length} failed creative(s). Check the results list for details.`,
      'error',
    );
    return;
  }

  const successMessage = successful.length === 1
    ? 'Export complete. Downloaded 1 ZIP file.'
    : `Export complete. Downloaded 1 bundle ZIP containing ${successful.length} creatives.`;
  setStatus(successMessage, 'success');
}

type ZippedCreative = {
  fileName: string;
  blob: Blob;
  result: CreativeBuildResult;
};

async function buildCreativeZip(
  creative: ExtractedFramePayload,
): Promise<ZippedCreative> {
  let quality = INITIAL_WEBP_QUALITY;
  let scale = 1;
  const warnings: string[] = [];

  while (true) {
    const files = await buildFileMap(creative, quality, scale);
    const byteCount = countByteSize(files);

    if (byteCount <= MAX_CREATIVE_BYTES) {
      const zipFileName = fileNameForZip(creative.size);
      const zipBlob = await generateZipBlob(files);
      return {
        fileName: zipFileName,
        blob: zipBlob,
        result: {
          size: creative.size,
          zipFileName,
          packagedBytes: zipBlob.size,
          passedBudget: true,
          warnings,
        },
      };
    }

    if (quality <= QUALITY_FLOOR) {
      const overBy = byteCount - MAX_CREATIVE_BYTES;
      const largest = [...files.entries()]
        .sort((a, b) => b[1].byteLength - a[1].byteLength)
        .slice(0, 3)
        .map(([path, bytes]) => `${path} (${bytesToKB(bytes.byteLength)})`)
        .join(', ');

      throw new Error(
        `${creative.size} exceeded 1.5MB by ${bytesToKB(overBy)} at quality floor 0.52. Largest files: ${largest}`,
      );
    }

    const nextQuality = Math.max(QUALITY_FLOOR, round2(quality - QUALITY_STEP));
    const nextScale = round2(scale * SCALE_STEP);
    warnings.push(
      `${creative.size}: reduced compression target to quality ${nextQuality.toFixed(2)} at ${Math.round(nextScale * 100)}% scale.`,
    );
    quality = nextQuality;
    scale = nextScale;
  }
}

async function buildFileMap(
  creative: ExtractedFramePayload,
  imageQuality: number,
  scale: number,
): Promise<Map<string, Uint8Array>> {
  const bgWebp = await transcodeImage(creative.assets.bgPng, 'image/png', 'image/webp', imageQuality, scale);
  const logoWebp = await transcodeImage(
    creative.assets.logoPng,
    'image/png',
    'image/webp',
    imageQuality,
    scale,
  );
  const ctaWebp = await transcodeImage(
    creative.assets.ctaPng,
    'image/png',
    'image/webp',
    imageQuality,
    scale,
  );
  const backupJpg = await transcodeImage(
    creative.assets.backupJpg,
    'image/jpeg',
    'image/jpeg',
    BACKUP_JPEG_QUALITY,
    1,
  );

  const fileTemplates = buildCreativeFiles({
    size: creative.size,
    dimensions: creative.dimensions,
    layout: creative.layout,
    hasVideo: Boolean(creative.video),
    video: creative.video,
    hasSubhead: Boolean(creative.assets.textSvg.subhead),
  });

  const files = new Map<string, Uint8Array>();
  files.set('index.html', encodeUtf8(fileTemplates.indexHtml));
  files.set('main.js', encodeUtf8(fileTemplates.mainJs));
  files.set('styles.css', encodeUtf8(fileTemplates.stylesCss));
  files.set('manifest.json', encodeUtf8(fileTemplates.manifestJson));
  if (fileTemplates.videoTrackingJs) {
    files.set('videoTracking.js', encodeUtf8(fileTemplates.videoTrackingJs));
  }

  files.set('backup.jpg', backupJpg);
  files.set('assets/bg.webp', bgWebp);
  files.set('assets/logo.webp', logoWebp);
  files.set('assets/cta.webp', ctaWebp);

  files.set('assets/text-headline.svg', creative.assets.textSvg.headline);
  files.set('assets/text-compliance.svg', creative.assets.textSvg.compliance);

  if (creative.assets.textSvg.subhead) {
    files.set('assets/text-subhead.svg', creative.assets.textSvg.subhead);
  }

  return files;
}

async function transcodeImage(
  bytes: Uint8Array,
  inputMimeType: string,
  outputMimeType: string,
  quality: number,
  scale: number,
): Promise<Uint8Array> {
  const image = await decodeImage(bytes, inputMimeType);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to create canvas context for image compression.');
  }

  context.drawImage(image, 0, 0, width, height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (!result) {
          reject(new Error('Image compression failed.'));
          return;
        }
        resolve(result);
      },
      outputMimeType,
      quality,
    );
  });

  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function decodeImage(bytes: Uint8Array, mimeType: string): Promise<HTMLImageElement> {
  const blob = new Blob([copyToArrayBuffer(bytes)], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const image = new Image();
    image.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not decode exported image bytes.'));
    });

    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function generateZipBlob(files: Map<string, Uint8Array>): Promise<Blob> {
  const orderedFiles = [...files.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const zipBytes = buildStoredZip(orderedFiles);
  return new Blob([copyToArrayBuffer(zipBytes)], { type: 'application/zip' });
}

async function buildBundleZip(creatives: ZippedCreative[]): Promise<Blob> {
  const entries: Array<[string, Uint8Array]> = [];

  for (const creative of creatives) {
    const bytes = new Uint8Array(await creative.blob.arrayBuffer());
    entries.push([creative.fileName, bytes]);
  }

  const orderedEntries = entries.sort((a, b) => a[0].localeCompare(b[0]));
  const zipBytes = buildStoredZip(orderedEntries);
  return new Blob([copyToArrayBuffer(zipBytes)], { type: 'application/zip' });
}

function countByteSize(files: Map<string, Uint8Array>): number {
  let total = 0;
  for (const bytes of files.values()) {
    total += bytes.byteLength;
  }
  return total;
}

function collectVideoBySize(): Partial<Record<SupportedSize, VideoSpec | null>> {
  const result: Partial<Record<SupportedSize, VideoSpec | null>> = {};

  for (const size of sizeOrder) {
    const urlInput = document.getElementById(`video-${size}-url`) as HTMLInputElement;

    const url = urlInput.value.trim();

    if (!url) {
      result[size] = null;
      continue;
    }

    result[size] = {
      url,
      autoplayMutedLoop: true,
    };
  }

  return result;
}

function renderSelection(
  items: Array<{ frameName: string; width: number; height: number; size: SupportedSize | null; issue: string | null }>,
  issues: string[],
): void {
  selectionList.replaceChildren();

  if (items.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No nodes selected.';
    li.className = 'list-group-item text-body-secondary';
    selectionList.appendChild(li);
  } else {
    for (const item of items) {
      const li = document.createElement('li');
      const sizeLabel = item.size ?? `${Math.round(item.width)}x${Math.round(item.height)}`;
      const issueText = item.issue ? ` - ${item.issue}` : '';
      li.textContent = `${item.frameName} (${sizeLabel})${issueText}`;
      li.className = item.issue ? 'list-group-item text-warning' : 'list-group-item';
      selectionList.appendChild(li);
    }
  }

  if (issues.length > 0) {
    setStatus(`Selection has ${issues.length} issue(s). Resolve before export.`, 'error');
  } else {
    setStatus('Selection is valid. Ready to export.', 'success');
  }
}

function renderResults(results: CreativeBuildResult[]): void {
  resultList.replaceChildren();

  for (const item of results) {
    const li = document.createElement('li');
    const parts = [`${item.size}: ${item.zipFileName}`];

    if (item.passedBudget) {
      parts.push(`OK (${bytesToKB(item.packagedBytes)} zipped)`);
    } else {
      parts.push('FAILED');
    }

    if (item.warnings.length > 0) {
      parts.push(`Warnings: ${item.warnings.join(' | ')}`);
    }

    if (item.errors && item.errors.length > 0) {
      parts.push(`Errors: ${item.errors.join(' | ')}`);
    }

    li.textContent = parts.join(' - ');
    li.className = item.passedBudget && (!item.errors || item.errors.length === 0)
      ? 'list-group-item text-success'
      : 'list-group-item text-danger';
    resultList.appendChild(li);
  }
}

function clearResults(): void {
  resultList.replaceChildren();
}

function setStatus(message: string, level: 'info' | 'success' | 'error'): void {
  statusEl.textContent = message;
  const statusClass = level === 'success'
    ? 'alert-success'
    : level === 'error'
      ? 'alert-danger'
      : 'alert-secondary';
  statusEl.className = `alert ${statusClass} mb-0`;
}

function postToMain(message: UiToMainMessage): void {
  parent.postMessage({ pluginMessage: message }, '*');
}

function safePostToMain(message: UiToMainMessage, fallbackMessage: string): boolean {
  const posted = tryPostToMain(message);
  if (!posted) {
    setStatus(fallbackMessage, 'error');
  }
  return posted;
}

function tryPostToMain(message: UiToMainMessage): boolean {
  try {
    postToMain(message);
    return true;
  } catch (error) {
    logUi('postToMain failed', serializeUnknown(error));
    return false;
  }
}

function requestSelectionState(): void {
  // Let the host bridge settle before the first message to avoid missing initial state.
  window.setTimeout(() => {
    logUi('request-selection dispatched');
    safePostToMain(
      { type: 'request-selection' },
      'Could not request selection state from the plugin host. Close and reopen the plugin.',
    );
  }, 0);
}

function startSelectionHeartbeat(): void {
  window.setInterval(() => {
    tryPostToMain({ type: 'request-selection' });
  }, 1200);
}

function downloadBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

type ZipEntryInfo = {
  pathBytes: Uint8Array;
  fileBytes: Uint8Array;
  crc32: number;
  localOffset: number;
};

function buildStoredZip(entries: Array<[string, Uint8Array]>): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const zipEntries: ZipEntryInfo[] = [];

  let offset = 0;
  for (const [path, fileBytes] of entries) {
    const pathBytes = encodeUtf8(path);
    const entry: ZipEntryInfo = {
      pathBytes,
      fileBytes,
      crc32: computeCrc32(fileBytes),
      localOffset: offset,
    };
    zipEntries.push(entry);

    const localHeader = new Uint8Array(30 + pathBytes.byteLength);
    writeU32(localHeader, 0, 0x04034b50);
    writeU16(localHeader, 4, 20);
    writeU16(localHeader, 6, 0);
    writeU16(localHeader, 8, 0);
    writeU16(localHeader, 10, 0);
    writeU16(localHeader, 12, 0);
    writeU32(localHeader, 14, entry.crc32);
    writeU32(localHeader, 18, fileBytes.byteLength);
    writeU32(localHeader, 22, fileBytes.byteLength);
    writeU16(localHeader, 26, pathBytes.byteLength);
    writeU16(localHeader, 28, 0);
    localHeader.set(pathBytes, 30);

    localParts.push(localHeader, fileBytes);
    offset += localHeader.byteLength + fileBytes.byteLength;
  }

  const centralDirectoryOffset = offset;

  for (const entry of zipEntries) {
    const centralHeader = new Uint8Array(46 + entry.pathBytes.byteLength);
    writeU32(centralHeader, 0, 0x02014b50);
    writeU16(centralHeader, 4, 20);
    writeU16(centralHeader, 6, 20);
    writeU16(centralHeader, 8, 0);
    writeU16(centralHeader, 10, 0);
    writeU16(centralHeader, 12, 0);
    writeU16(centralHeader, 14, 0);
    writeU32(centralHeader, 16, entry.crc32);
    writeU32(centralHeader, 20, entry.fileBytes.byteLength);
    writeU32(centralHeader, 24, entry.fileBytes.byteLength);
    writeU16(centralHeader, 28, entry.pathBytes.byteLength);
    writeU16(centralHeader, 30, 0);
    writeU16(centralHeader, 32, 0);
    writeU16(centralHeader, 34, 0);
    writeU16(centralHeader, 36, 0);
    writeU32(centralHeader, 38, 0);
    writeU32(centralHeader, 42, entry.localOffset);
    centralHeader.set(entry.pathBytes, 46);

    centralParts.push(centralHeader);
    offset += centralHeader.byteLength;
  }

  const centralDirectorySize = offset - centralDirectoryOffset;
  const endRecord = new Uint8Array(22);
  writeU32(endRecord, 0, 0x06054b50);
  writeU16(endRecord, 4, 0);
  writeU16(endRecord, 6, 0);
  writeU16(endRecord, 8, zipEntries.length);
  writeU16(endRecord, 10, zipEntries.length);
  writeU32(endRecord, 12, centralDirectorySize);
  writeU32(endRecord, 16, centralDirectoryOffset);
  writeU16(endRecord, 20, 0);

  const totalSize = offset + endRecord.byteLength;
  const output = new Uint8Array(totalSize);

  let cursor = 0;
  for (const part of localParts) {
    output.set(part, cursor);
    cursor += part.byteLength;
  }
  for (const part of centralParts) {
    output.set(part, cursor);
    cursor += part.byteLength;
  }
  output.set(endRecord, cursor);
  return output;
}

function computeCrc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = createCrcTable();
  }

  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    const tableIndex = (crc ^ bytes[i]) & 0xff;
    crc = (crc >>> 8) ^ crcTable[tableIndex];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let j = 0; j < 8; j += 1) {
      if ((value & 1) === 1) {
        value = (value >>> 1) ^ 0xedb88320;
      } else {
        value >>>= 1;
      }
    }
    table[i] = value >>> 0;
  }
  return table;
}

function writeU16(target: Uint8Array, offset: number, value: number): void {
  const view = new DataView(target.buffer, target.byteOffset, target.byteLength);
  view.setUint16(offset, value, true);
}

function writeU32(target: Uint8Array, offset: number, value: number): void {
  const view = new DataView(target.buffer, target.byteOffset, target.byteLength);
  view.setUint32(offset, value >>> 0, true);
}

function logUi(message: string, data?: unknown): void {
  if (typeof data === 'undefined') {
    console.log(`${UI_LOG_PREFIX} ${message}`);
  } else {
    console.log(`${UI_LOG_PREFIX} ${message}`, data);
  }

  try {
    postToMain({
      type: 'debug-log',
      payload: {
        message,
        data,
      },
    });
  } catch {
    // Ignore host-bridge failures while logging.
  }
}

function serializeUnknown(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      message: value.message,
      stack: value.stack,
    };
  }
  if (typeof value === 'object' && value !== null) {
    return value;
  }
  return String(value);
}
