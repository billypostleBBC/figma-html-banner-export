export type SupportedSize =
  | '970x250'
  | '1024x400'
  | '300x600'
  | '300x250'
  | '728x90'
  | '320x50'
  | '300x50';

export interface SizeDimensions {
  width: number;
  height: number;
}

export interface VideoSpec {
  mp4Url: string;
}

export interface LayerBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TextLayerBoxes {
  headline: LayerBox;
  compliance: LayerBox;
  cta: LayerBox;
  subhead?: LayerBox;
}

export interface FrameLayerLayout {
  bg: LayerBox;
  clickArea: LayerBox;
  logo: LayerBox;
  text: TextLayerBoxes;
  videoSlot?: LayerBox;
}

export interface TextSvgAssets {
  headline: Uint8Array;
  compliance: Uint8Array;
  subhead?: Uint8Array;
}

export interface ExtractedFrameAssets {
  bgPng: Uint8Array;
  logoPng: Uint8Array;
  ctaPng: Uint8Array;
  backupJpg: Uint8Array;
  textSvg: TextSvgAssets;
}

export interface FrameSelection {
  nodeId: string;
  size: SupportedSize;
  frameName: string;
}

export interface ExtractedFramePayload extends FrameSelection {
  dimensions: SizeDimensions;
  layout: FrameLayerLayout;
  assets: ExtractedFrameAssets;
  video: VideoSpec | null;
}

export interface ExportInput {
  frames: FrameSelection[];
  videoBySize?: Partial<Record<SupportedSize, VideoSpec | null>>;
}

export interface BuildManifest {
  version: '1.0';
  size: SupportedSize;
  dimensions: SizeDimensions;
  hasVideo: boolean;
  clickTagMode: 'single';
  backupImage: string;
  maxBytesExcludingVideo: 1572864;
}

export interface CreativeBuildResult {
  size: SupportedSize;
  zipFileName: string;
  packagedBytes: number;
  passedBudget: boolean;
  warnings: string[];
  errors?: string[];
}

export interface SelectionSummaryItem {
  nodeId: string;
  frameName: string;
  width: number;
  height: number;
  size: SupportedSize | null;
  issue: string | null;
}

export interface PreparedExportPayload {
  creatives: ExtractedFramePayload[];
}

export type UiToMainMessage =
  | { type: 'request-selection' }
  | { type: 'run-export'; payload: { videoBySize: Partial<Record<SupportedSize, VideoSpec | null>> } }
  | { type: 'debug-log'; payload: { message: string; data?: unknown } }
  | { type: 'close' };

export type MainToUiMessage =
  | { type: 'selection-state'; payload: { selectedCount: number; items: SelectionSummaryItem[]; issues: string[] } }
  | { type: 'busy-state'; payload: { busy: boolean } }
  | { type: 'export-prepared'; payload: PreparedExportPayload }
  | { type: 'export-error'; payload: { message: string; details?: string[] } };

export interface CreativeTemplateInput {
  size: SupportedSize;
  dimensions: SizeDimensions;
  layout: FrameLayerLayout;
  hasVideo: boolean;
  video: VideoSpec | null;
  hasSubhead: boolean;
}

export interface CreativeFileSet {
  indexHtml: string;
  stylesCss: string;
  mainJs: string;
  manifestJson: string;
  videoTrackingJs?: string | null;
}
