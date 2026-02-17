import path from "node:path";
import type { FileEntry, OnProgress, VerifyMode } from "./types.js";
import { hashFile } from "./hash-transform.js";

/**
 * Select sentinel files for verification: first 25 + last 25 by name,
 * plus top 25 by size. Deduped.
 */
export function selectSentinelFiles(files: FileEntry[]): FileEntry[] {
  const copied = files.filter((f) => f.status === "copied");
  if (copied.length <= 75) {
    return copied;
  }

  const byName = copied.toSorted((a, b) => a.src_rel.localeCompare(b.src_rel));
  const bySize = copied.toSorted((a, b) => b.bytes - a.bytes);

  const selected = new Map<string, FileEntry>();

  // First 25 by name
  for (const f of byName.slice(0, 25)) {
    selected.set(f.src_rel, f);
  }
  // Last 25 by name
  for (const f of byName.slice(-25)) {
    selected.set(f.src_rel, f);
  }
  // Top 25 by size
  for (const f of bySize.slice(0, 25)) {
    selected.set(f.src_rel, f);
  }

  return [...selected.values()];
}

/**
 * Verify files by rehashing destination and comparing with copy-time hash.
 * Mutates entries in place: sets hash_dest and verified fields.
 */
export async function verifyFiles(
  files: FileEntry[],
  destRoot: string,
  hashAlgo: string,
  mode: VerifyMode,
  onProgress?: OnProgress,
): Promise<void> {
  const toVerify =
    mode === "full" ? files.filter((f) => f.status === "copied") : selectSentinelFiles(files);

  const total = toVerify.length;

  for (let i = 0; i < toVerify.length; i++) {
    const entry = toVerify[i];
    const destPath = path.join(destRoot, entry.dst_rel);

    try {
      entry.hash_dest = await hashFile(destPath, hashAlgo);
      entry.verified = entry.hash_dest === entry.hash;
    } catch (err) {
      entry.hash_dest = "";
      entry.verified = false;
      entry.error = `verify failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (onProgress && (i + 1) % 10 === 0) {
      onProgress({
        type: "ingest.verify.progress",
        mode,
        verified_count: i + 1,
        verified_total: total,
      });
    }
  }

  // Final progress event
  if (onProgress && total > 0) {
    onProgress({
      type: "ingest.verify.progress",
      mode,
      verified_count: total,
      verified_total: total,
    });
  }
}
