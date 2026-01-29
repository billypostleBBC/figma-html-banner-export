import { strToU8, zipSync } from "fflate";

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

const findDescendantByName = (
  root: BaseNode & ChildrenMixin,
  name: string,
): BaseNode | null => root.findOne((node) => node.name === name);

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

const exportOverlaySvg = async (frame: FrameNode): Promise<Uint8Array> => {
  let clone: FrameNode | null = null;
  try {
    clone = frame.clone();
    clone.name = `${frame.name} - overlay export`;
    clone.x = frame.x + frame.width + 100;
    clone.y = frame.y;
    figma.currentPage.appendChild(clone);

    const cloneBackground = findDescendantByName(
      clone,
      "background-image",
    );
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

    const cloneImageNode = findDescendantByName(
      editableBackground,
      "Image/Video",
    ) as SceneNode | null;
    if (!cloneImageNode) {
      throw new Error(
        "Missing background-image/Image/Video layer. Ensure the background photo is nested correctly.",
      );
    }
    cloneImageNode.remove();

    return await clone.exportAsync({
      format: "SVG",
      constraint: { type: "SCALE", value: 1 },
    });
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
      #overlay {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
      }
      #bg {
        object-fit: cover;
      }
      #overlay {
        pointer-events: none;
      }
    </style>
  </head>
  <body>
    <div id="ad" role="button" tabindex="0" aria-label="Advertisement">
      <img id="bg" src="assets/bg.jpg" alt="" />
      <img id="overlay" src="assets/overlay.svg" alt="" />
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

const buildZip = (
  html: string,
  bgBytes: Uint8Array,
  overlayBytes: Uint8Array,
): Uint8Array =>
  zipSync({
    "index.html": strToU8(html),
    "assets/bg.jpg": bgBytes,
    "assets/overlay.svg": overlayBytes,
  });

const runExport = async () => {
  postStatus("Validating selection...");
  const frame = ensureSingleFrameSelection();
  if (!frame) {
    return;
  }

  const backgroundInstance = findDescendantByName(
    frame,
    "background-image",
  );
  if (!backgroundInstance) {
    postError(
      "Missing background-image/Image/Video layer. Ensure the background photo is nested correctly.",
    );
    return;
  }

  const imageNode = findDescendantByName(
    backgroundInstance as BaseNode & ChildrenMixin,
    "Image/Video",
  ) as SceneNode | null;
  if (!imageNode) {
    postError(
      "Missing background-image/Image/Video layer. Ensure the background photo is nested correctly.",
    );
    return;
  }

  postStatus("Exporting background JPG...");
  const bgBytes = await exportBackgroundJpg(imageNode);

  postStatus("Exporting overlay SVG...");
  let overlayBytes: Uint8Array;
  try {
    overlayBytes = await exportOverlaySvg(frame);
  } catch (error) {
    postError(
      error instanceof Error
        ? error.message
        : "Failed to export overlay SVG.",
    );
    return;
  }

  postStatus("Building HTML...");
  const html = buildHtml(frame.width, frame.height);

  postStatus("Zipping assets...");
  const zipBytes = buildZip(html, bgBytes, overlayBytes);

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
