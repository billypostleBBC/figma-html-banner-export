import {
  ExtractedFramePayload,
  LayerBox,
  MainToUiMessage,
  SelectionSummaryItem,
  SupportedSize,
  UiToMainMessage,
  VideoSpec,
} from './types';
import { normalizeVideoSpec, parseSupportedSize, SUPPORTED_SIZES } from './shared';

const UI_WIDTH = 560;
const UI_HEIGHT = 820;
const SELECTION_POLL_INTERVAL_MS = 1200;
const RASTER_EXPORT_SCALE = 2;
const BACKUP_EXPORT_SCALE = 1;
const LAYER_NAMES = {
  bg: 'background-image',
  logo: 'Branding',
  headline: 'Heading',
  compliance: 'compliance',
  cta: 'cta',
  clickArea: 'click_area',
  subhead: 'Subheading',
  videoHint: 'video',
} as const;
let selectionStateFingerprint = '';
let hasUiHandshake = false;

figma.showUI(__html__, {
  width: UI_WIDTH,
  height: UI_HEIGHT,
  title: 'HTML Banner Export',
});

logMain('Plugin booted.');
void postSelectionState('startup', true);

figma.on('selectionchange', () => {
  logMain('selectionchange fired.');
  void postSelectionState('selectionchange');
});

setInterval(() => {
  void postSelectionState('poll');
}, SELECTION_POLL_INTERVAL_MS);

setTimeout(() => {
  if (!hasUiHandshake) {
    logMain('No UI handshake after 3s. UI script may have failed before startup.');
  }
}, 3000);

figma.ui.onmessage = async (message: UiToMainMessage) => {
  if (message.type === 'debug-log') {
    if (message.payload.message === 'ui-script-loaded') {
      hasUiHandshake = true;
      void postSelectionState('request', true);
    }
    logMain(`UI: ${message.payload.message}`, message.payload.data);
    return;
  }

  if (message.type === 'request-selection') {
    await postSelectionState('request');
    return;
  }

  if (message.type === 'close') {
    figma.closePlugin();
    return;
  }

  if (message.type !== 'run-export') {
    return;
  }

  postToUi({ type: 'busy-state', payload: { busy: true } });

  try {
    logMain('run-export received.', {
      selectedCount: figma.currentPage.selection.length,
    });

    const videoBySize = normalizeVideoMap(message.payload.videoBySize);
    const selection = resolveSelectionForExport(videoBySize);

    if (!selection.validFrames.length) {
      throw new Error('Select at least one valid frame before exporting.');
    }

    if (selection.issues.length > 0) {
      throw new Error(`Selection has blocking issues:\n- ${selection.issues.join('\n- ')}`);
    }

    const creatives: ExtractedFramePayload[] = [];
    for (const item of selection.validFrames) {
      const video = videoBySize[item.size] ?? null;
      const extracted = await extractFramePayload(item.frame, item.size, video);
      creatives.push(extracted);
    }

    postToUi({
      type: 'export-prepared',
      payload: {
        creatives,
      },
    });
  } catch (error) {
    const messageText = toErrorMessage(error);
    logMain('run-export failed.', toErrorDebug(error));
    postToUi({ type: 'export-error', payload: { message: messageText } });
  } finally {
    postToUi({ type: 'busy-state', payload: { busy: false } });
  }
};

async function postSelectionState(
  source: 'startup' | 'selectionchange' | 'request' | 'poll',
  force = false,
): Promise<void> {
  try {
    const selection = resolveSelectionForExport({});
    const payload = {
      selectedCount: figma.currentPage.selection.length,
      items: selection.items,
      issues: selection.issues,
    };
    const fingerprint = buildSelectionFingerprint(payload.selectedCount, payload.items, payload.issues);

    if (!force && fingerprint === selectionStateFingerprint) {
      return;
    }

    selectionStateFingerprint = fingerprint;
    logMain(`posting selection-state (${source}).`, {
      selectedCount: payload.selectedCount,
      items: payload.items.length,
      issues: payload.issues,
    });
    postToUi({
      type: 'selection-state',
      payload,
    });
  } catch (error) {
    const details = toErrorDebug(error);
    logMain(`postSelectionState failed (${source}).`, details);
    postToUi({
      type: 'export-error',
      payload: {
        message: `Failed to read current selection. ${details.message}`,
      },
    });
  }
}

function normalizeVideoMap(
  input: Partial<Record<SupportedSize, VideoSpec | null>>,
): Partial<Record<SupportedSize, VideoSpec | null>> {
  const output: Partial<Record<SupportedSize, VideoSpec | null>> = {};

  for (const size of Object.keys(SUPPORTED_SIZES) as SupportedSize[]) {
    output[size] = normalizeVideoSpec(input[size]);
  }

  return output;
}

type ResolvedSelection = {
  items: SelectionSummaryItem[];
  issues: string[];
  validFrames: Array<{ frame: FrameNode; size: SupportedSize }>;
};

function resolveSelectionForExport(
  videoBySize: Partial<Record<SupportedSize, VideoSpec | null>>,
): ResolvedSelection {
  const items: SelectionSummaryItem[] = [];
  const issues: string[] = [];
  const validFrames: Array<{ frame: FrameNode; size: SupportedSize }> = [];
  const seenSizes = new Set<SupportedSize>();

  for (const node of figma.currentPage.selection) {
    if (node.type !== 'FRAME') {
      items.push({
        nodeId: node.id,
        frameName: node.name,
        width: 0,
        height: 0,
        size: null,
        issue: 'Selection contains a non-frame node. Select frames only.',
      });
      issues.push(`“${node.name}” is not a frame.`);
      continue;
    }

    const size = parseSupportedSize(node.width, node.height);
    if (!size) {
      const issue = `Unsupported size ${Math.round(node.width)}x${Math.round(node.height)}.`;
      items.push({
        nodeId: node.id,
        frameName: node.name,
        width: node.width,
        height: node.height,
        size: null,
        issue,
      });
      issues.push(`Frame “${node.name}”: ${issue}`);
      continue;
    }

    if (seenSizes.has(size)) {
      const issue = `Duplicate size ${size}. Select only one frame per supported size.`;
      items.push({
        nodeId: node.id,
        frameName: node.name,
        width: node.width,
        height: node.height,
        size,
        issue,
      });
      issues.push(`Frame “${node.name}”: ${issue}`);
      continue;
    }

    seenSizes.add(size);
    const item: SelectionSummaryItem = {
      nodeId: node.id,
      frameName: node.name,
      width: node.width,
      height: node.height,
      size,
      issue: null,
    };

    const hasVideoHintLayer = findSceneNodeByName(node, LAYER_NAMES.videoHint) !== null;
    if (!videoBySize[size] && hasVideoHintLayer) {
      item.issue = `Layer “${LAYER_NAMES.videoHint}” is present but no video URL was provided. Export will omit video + tracking for ${size}.`;
    }

    items.push(item);

    if (videoBySize[size]) {
      const videoSlot = findSceneNodeByName(node, LAYER_NAMES.bg);
      if (!videoSlot) {
        issues.push(`Frame “${node.name}”: video URLs were provided for ${size}, but layer “${LAYER_NAMES.bg}” is missing.`);
      }
    }

    validFrames.push({ frame: node, size });
  }

  if (figma.currentPage.selection.length === 0) {
    issues.push('No selection. Select one or more supported frames.');
  }

  return { items, issues, validFrames };
}

async function extractFramePayload(
  frame: FrameNode,
  size: SupportedSize,
  video: VideoSpec | null,
): Promise<ExtractedFramePayload> {
  const framePrefix = `Frame “${frame.name}”`;

  const bgNode = requireExportableLayer(
    frame,
    LAYER_NAMES.bg,
    `${framePrefix}: missing required layer “${LAYER_NAMES.bg}”.`,
  );
  const logoNode = requireExportableLayer(
    frame,
    LAYER_NAMES.logo,
    `${framePrefix}: missing required layer “${LAYER_NAMES.logo}”.`,
  );
  const headlineNode = requireTextLayer(
    frame,
    LAYER_NAMES.headline,
    `${framePrefix}: missing required text layer “${LAYER_NAMES.headline}”.`,
  );
  const complianceNode = requireTextLayer(
    frame,
    LAYER_NAMES.compliance,
    `${framePrefix}: missing required text layer “${LAYER_NAMES.compliance}”.`,
  );
  const ctaNode = requireCtaLayer(
    frame,
    `${framePrefix}: missing required layer “${LAYER_NAMES.cta}”.`,
  );
  validateCtaHasBackgroundFill(frame, ctaNode);
  const clickAreaNode = requireBoxLayer(
    frame,
    LAYER_NAMES.clickArea,
    `${framePrefix}: missing required layer “${LAYER_NAMES.clickArea}”.`,
  );

  const subheadNode = optionalTextLayer(frame, LAYER_NAMES.subhead);
  const videoSlotNode = video
    ? requireBoxLayer(
        frame,
        LAYER_NAMES.bg,
        `${framePrefix}: layer “${LAYER_NAMES.bg}” must exist and be sized when video URLs are supplied for ${size}.`,
      )
    : null;

  const [
    bgPng,
    logoPng,
    ctaPng,
    backupJpg,
    headlineSvg,
    complianceSvg,
    subheadSvg,
  ] = await Promise.all([
    exportPng(bgNode),
    exportPng(logoNode),
    exportPng(ctaNode),
    exportJpg(frame),
    exportSvg(headlineNode),
    exportSvg(complianceNode),
    subheadNode ? exportSvg(subheadNode) : Promise.resolve(undefined),
  ]);

  return {
    nodeId: frame.id,
    frameName: frame.name,
    size,
    dimensions: {
      width: Math.round(frame.width),
      height: Math.round(frame.height),
    },
    layout: {
      bg: toRelativeBox(frame, bgNode),
      clickArea: toRelativeBox(frame, clickAreaNode),
      logo: toRelativeBox(frame, logoNode),
      text: {
        headline: toRelativeBox(frame, headlineNode),
        compliance: toRelativeBox(frame, complianceNode),
        cta: toRelativeBox(frame, ctaNode),
        subhead: subheadNode ? toRelativeBox(frame, subheadNode) : undefined,
      },
      videoSlot: videoSlotNode ? toRelativeBox(frame, videoSlotNode) : undefined,
    },
    assets: {
      bgPng,
      logoPng,
      ctaPng,
      backupJpg,
      textSvg: {
        headline: headlineSvg,
        compliance: complianceSvg,
        subhead: subheadSvg,
      },
    },
    video,
  };
}

function requireTextLayer(frame: FrameNode, layerName: string, errorMessage: string): TextNode {
  const node = findSceneNodeByNameMatching(frame, layerName, isTextNode);
  if (!node) {
    throw new Error(errorMessage);
  }
  return node;
}

function optionalTextLayer(frame: FrameNode, layerName: string): TextNode | null {
  const node = findSceneNodeByNameMatching(frame, layerName, isTextNode);
  if (!node) {
    const hasNamedLayer = findSceneNodeByName(frame, layerName);
    if (hasNamedLayer) {
      throw new Error(`Frame “${frame.name}”: layer “${layerName}” must be a text node.`);
    }
    return null;
  }
  return node;
}

function requireExportableLayer(
  frame: FrameNode,
  layerName: string,
  errorMessage: string,
): SceneNode & ExportMixin {
  const node = findSceneNodeByNameMatching(frame, layerName, canExport);
  if (!node) {
    throw new Error(errorMessage);
  }
  return node;
}

function requireCtaLayer(frame: FrameNode, errorMessage: string): SceneNode & ExportMixin {
  const candidates = findSceneNodesByName(frame, LAYER_NAMES.cta, true);
  if (!candidates.length) {
    throw new Error(errorMessage);
  }

  const exportableCandidates = candidates
    .map((node) => findMatchingNodeWithin(node, canExport))
    .filter((node): node is SceneNode & ExportMixin => node !== null);

  if (!exportableCandidates.length) {
    throw new Error(errorMessage);
  }

  const nonTextCandidate = exportableCandidates.find((node) => node.type !== 'TEXT');
  return nonTextCandidate ?? exportableCandidates[0];
}

function requireBoxLayer(frame: FrameNode, layerName: string, errorMessage: string): SceneNode {
  const node = findSceneNodeByNameMatching(frame, layerName, isSizedNode);
  if (!node) {
    throw new Error(errorMessage);
  }
  return node;
}

function validateCtaHasBackgroundFill(frame: FrameNode, ctaNode: SceneNode): void {
  if (ctaNode.type === 'INSTANCE') {
    return;
  }

  if (hasNonTextVisibleFill(ctaNode)) {
    return;
  }

  throw new Error(
    `Frame “${frame.name}”: layer “${LAYER_NAMES.cta}” must include at least one visible non-text fill (solid/gradient/image). Add a background fill behind the CTA label so black text is legible.`,
  );
}

function findSceneNodeByName(frame: FrameNode, name: string): SceneNode | null {
  const nodes = findSceneNodesByName(frame, name, false);
  return nodes[0] ?? null;
}

function findSceneNodeByNameMatching<T extends SceneNode>(
  frame: FrameNode,
  name: string,
  matcher: (node: SceneNode) => node is T,
): T | null {
  const nodes = findSceneNodesByName(frame, name, false);
  for (const node of nodes) {
    const matchedNode = findMatchingNodeWithin(node, matcher);
    if (matchedNode) {
      return matchedNode;
    }
  }
  return null;
}

function findMatchingNodeWithin<T extends SceneNode>(
  node: SceneNode,
  matcher: (candidate: SceneNode) => candidate is T,
): T | null {
  if (matcher(node)) {
    return node;
  }
  if (!hasChildren(node)) {
    return null;
  }
  const descendant = node.findOne((candidate) => isSceneNode(candidate) && matcher(candidate));
  if (!descendant || !isSceneNode(descendant) || !matcher(descendant)) {
    return null;
  }
  return descendant;
}

function findSceneNodesByName(frame: FrameNode, name: string, caseInsensitive: boolean): SceneNode[] {
  if (!caseInsensitive) {
    return frame.findAll((candidate) => isSceneNode(candidate) && candidate.name === name).filter(isSceneNode);
  }

  const target = name.toLowerCase();
  return frame
    .findAll((candidate) => isSceneNode(candidate) && candidate.name.toLowerCase() === target)
    .filter(isSceneNode);
}

function isSceneNode(node: BaseNode): node is SceneNode {
  return 'visible' in node;
}

function hasChildren(node: SceneNode): node is SceneNode & ChildrenMixin {
  return 'findOne' in node && typeof node.findOne === 'function';
}

function hasFills(node: SceneNode): node is SceneNode & MinimalFillsMixin {
  return 'fills' in node;
}

function isTextNode(node: SceneNode): node is TextNode {
  return node.type === 'TEXT';
}

function canExport(node: SceneNode): node is SceneNode & ExportMixin {
  return typeof (node as SceneNode & Partial<ExportMixin>).exportAsync === 'function';
}

function isSizedNode(node: SceneNode): node is SceneNode & DimensionAndPositionMixin {
  return 'width' in node && 'height' in node;
}

function hasNonTextVisibleFill(node: SceneNode): boolean {
  if (node.type !== 'TEXT' && nodeHasVisibleFill(node)) {
    return true;
  }

  if (!hasChildren(node)) {
    return false;
  }

  const descendant = node.findOne((candidate) => {
    if (!isSceneNode(candidate) || candidate.type === 'TEXT') {
      return false;
    }
    return nodeHasVisibleFill(candidate);
  });

  return descendant !== null;
}

function nodeHasVisibleFill(node: SceneNode): boolean {
  if (!hasFills(node)) {
    return false;
  }

  if (node.fills === figma.mixed) {
    return true;
  }

  return node.fills.some((paint) => (paint.visible ?? true) && (paint.opacity ?? 1) > 0);
}

async function exportPng(node: SceneNode & ExportMixin): Promise<Uint8Array> {
  return node.exportAsync({
    format: 'PNG',
    useAbsoluteBounds: true,
    constraint: { type: 'SCALE', value: RASTER_EXPORT_SCALE },
  });
}

async function exportJpg(node: SceneNode & ExportMixin): Promise<Uint8Array> {
  return node.exportAsync({
    format: 'JPG',
    useAbsoluteBounds: true,
    constraint: { type: 'SCALE', value: BACKUP_EXPORT_SCALE },
  });
}

async function exportSvg(node: TextNode): Promise<Uint8Array> {
  return node.exportAsync({ format: 'SVG', svgOutlineText: true, useAbsoluteBounds: true });
}

function toRelativeBox(frame: FrameNode, node: SceneNode): LayerBox {
  if (!('width' in node) || !('height' in node) || !('absoluteTransform' in node)) {
    throw new Error('Layer does not expose geometry.');
  }

  const frameX = frame.absoluteTransform[0][2];
  const frameY = frame.absoluteTransform[1][2];
  const nodeX = node.absoluteTransform[0][2];
  const nodeY = node.absoluteTransform[1][2];

  return {
    x: round2(nodeX - frameX),
    y: round2(nodeY - frameY),
    width: round2(node.width),
    height: round2(node.height),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function postToUi(message: MainToUiMessage): void {
  figma.ui.postMessage(message);
}

function logMain(message: string, data?: unknown): void {
  const prefix = '[HTML Banner Export][main]';
  if (typeof data === 'undefined') {
    console.log(`${prefix} ${message}`);
    return;
  }
  console.log(`${prefix} ${message}`, data);
}

function buildSelectionFingerprint(
  selectedCount: number,
  items: SelectionSummaryItem[],
  issues: string[],
): string {
  const itemSummary = items.map((item) => {
    const sizeLabel = item.size ?? `${Math.round(item.width)}x${Math.round(item.height)}`;
    return `${item.nodeId}:${sizeLabel}:${item.issue ?? 'ok'}`;
  });
  return `${selectedCount}|${itemSummary.join('|')}|${issues.join('|')}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown export error';
}

function toErrorDebug(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    message: String(error),
  };
}
