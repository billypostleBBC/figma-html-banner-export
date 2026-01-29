type UiMessage = {
  type: "export";
};

type StatusMessage = {
  type: "status" | "error";
  message: string;
};

type ZipMessage = {
  type: "zip";
  bytes: number[];
  filename: string;
};

const MAX_ZIP_BYTES = 500 * 1024;
const UI_WIDTH = 360;
const UI_HEIGHT = 220;

figma.showUI(__html__, { width: UI_WIDTH, height: UI_HEIGHT });

const postStatus = (message: string) => {
  const payload: StatusMessage = { type: "status", message };
  figma.ui.postMessage(payload);
};

const postError = (message: string) => {
  const payload: StatusMessage = { type: "error", message };
  figma.ui.postMessage(payload);
  figma.notify(message, { error: true });
};

const findDescendantByNames = (
  root: BaseNode & ChildrenMixin,
  names: string[],
): BaseNode | null =>
  root.findOne((node) => names.includes(node.name));

const ensureSingleFrameSelection = (): FrameNode | null => {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1 || selection[0].type !== "FRAME") {
    postError("Select exactly one FRAME to export.");
    return null;
  }
  return selection[0];
};

const exportBackgroundJpg = async (imageNode: SceneNode): Promise<Uint8Array> =>
  imageNode.exportAsync({
    format: "JPG",
    constraint: { type: "SCALE", value: 2 },
    jpgQuality: 0.4,
  });

const getAbsolutePosition = (node: SceneNode) => {
  const transform = node.absoluteTransform;
  return { x: transform[0][2], y: transform[1][2] };
};

type ExportedLayer = {
  name: string;
  bytes: Uint8Array;
  x: number;
  y: number;
  width: number;
  height: number;
};

const isVisibleSceneNode = (node: SceneNode) =>
  "visible" in node ? node.visible !== false : true;

const collectLeafNodes = (nodes: readonly SceneNode[]): SceneNode[] => {
  const output: SceneNode[] = [];
  nodes.forEach((node) => {
    if (!isVisibleSceneNode(node)) {
      return;
    }
    if ("children" in node && node.children.length > 0) {
      output.push(...collectLeafNodes(node.children as SceneNode[]));
      return;
    }
    output.push(node);
  });
  return output;
};

const sanitizeFileName = (value: string) =>
  value.replace(/[^a-z0-9-_]/gi, "_").toLowerCase();

const exportOverlayLayers = async (
  frame: FrameNode,
): Promise<ExportedLayer[]> => {
  let clone: FrameNode | null = null;
  try {
    clone = frame.clone();
    clone.name = `${frame.name} - overlay export`;
    clone.x = frame.x + frame.width + 100;
    clone.y = frame.y;
    figma.currentPage.appendChild(clone);

    const cloneBackground = findDescendantByNames(clone, [
      "background-image",
      "Background Image",
    ]);
    if (!cloneBackground) {
      throw new Error(
        "Missing background-image/Image/Video layer. Ensure the background photo is nested correctly.",
      );
    }

    let editableBackground: BaseNode & ChildrenMixin = cloneBackground as BaseNode &
      ChildrenMixin;
    if (cloneBackground.type === "INSTANCE") {
      editableBackground = cloneBackground.detachInstance();
    }

    const cloneImageNode = findDescendantByNames(editableBackground, [
      "Image/Video",
      "backgroundImage",
    ]) as SceneNode | null;
    if (!cloneImageNode) {
      throw new Error(
        "Missing background-image/Image/Video layer. Ensure the background photo is nested correctly.",
      );
    }
    cloneImageNode.remove();

    const frameAbs = getAbsolutePosition(clone);
    const leafNodes = collectLeafNodes(clone.children as SceneNode[]);
    const exportedLayers: ExportedLayer[] = [];

    for (let index = 0; index < leafNodes.length; index += 1) {
      const node = leafNodes[index];
      const bytes = await node.exportAsync({
        format: "SVG",
        constraint: { type: "SCALE", value: 1 },
      });
      const abs = getAbsolutePosition(node);
      exportedLayers.push({
        name: `${index + 1}-${sanitizeFileName(node.name || "layer")}`,
        bytes,
        x: abs.x - frameAbs.x,
        y: abs.y - frameAbs.y,
        width: node.width,
        height: node.height,
      });
    }

    return exportedLayers;
  } finally {
    if (clone) {
      clone.remove();
    }
  }
};

const buildHtml = (width: number, height: number): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HTML Banner</title>
    <style>
      html, body {
        margin: 0;
        padding: 0;
      }
      #ad {
        position: relative;
        width: ${width}px;
        height: ${height}px;
        overflow: hidden;
        cursor: pointer;
      }
      #bg,
      .layer {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
      }
      #bg {
        object-fit: cover;
      }
      .layer {
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div id="ad" role="button" tabindex="0" aria-label="Advertisement">
      <img id="bg" src="assets/bg.jpg" alt="" />
      {{layers}}
    </div>
    <script>
      (function () {
        var ad = document.getElementById("ad");
        if (!ad) {
          return;
        }
        var handleClick = function () {
          if (window.Enabler && window.Enabler.isInitialized && window.Enabler.isInitialized()) {
            window.Enabler.exit("BackgroundExit");
            return;
          }
          var url = window.clickTag || window.clicktag || "https://www.bbc.com";
          window.open(url, "_blank");
        };
        ad.addEventListener("click", handleClick);
        ad.addEventListener("keydown", function (event) {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleClick();
          }
        });
      })();
    </script>
  </body>
</html>
`;

const encodeText = (value: string): Uint8Array => {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i += 1) {
    const char = encoded[i];
    if (char === "%") {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }
  return new Uint8Array(bytes);
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let j = 0; j < 8; j += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

const crc32 = (data: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const writeUint16LE = (view: Uint8Array, offset: number, value: number) => {
  view[offset] = value & 0xff;
  view[offset + 1] = (value >>> 8) & 0xff;
};

const writeUint32LE = (view: Uint8Array, offset: number, value: number) => {
  view[offset] = value & 0xff;
  view[offset + 1] = (value >>> 8) & 0xff;
  view[offset + 2] = (value >>> 16) & 0xff;
  view[offset + 3] = (value >>> 24) & 0xff;
};

const concatParts = (parts: Uint8Array[], totalLength: number): Uint8Array => {
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const buildZip = (
  html: string,
  bgBytes: Uint8Array,
  layers: ExportedLayer[],
): Uint8Array => {
  const files = [
    { name: "index.html", data: encodeText(html) },
    { name: "assets/bg.jpg", data: bgBytes },
    ...layers.map((layer) => ({
      name: `assets/${layer.name}.svg`,
      data: layer.bytes,
    })),
  ];

  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const nameBytes = encodeText(file.name);
    const crc = crc32(file.data);
    const localHeader = new Uint8Array(30 + nameBytes.length);

    writeUint32LE(localHeader, 0, 0x04034b50);
    writeUint16LE(localHeader, 4, 20);
    writeUint16LE(localHeader, 6, 0);
    writeUint16LE(localHeader, 8, 0);
    writeUint16LE(localHeader, 10, 0);
    writeUint16LE(localHeader, 12, 0);
    writeUint32LE(localHeader, 14, crc);
    writeUint32LE(localHeader, 18, file.data.length);
    writeUint32LE(localHeader, 22, file.data.length);
    writeUint16LE(localHeader, 26, nameBytes.length);
    writeUint16LE(localHeader, 28, 0);
    localHeader.set(nameBytes, 30);

    localParts.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    writeUint32LE(centralHeader, 0, 0x02014b50);
    writeUint16LE(centralHeader, 4, 20);
    writeUint16LE(centralHeader, 6, 20);
    writeUint16LE(centralHeader, 8, 0);
    writeUint16LE(centralHeader, 10, 0);
    writeUint16LE(centralHeader, 12, 0);
    writeUint16LE(centralHeader, 14, 0);
    writeUint32LE(centralHeader, 16, crc);
    writeUint32LE(centralHeader, 20, file.data.length);
    writeUint32LE(centralHeader, 24, file.data.length);
    writeUint16LE(centralHeader, 28, nameBytes.length);
    writeUint16LE(centralHeader, 30, 0);
    writeUint16LE(centralHeader, 32, 0);
    writeUint16LE(centralHeader, 34, 0);
    writeUint16LE(centralHeader, 36, 0);
    writeUint32LE(centralHeader, 38, 0);
    writeUint32LE(centralHeader, 42, localOffset);
    centralHeader.set(nameBytes, 46);

    centralParts.push(centralHeader);
    localOffset += localHeader.length + file.data.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = new Uint8Array(22);
  writeUint32LE(endRecord, 0, 0x06054b50);
  writeUint16LE(endRecord, 4, 0);
  writeUint16LE(endRecord, 6, 0);
  writeUint16LE(endRecord, 8, files.length);
  writeUint16LE(endRecord, 10, files.length);
  writeUint32LE(endRecord, 12, centralSize);
  writeUint32LE(endRecord, 16, localOffset);
  writeUint16LE(endRecord, 20, 0);

  const totalLength = localOffset + centralSize + endRecord.length;
  return concatParts([...localParts, ...centralParts, endRecord], totalLength);
};

const runExport = async () => {
  postStatus("Validating selection...");
  const frame = ensureSingleFrameSelection();
  if (!frame) {
    return;
  }

  const backgroundInstance = findDescendantByNames(frame, [
    "background-image",
    "Background Image",
  ]);
  if (!backgroundInstance) {
    postError(
      "Missing background-image/Image/Video layer. Ensure the background photo is nested correctly.",
    );
    return;
  }

  const imageNode = findDescendantByNames(
    backgroundInstance as BaseNode & ChildrenMixin,
    ["Image/Video", "backgroundImage"],
  ) as SceneNode | null;
  if (!imageNode) {
    postError(
      "Missing background-image/Image/Video layer. Ensure the background photo is nested correctly.",
    );
    return;
  }

  postStatus("Exporting background JPG...");
  const bgBytes = await exportBackgroundJpg(imageNode);

  postStatus("Exporting overlay SVGs...");
  let layers: ExportedLayer[];
  try {
    layers = await exportOverlayLayers(frame);
  } catch (error) {
    postError(
      error instanceof Error
        ? error.message
        : "Failed to export overlay SVG.",
    );
    return;
  }

  postStatus("Building HTML...");
  const layersMarkup = layers
    .map((layer) => {
      const left = Math.round(layer.x);
      const top = Math.round(layer.y);
      return `<img class="layer" src="assets/${layer.name}.svg" alt="" style="left:${left}px; top:${top}px; width:${Math.round(layer.width)}px; height:${Math.round(layer.height)}px;" />`;
    })
    .join("");
  const html = buildHtml(frame.width, frame.height).replace(
    "{{layers}}",
    layersMarkup,
  );

  postStatus("Zipping assets...");
  const zipBytes = buildZip(html, bgBytes, layers);

  if (zipBytes.length > MAX_ZIP_BYTES) {
    postError(
      "Export exceeds 500kb. Reduce image size/crop or simplify artwork.",
    );
    return;
  }

  postStatus("Ready to download.");
  const payload: ZipMessage = {
    type: "zip",
    bytes: Array.from(zipBytes),
    filename: "html5-banner.zip",
  };
  figma.ui.postMessage(payload);
};

figma.ui.onmessage = (message: UiMessage) => {
  if (message.type === "export") {
    runExport().catch(() => {
      postError("Unexpected error while exporting.");
    });
  }
};
