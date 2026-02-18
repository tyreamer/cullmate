import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { FolderTemplate, RoutingRule } from "./folder-template.js";
import type { ScannedFile } from "./scan.js";
import type { FileEntry, IngestManifest, IngestParams, OnProgress } from "./types.js";
import { VERSION } from "../version.js";
import { copyFileWithHash } from "./copy.js";
import { extractExifInfo } from "./exif-extract.js";
import { hashFile } from "./hash-transform.js";
import { writeManifest, writeProofReport } from "./report.js";
import { scanSourceFiles } from "./scan.js";
import { buildTokenContext } from "./template-context.js";
import { expandTemplate } from "./template-expand.js";
import { writeTriageCsv, writeTriageJson } from "./triage-report.js";
import { runTriage } from "./triage.js";
import { verifyFiles } from "./verify.js";
import { writeXmpSidecar } from "./xmp/xmp-sidecar.js";

const LEGACY_PROJECT_SUBDIRS = [
  "01_RAW",
  "02_EXPORTS",
  "03_DELIVERY",
  ".cullmate/manifests",
  ".cullmate/reports",
] as const;

const CULLMATE_DIRS = [".cullmate/manifests", ".cullmate/reports"] as const;

function expandTilde(p: string): string {
  if (p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Find the first routing rule matching a scanned file.
 * Rules without a `match` field are catch-alls and always match.
 */
function findMatchingRule(rules: RoutingRule[], file: ScannedFile): RoutingRule {
  const ext = path.extname(file.rel_path).toLowerCase();
  for (const rule of rules) {
    if (!rule.match) {
      return rule; // catch-all
    }
    if ("media_type" in rule.match && rule.match.media_type === file.media_type) {
      return rule;
    }
    if ("extensions" in rule.match && rule.match.extensions.some((e) => ext === e.toLowerCase())) {
      return rule;
    }
  }
  // Fallback: return last rule (should be a catch-all per validation)
  return rules[rules.length - 1];
}

/**
 * Build the list of directories to scaffold when a template is provided.
 */
function buildScaffoldDirs(template: FolderTemplate): string[] {
  const dirs: string[] = [...CULLMATE_DIRS];
  for (const dir of template.scaffold_dirs) {
    dirs.push(dir);
  }
  return dirs;
}

/**
 * Verify backup files by rehashing from the backup destination.
 * Mutates entries in place: sets backup_hash_dest and backup_verified fields.
 */
async function verifyBackupFiles(
  files: FileEntry[],
  backupProjectRoot: string,
  hashAlgo: string,
  mode: "sentinel" | "full",
  onProgress?: OnProgress,
): Promise<void> {
  // Only verify files that were successfully backed up
  const copied = files.filter((f) => f.backup_status === "copied");
  if (copied.length === 0) {
    return;
  }

  // For sentinel mode, select a subset; for full mode, verify all
  let toVerify: FileEntry[];
  if (mode === "full") {
    toVerify = copied;
  } else {
    // Sentinel: first 25 + last 25 by name + top 25 by size
    if (copied.length <= 75) {
      toVerify = copied;
    } else {
      const byName = copied.toSorted((a, b) => a.src_rel.localeCompare(b.src_rel));
      const bySize = copied.toSorted((a, b) => b.bytes - a.bytes);
      const selected = new Map<string, FileEntry>();
      for (const f of byName.slice(0, 25)) {
        selected.set(f.src_rel, f);
      }
      for (const f of byName.slice(-25)) {
        selected.set(f.src_rel, f);
      }
      for (const f of bySize.slice(0, 25)) {
        selected.set(f.src_rel, f);
      }
      toVerify = [...selected.values()];
    }
  }

  const total = toVerify.length;

  for (let i = 0; i < toVerify.length; i++) {
    const entry = toVerify[i];
    const destPath = path.join(backupProjectRoot, entry.dst_rel);

    try {
      entry.backup_hash_dest = await hashFile(destPath, hashAlgo);
      entry.backup_verified = entry.backup_hash_dest === entry.backup_hash;
    } catch (err) {
      entry.backup_hash_dest = "";
      entry.backup_verified = false;
      entry.backup_error = `backup verify failed: ${err instanceof Error ? err.message : String(err)}`;
    }

    if (onProgress && (i + 1) % 10 === 0) {
      onProgress({
        type: "ingest.backup.verify.progress",
        mode,
        verified_count: i + 1,
        verified_total: total,
      });
    }
  }

  // Final progress event
  if (onProgress && total > 0) {
    onProgress({
      type: "ingest.backup.verify.progress",
      mode,
      verified_count: total,
      verified_total: total,
    });
  }
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
    backup_dest: params.backup_dest ? expandTilde(params.backup_dest) : undefined,
  };

  // Validate source
  const srcStat = await fs.stat(params.source_path);
  if (!srcStat.isDirectory()) {
    throw new Error(`source_path is not a directory: ${params.source_path}`);
  }

  // Build project root
  const projectRoot = path.join(params.dest_project_path, params.project_name);
  const template = params.folder_template ?? null;
  const destRoot = template ? projectRoot : path.join(projectRoot, "01_RAW");
  const cullmateDir = path.join(projectRoot, ".cullmate");

  // Create project structure
  const scaffoldDirs = template ? buildScaffoldDirs(template) : [...LEGACY_PROJECT_SUBDIRS];
  for (const sub of scaffoldDirs) {
    await fs.mkdir(path.join(projectRoot, sub), { recursive: true, mode: 0o700 });
  }

  // Build backup paths (if backup_dest is provided)
  const hasBackup = Boolean(params.backup_dest);
  const backupProjectRoot = hasBackup ? path.join(params.backup_dest!, params.project_name) : null;
  const backupDestRoot = backupProjectRoot
    ? template
      ? backupProjectRoot
      : path.join(backupProjectRoot, "01_RAW")
    : null;

  // Create backup project structure
  if (backupProjectRoot) {
    for (const sub of scaffoldDirs) {
      await fs.mkdir(path.join(backupProjectRoot, sub), { recursive: true, mode: 0o700 });
    }
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

  // ── Phase 1: Primary copy (with optional content-based deduplication) ──
  const files: FileEntry[] = [];
  let totalBytesCopied = 0;
  const dedupeEnabled = params.dedupe === true;
  const dedupeMap = dedupeEnabled ? new Map<string, string>() : null; // hash → first dst_rel
  let duplicateCount = 0;
  let bytesSaved = 0;
  const importDate = new Date();
  const userContext = params.template_context ?? {};

  for (let i = 0; i < scanned.length; i++) {
    const sf = scanned[i];

    // Compute destination path: template-routed or legacy
    let dstRel: string;
    let routedByLabel: string | undefined;
    if (template) {
      const rule = findMatchingRule(template.routing_rules, sf);
      routedByLabel = rule.label;
      const ext = path.extname(sf.rel_path);
      const exif = await extractExifInfo(sf.abs_path);
      const ctx = buildTokenContext({
        mediaType: sf.media_type,
        ext,
        originalFilename: path.basename(sf.rel_path),
        exif,
        sourcePath: sf.abs_path,
        userContext,
        defaults: template.token_defaults,
        importDate,
      });
      const expandedDest = expandTemplate(rule.dest_pattern, ctx);
      dstRel = path.join(expandedDest, sf.rel_path);
    } else {
      dstRel = path.join("01_RAW", sf.rel_path);
    }

    const dstPath = path.join(projectRoot, dstRel);

    // Ensure the destination directory exists (for template-routed paths)
    if (template) {
      await fs.mkdir(path.dirname(dstPath), { recursive: true, mode: 0o700 });
    }

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
          media_type: sf.media_type,
          routed_by: routedByLabel,
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
      media_type: sf.media_type,
      routed_by: routedByLabel,
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

  // ── Phase 1.5: XMP sidecar writing (primary) ──
  if (params.xmp_patch) {
    const xmpFiles = files.filter((f) => f.status === "copied");
    let xmpWritten = 0;
    let xmpFailed = 0;

    for (let i = 0; i < xmpFiles.length; i++) {
      const entry = xmpFiles[i];
      try {
        const mediaAbsPath = path.join(projectRoot, entry.dst_rel);
        const result = await writeXmpSidecar(mediaAbsPath, params.xmp_patch);
        entry.sidecar_written = result.written;
        // Store relative sidecar path
        const relSidecar = path.relative(projectRoot, result.sidecarPath);
        entry.sidecar_path = relSidecar;
        if (result.error) {
          entry.sidecar_error = result.error;
        }
        if (result.written) {
          xmpWritten++;
        } else {
          xmpFailed++;
        }
      } catch (err) {
        entry.sidecar_written = false;
        entry.sidecar_error = err instanceof Error ? err.message : String(err);
        xmpFailed++;
      }

      if (onProgress && (i + 1) % 10 === 0) {
        onProgress({
          type: "ingest.xmp.progress",
          written_count: xmpWritten,
          failed_count: xmpFailed,
          total: xmpFiles.length,
        });
      }
    }

    // Final XMP progress event
    if (onProgress && xmpFiles.length > 0) {
      onProgress({
        type: "ingest.xmp.progress",
        written_count: xmpWritten,
        failed_count: xmpFailed,
        total: xmpFiles.length,
      });
    }
  }

  // ── Phase 2: Primary verify ──
  if (params.verify_mode !== "none") {
    await verifyFiles(files, projectRoot, params.hash_algo, params.verify_mode, onProgress);
  }

  // ── Phase 3: Backup copy ──
  if (backupDestRoot && backupProjectRoot) {
    onProgress?.({ type: "ingest.backup.start", backup_root: backupDestRoot });

    // Only copy files that were successfully copied to primary (skip duplicates/errors/skipped)
    const filesToBackup = files.filter(
      (f) => f.status === "copied" || f.status === "skipped_exists",
    );
    let backupBytesCopied = 0;

    for (let i = 0; i < filesToBackup.length; i++) {
      const entry = filesToBackup[i];
      const backupDstPath = path.join(backupProjectRoot, entry.dst_rel);

      const result = await copyFileWithHash({
        src: path.join(projectRoot, entry.dst_rel),
        dst: backupDstPath,
        hash_algo: params.hash_algo,
        overwrite: params.overwrite,
      });

      entry.backup_status = result.status;
      entry.backup_hash = result.hash;
      if (result.error) {
        entry.backup_error = result.error;
      }

      if (result.status === "copied") {
        backupBytesCopied += result.bytes;
      }

      onProgress?.({
        type: "ingest.backup.copy.progress",
        index: i + 1,
        total: filesToBackup.length,
        rel_path: entry.src_rel,
        bytes_copied: result.bytes,
        total_bytes_copied: backupBytesCopied,
      });
    }

    // ── Phase 3.5: Backup XMP sidecar writing ──
    if (params.xmp_patch) {
      const backupXmpFiles = filesToBackup.filter((f) => f.backup_status === "copied");
      for (let i = 0; i < backupXmpFiles.length; i++) {
        const entry = backupXmpFiles[i];
        try {
          const backupMediaPath = path.join(backupProjectRoot, entry.dst_rel);
          await writeXmpSidecar(backupMediaPath, params.xmp_patch);
        } catch {
          // Backup sidecar failures are silently ignored
        }
      }
    }

    // ── Phase 4: Backup verify ──
    if (params.verify_mode !== "none") {
      await verifyBackupFiles(
        files,
        backupProjectRoot,
        params.hash_algo,
        params.verify_mode,
        onProgress,
      );
    }
  }

  // ── Build totals ──
  const successCount = files.filter((f) => f.status === "copied").length;
  const failCount = files.filter((f) => f.status === "error").length;
  const skipCount = files.filter((f) => f.status === "skipped_exists").length;
  const verifiedFiles = files.filter((f) => f.verified !== undefined);
  const verifiedOk = files.filter((f) => f.verified === true).length;
  const verifiedMismatch = files.filter((f) => f.verified === false).length;

  const backupSuccessCount = files.filter((f) => f.backup_status === "copied").length;
  const backupFailCount = files.filter((f) => f.backup_status === "error").length;
  const backupVerifiedFiles = files.filter((f) => f.backup_verified !== undefined);
  const backupVerifiedOk = files.filter((f) => f.backup_verified === true).length;
  const backupVerifiedMismatch = files.filter((f) => f.backup_verified === false).length;

  // safe_to_format: TRUE only if:
  // 1. A backup destination was provided
  // 2. Zero primary copy failures
  // 3. Zero backup copy failures
  // 4. Zero primary verification mismatches
  // 5. Zero backup verification mismatches
  // 6. All files that were copied to primary were also copied to backup
  let safeToFormat =
    hasBackup &&
    failCount === 0 &&
    backupFailCount === 0 &&
    verifiedMismatch === 0 &&
    backupVerifiedMismatch === 0 &&
    successCount + skipCount ===
      backupSuccessCount + files.filter((f) => f.backup_status === "skipped_exists").length;

  // ── Phase 5: Triage pass ──
  const triageResult = await runTriage({ files, projectRoot }, onProgress);

  // If unreadable files found, override safe_to_format
  if (triageResult.unreadable_count > 0) {
    safeToFormat = false;
  }

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
    backup_dest: params.backup_dest,
    backup_root: backupDestRoot ?? undefined,
    template_id: template?.template_id,
    safe_to_format: safeToFormat,
    triage: triageResult,
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
      backup_success_count: backupSuccessCount,
      backup_fail_count: backupFailCount,
      backup_verified_count: backupVerifiedFiles.length,
      backup_verified_ok: backupVerifiedOk,
      backup_verified_mismatch: backupVerifiedMismatch,
      xmp_written_count: files.filter((f) => f.sidecar_written === true).length,
      xmp_failed_count: files.filter((f) => f.sidecar_written === false).length,
      triage_unreadable_count: triageResult.unreadable_count,
      triage_black_frame_count: triageResult.black_frame_count,
    },
    files,
  };

  // Write manifest and report
  const manifestPath = await writeManifest(cullmateDir, manifest);
  manifest.manifest_path = manifestPath;

  const reportPath = await writeProofReport(cullmateDir, manifest);
  manifest.report_path = reportPath;

  // Write triage artifacts
  await writeTriageJson(cullmateDir, triageResult);
  await writeTriageCsv(cullmateDir, triageResult);

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
    safe_to_format: safeToFormat,
  });

  return manifest;
}
