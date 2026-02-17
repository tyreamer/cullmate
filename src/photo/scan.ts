import fs from "node:fs/promises";
import path from "node:path";
import type { OnProgress } from "./types.js";

/**
 * Suggest a project name from the source path.
 * Returns `YYYYMMDD_<lastSegment>` with special chars replaced by `_`.
 */
export function suggestProjectName(sourcePath: string): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const segments = sourcePath.split(/[/\\]/).filter(Boolean);
  const last = segments.at(-1);
  if (!last) {
    return ymd;
  }
  const sanitized = last.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ymd}_${sanitized}`;
}

const MEDIA_EXTENSIONS = new Set([
  // RAW
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
  // IMG
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".tif",
  ".tiff",
  // VID
  ".mp4",
  ".mov",
]);

export type ScannedFile = {
  rel_path: string;
  abs_path: string;
  size: number;
};

export async function scanSourceFiles(
  sourcePath: string,
  onProgress?: OnProgress,
): Promise<ScannedFile[]> {
  const entries = await fs.readdir(sourcePath, {
    recursive: true,
    withFileTypes: true,
  });

  const files: ScannedFile[] = [];

  for (const entry of entries) {
    // Skip dotfiles and dot-directories
    if (entry.name.startsWith(".")) {
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!MEDIA_EXTENSIONS.has(ext)) {
      continue;
    }

    const absPath = path.join(entry.parentPath, entry.name);
    const relPath = path.relative(sourcePath, absPath);

    const stat = await fs.stat(absPath);
    files.push({
      rel_path: relPath,
      abs_path: absPath,
      size: stat.size,
    });

    if (onProgress && files.length % 100 === 0) {
      onProgress({ type: "ingest.scan.progress", discovered_count: files.length });
    }
  }

  // Sort by relative path for deterministic order
  files.sort((a, b) => a.rel_path.localeCompare(b.rel_path));

  return files;
}
