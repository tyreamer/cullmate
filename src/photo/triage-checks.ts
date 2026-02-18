import fs from "node:fs/promises";
import path from "node:path";
import type { TriageFlag } from "./triage-types.js";

type Sharp = typeof import("sharp");

async function loadSharp(): Promise<Sharp> {
  const mod = (await import("sharp")) as unknown as { default?: Sharp };
  return mod.default ?? (mod as unknown as Sharp);
}

/** Extensions that Sharp can decode (images only, not video). */
const SHARP_DECODABLE = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".tif",
  ".tiff",
  ".heic",
  ".heif",
  ".webp",
  ".avif",
  ".cr2",
  ".cr3",
  ".nef",
  ".arw",
  ".dng",
  ".raf",
  ".rw2",
  ".orf",
  ".pef",
  ".srw",
]);

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov"]);

/** Map of file-type MIME prefixes we consider valid for images. */
const IMAGE_MIME_PREFIXES = ["image/"];
const VIDEO_MIME_PREFIXES = ["video/"];

/** Map of extensions to expected MIME types for mismatch detection. */
const EXT_TO_MIME = new Map<string, string[]>([
  [".jpg", ["image/jpeg"]],
  [".jpeg", ["image/jpeg"]],
  [".png", ["image/png"]],
  [".tif", ["image/tiff"]],
  [".tiff", ["image/tiff"]],
  [".heic", ["image/heic", "image/heif"]],
  [".heif", ["image/heic", "image/heif"]],
  [".webp", ["image/webp"]],
  [".avif", ["image/avif"]],
  [".mp4", ["video/mp4"]],
  [".mov", ["video/quicktime"]],
]);

/**
 * Check if a file's magic bytes indicate a readable format.
 * Returns a TriageFlag if the file appears corrupt/unreadable, null otherwise.
 */
export async function checkCorruption(filePath: string): Promise<TriageFlag | null> {
  const ext = path.extname(filePath).toLowerCase();
  const isVideo = VIDEO_EXTENSIONS.has(ext);

  // Step 1: Read first 4100 bytes for magic-byte detection
  const fd = await fs.open(filePath, "r");
  try {
    const buf = Buffer.alloc(4100);
    const { bytesRead } = await fd.read(buf, 0, 4100, 0);
    if (bytesRead === 0) {
      return {
        kind: "unreadable",
        reason: "File is empty (0 bytes readable)",
        confidence: 1.0,
      };
    }

    const sample = buf.subarray(0, bytesRead);

    // Step 2: Detect MIME via file-type
    const { fileTypeFromBuffer } = await import("file-type");
    const detected = await fileTypeFromBuffer(sample);

    if (!detected) {
      return {
        kind: "unreadable",
        reason: "File format not recognized — may be corrupt or incomplete",
        confidence: 0.9,
      };
    }

    // Step 3: Check MIME vs extension agreement
    const detectedMime = detected.mime;
    const isDetectedImage = IMAGE_MIME_PREFIXES.some((p) => detectedMime.startsWith(p));
    const isDetectedVideo = VIDEO_MIME_PREFIXES.some((p) => detectedMime.startsWith(p));
    const isExtImage = SHARP_DECODABLE.has(ext);
    const isExtVideo = VIDEO_EXTENSIONS.has(ext);

    // Flag mismatch: image extension but video content, or vice versa (broad category)
    if ((isExtImage && !isDetectedImage) || (isExtVideo && !isDetectedVideo)) {
      // Allow application/octet-stream for RAW files since file-type may not recognize all RAW formats
      if (detectedMime !== "application/octet-stream" || !isExtImage) {
        return {
          kind: "unreadable",
          reason: `File extension ${ext} does not match detected format ${detectedMime} — file may be renamed or corrupt`,
          confidence: 0.7,
        };
      }
    }

    // Specific extension-to-MIME check (e.g., .jpg containing PNG data)
    const expectedMimes = EXT_TO_MIME.get(ext);
    if (expectedMimes && !expectedMimes.includes(detectedMime)) {
      return {
        kind: "unreadable",
        reason: `File extension ${ext} does not match detected format ${detectedMime} — file may be renamed or corrupt`,
        confidence: 0.7,
      };
    }

    // Step 4: For images (not video), try Sharp metadata decode
    if (!isVideo && SHARP_DECODABLE.has(ext)) {
      try {
        const sharp = await loadSharp();
        await sharp(filePath).metadata();
      } catch {
        return {
          kind: "unreadable",
          reason: "Image file could not be decoded — file appears corrupt or truncated",
          confidence: 0.95,
        };
      }
    }

    return null;
  } finally {
    await fd.close();
  }
}

/**
 * Check if an image is a black/lens-cap frame by analyzing mean luminance.
 * Only runs on image files (RAW/PHOTO), not video.
 * Returns a TriageFlag if the frame is very dark, null otherwise.
 */
export async function checkBlackFrame(
  filePath: string,
  mediaType: string,
): Promise<TriageFlag | null> {
  // Skip video files
  if (mediaType === "VIDEO") {
    return null;
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!SHARP_DECODABLE.has(ext)) {
    return null;
  }

  try {
    const sharp = await loadSharp();
    const { data } = await sharp(filePath)
      .resize(64, 64, { fit: "inside" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Compute mean luminance
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i];
    }
    const meanLuminance = sum / data.length;

    if (meanLuminance < 5) {
      return {
        kind: "black_frame",
        reason: "Near-black frame — possible lens cap or accidental shot",
        confidence: 0.95,
        metric: Math.round(meanLuminance * 100) / 100,
      };
    }

    if (meanLuminance < 15) {
      return {
        kind: "black_frame",
        reason: "Very dark frame — may be a lens cap or intentional low-light shot",
        confidence: 0.7,
        metric: Math.round(meanLuminance * 100) / 100,
      };
    }

    return null;
  } catch {
    // If Sharp can't process the file, skip black-frame detection
    // (corruption check will catch truly broken files)
    return null;
  }
}
