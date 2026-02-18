import path from "node:path";
import type { ExifInfo } from "./exif-extract.js";
import type { MediaType } from "./folder-template.js";
import type { TokenContext } from "./template-expand.js";

export type TokenContextParams = {
  mediaType: MediaType;
  ext: string;
  originalFilename: string;
  exif: ExifInfo | null;
  sourcePath: string;
  userContext: Record<string, string>;
  defaults: Record<string, string>;
  importDate: Date;
};

/**
 * Build a TokenContext for a single file.
 * Resolution order: userContext > EXIF-derived > defaults > hardcoded fallback.
 */
export function buildTokenContext(params: TokenContextParams): TokenContext {
  const { exif, importDate, userContext, defaults } = params;

  // EXIF-derived values
  const captureDate = exif?.captureDate ?? importDate;
  const yyyy = String(captureDate.getFullYear());
  const mm = String(captureDate.getMonth() + 1).padStart(2, "0");
  const dd = String(captureDate.getDate()).padStart(2, "0");

  const cameraModel = exif?.cameraModel ?? null;
  const cameraSerial = exif?.cameraSerial ?? null;
  const serialShort = cameraSerial ? cameraSerial.slice(-6) : "";
  const cameraLabel = buildCameraLabel(cameraModel, serialShort);

  // Source path info
  const sourceDir = path.basename(path.dirname(params.sourcePath));

  // Build base context from EXIF and file info
  const base: TokenContext = {
    YYYY: yyyy,
    MM: mm,
    DD: dd,
    MEDIA_TYPE: params.mediaType,
    CAMERA_MODEL: cameraModel ?? "Unknown",
    CAMERA_SERIAL_SHORT: serialShort,
    CAMERA_LABEL: cameraLabel,
    CARD_LABEL: sourceDir,
    EXT: params.ext.replace(/^\./, "").toLowerCase(),
    ORIGINAL_FILENAME: path.parse(params.originalFilename).name,
  };

  // Layer: defaults < base < userContext
  const ctx: TokenContext = {};
  for (const [key, value] of Object.entries(defaults)) {
    ctx[key] = value;
  }
  for (const [key, value] of Object.entries(base)) {
    if (value) {
      ctx[key] = value;
    }
  }
  for (const [key, value] of Object.entries(userContext)) {
    if (value) {
      ctx[key] = value;
    }
  }

  return ctx;
}

function buildCameraLabel(model: string | null, serialShort: string): string {
  if (!model) {
    return "Unknown";
  }
  // Simplify common camera model names
  const clean = model.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_.-]/g, "");
  if (serialShort) {
    return `${clean}_${serialShort}`;
  }
  return clean;
}
