import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FileEntry, IngestManifest, IngestParams, OnProgress } from "./types.js";
import { VERSION } from "../version.js";
import { copyFileWithHash } from "./copy.js";
import { hashFile } from "./hash-transform.js";
import { writeManifest, writeProofReport } from "./report.js";
import { scanSourceFiles } from "./scan.js";
import { verifyFiles } from "./verify.js";

const PROJECT_SUBDIRS = [
  "01_RAW",
  "02_EXPORTS",
  "03_DELIVERY",
  ".cullmate/manifests",
  ".cullmate/reports",
] as const;

function expandTilde(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

export async function runIngest(
  params: IngestParams,
  onProgress?: OnProgress,
): Promise<IngestManifest> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  // Expand ~ in paths
  params = {
    ...params,
    source_path: expandTilde(params.source_path),
    dest_project_path: expandTilde(params.dest_project_path),
  };

  // Validate source
  const srcStat = await fs.stat(params.source_path);
  if (!srcStat.isDirectory()) {
    throw new Error(`source_path is not a directory: ${params.source_path}`);
  }

  // Build project root
  const projectRoot = path.join(params.dest_project_path, params.project_name);
  const destRoot = path.join(projectRoot, "01_RAW");
  const cullmateDir = path.join(projectRoot, ".cullmate");

  // Create project structure
  for (const sub of PROJECT_SUBDIRS) {
    await fs.mkdir(path.join(projectRoot, sub), { recursive: true, mode: 0o700 });
  }

  onProgress?.({
    type: "ingest.start",
    source_path: params.source_path,
    project_root: projectRoot,
  });

  // Scan source files
  const scanned = await scanSourceFiles(params.source_path, onProgress);

  // Emit final scan count
  onProgress?.({ type: "ingest.scan.progress", discovered_count: scanned.length });

  // Copy files (with optional content-based deduplication)
  const files: FileEntry[] = [];
  let totalBytesCopied = 0;
  const dedupeEnabled = params.dedupe === true;
  const dedupeMap = dedupeEnabled ? new Map<string, string>() : null; // hash → first dst_rel
  let duplicateCount = 0;
  let bytesSaved = 0;

  for (let i = 0; i < scanned.length; i++) {
    const sf = scanned[i];
    const dstRel = path.join("01_RAW", sf.rel_path);
    const dstPath = path.join(destRoot, sf.rel_path);

    // Pre-hash source to detect duplicates before copying (only when dedupe is on)
    if (dedupeMap) {
      const srcHash = await hashFile(sf.abs_path, params.hash_algo);
      const existingDst = dedupeMap.get(srcHash);

      if (existingDst) {
        // Duplicate — skip the copy entirely
        const stat = await fs.stat(sf.abs_path);
        duplicateCount++;
        bytesSaved += stat.size;

        files.push({
          src_rel: sf.rel_path,
          dst_rel: dstRel,
          bytes: stat.size,
          hash: srcHash,
          status: "skipped_duplicate",
          duplicate_of: existingDst,
        });

        onProgress?.({
          type: "ingest.copy.progress",
          index: i + 1,
          total: scanned.length,
          rel_path: sf.rel_path,
          bytes_copied: 0,
          total_bytes_copied: totalBytesCopied,
        });

        onProgress?.({
          type: "ingest.dedupe.hit",
          rel_path: sf.rel_path,
          duplicate_of: existingDst,
          bytes_saved_total: bytesSaved,
          duplicate_count_total: duplicateCount,
        });

        continue;
      }
    }

    const result = await copyFileWithHash({
      src: sf.abs_path,
      dst: dstPath,
      hash_algo: params.hash_algo,
      overwrite: params.overwrite,
    });

    const entry: FileEntry = {
      src_rel: sf.rel_path,
      dst_rel: dstRel,
      bytes: result.bytes,
      hash: result.hash,
      status: result.status,
      error: result.error,
    };

    files.push(entry);

    if (result.status === "copied") {
      totalBytesCopied += result.bytes;
      dedupeMap?.set(result.hash, dstRel);
    }

    onProgress?.({
      type: "ingest.copy.progress",
      index: i + 1,
      total: scanned.length,
      rel_path: sf.rel_path,
      bytes_copied: result.bytes,
      total_bytes_copied: totalBytesCopied,
    });
  }

  // Verify
  if (params.verify_mode !== "none") {
    await verifyFiles(files, projectRoot, params.hash_algo, params.verify_mode, onProgress);
  }

  // Build totals
  const successCount = files.filter((f) => f.status === "copied").length;
  const failCount = files.filter((f) => f.status === "error").length;
  const skipCount = files.filter((f) => f.status === "skipped_exists").length;
  const verifiedFiles = files.filter((f) => f.verified !== undefined);
  const verifiedOk = files.filter((f) => f.verified === true).length;
  const verifiedMismatch = files.filter((f) => f.verified === false).length;

  const manifest: IngestManifest = {
    tool_version: 1,
    app_version: VERSION,
    source_path: params.source_path,
    dest_root: destRoot,
    project_root: projectRoot,
    project_name: params.project_name,
    hash_algo: params.hash_algo,
    verify_mode: params.verify_mode,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    totals: {
      file_count: files.length,
      success_count: successCount,
      fail_count: failCount,
      skip_count: skipCount,
      duplicate_count: duplicateCount,
      bytes_saved: bytesSaved,
      total_bytes: totalBytesCopied,
      verified_count: verifiedFiles.length,
      verified_ok: verifiedOk,
      verified_mismatch: verifiedMismatch,
    },
    files,
  };

  // Write manifest and report
  const manifestPath = await writeManifest(cullmateDir, manifest);
  manifest.manifest_path = manifestPath;

  const reportPath = await writeProofReport(cullmateDir, manifest);
  manifest.report_path = reportPath;

  // Re-write manifest now that it includes paths
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), {
    mode: 0o600,
  });

  onProgress?.({
    type: "ingest.report.generated",
    manifest_path: manifestPath,
    report_path: reportPath,
  });

  const elapsedMs = Date.now() - startMs;
  onProgress?.({
    type: "ingest.done",
    success_count: successCount,
    fail_count: failCount,
    elapsed_ms: elapsedMs,
  });

  return manifest;
}
