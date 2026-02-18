import path from "node:path";
import type { TriageFileResult, TriageParams, TriageResult } from "./triage-types.js";
import type { OnProgress } from "./types.js";
import { checkBlackFrame, checkCorruption } from "./triage-checks.js";

export async function runTriage(
  params: TriageParams,
  onProgress?: OnProgress,
): Promise<TriageResult> {
  const startMs = Date.now();

  // Only triage files that were successfully copied
  const toAnalyze = params.files.filter((f) => f.status === "copied");
  const flaggedFiles: TriageFileResult[] = [];
  let unreadableCount = 0;
  let blackFrameCount = 0;

  for (let i = 0; i < toAnalyze.length; i++) {
    const entry = toAnalyze[i];
    const absPath = path.join(params.projectRoot, entry.dst_rel);
    const flags = [];

    // Corruption / readability check
    const corruptionFlag = await checkCorruption(absPath);
    if (corruptionFlag) {
      flags.push(corruptionFlag);
      unreadableCount++;
    }

    // Black frame detection (only if file is readable and is an image)
    if (!corruptionFlag && entry.media_type) {
      const blackFlag = await checkBlackFrame(absPath, entry.media_type);
      if (blackFlag) {
        flags.push(blackFlag);
        blackFrameCount++;
      }
    }

    // Attach flags to the file entry
    if (flags.length > 0) {
      entry.triage_flags = flags;
      flaggedFiles.push({
        src_rel: entry.src_rel,
        dst_rel: entry.dst_rel,
        flags,
      });
    }

    // Emit progress every 10 files
    if (onProgress && (i + 1) % 10 === 0) {
      onProgress({
        type: "ingest.triage.progress",
        analyzed_count: i + 1,
        analyzed_total: toAnalyze.length,
        flagged_count: flaggedFiles.length,
      });
    }
  }

  // Final progress event
  if (onProgress && toAnalyze.length > 0) {
    onProgress({
      type: "ingest.triage.progress",
      analyzed_count: toAnalyze.length,
      analyzed_total: toAnalyze.length,
      flagged_count: flaggedFiles.length,
    });
  }

  const elapsedMs = Date.now() - startMs;

  const result: TriageResult = {
    version: 1,
    ran_at: new Date().toISOString(),
    elapsed_ms: elapsedMs,
    file_count: toAnalyze.length,
    unreadable_count: unreadableCount,
    black_frame_count: blackFrameCount,
    flagged_files: flaggedFiles,
  };

  // Emit done event
  onProgress?.({
    type: "ingest.triage.done",
    unreadable_count: unreadableCount,
    black_frame_count: blackFrameCount,
    elapsed_ms: elapsedMs,
  });

  return result;
}
