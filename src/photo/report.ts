import fs from "node:fs/promises";
import path from "node:path";
import type { IngestManifest } from "./types.js";

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

export async function writeManifest(
  cullmateDir: string,
  manifest: IngestManifest,
): Promise<string> {
  const dir = path.join(cullmateDir, "manifests");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const filename = `${timestamp()}_ingest.json`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, JSON.stringify(manifest, null, 2), {
    mode: 0o600,
  });
  return filePath;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function elapsed(start: string, end: string): string {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function renderSafeToFormatBanner(manifest: IngestManifest): string {
  if (!manifest.backup_dest) {
    return `
<div class="safe-banner safe-banner--warn">
  <div class="safe-banner__icon">&#x26A0;</div>
  <div>
    <div class="safe-banner__title">No Backup Configured</div>
    <div class="safe-banner__sub">Files were only copied to one destination. Do NOT format cards until you have a verified backup.</div>
  </div>
</div>`;
  }

  if (manifest.safe_to_format) {
    return `
<div class="safe-banner safe-banner--yes">
  <div class="safe-banner__icon">&#x2713;</div>
  <div>
    <div class="safe-banner__title">Safe to Format Cards: YES</div>
    <div class="safe-banner__sub">All files copied to both destinations. All verifications passed. Zero mismatches.</div>
  </div>
</div>`;
  }

  // Not safe: build reason
  const reasons: string[] = [];
  const t = manifest.totals;
  if (t.fail_count > 0) {
    reasons.push(`${t.fail_count} primary copy failure(s)`);
  }
  if (t.backup_fail_count > 0) {
    reasons.push(`${t.backup_fail_count} backup copy failure(s)`);
  }
  if (t.verified_mismatch > 0) {
    reasons.push(`${t.verified_mismatch} primary verification mismatch(es)`);
  }
  if (t.backup_verified_mismatch > 0) {
    reasons.push(`${t.backup_verified_mismatch} backup verification mismatch(es)`);
  }
  if (t.triage_unreadable_count > 0) {
    reasons.push(`${t.triage_unreadable_count} unreadable file(s) — possible corruption`);
  }

  return `
<div class="safe-banner safe-banner--no">
  <div class="safe-banner__icon">&#x2717;</div>
  <div>
    <div class="safe-banner__title">Safe to Format Cards: NO</div>
    <div class="safe-banner__sub">${reasons.length > 0 ? escapeHtml(reasons.join("; ")) : "Not all files were successfully copied and verified to both destinations."}</div>
  </div>
</div>`;
}

export async function writeProofReport(
  cullmateDir: string,
  manifest: IngestManifest,
): Promise<string> {
  const dir = path.join(cullmateDir, "reports");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const filename = `${timestamp()}_proof.html`;
  const filePath = path.join(dir, filename);

  const t = manifest.totals;
  const failures = manifest.files.filter((f) => f.status === "error");
  const mismatches = manifest.files.filter((f) => f.verified === false);
  const duplicates = manifest.files.filter((f) => f.status === "skipped_duplicate");
  const backupFailures = manifest.files.filter((f) => f.backup_status === "error");
  const backupMismatches = manifest.files.filter((f) => f.backup_verified === false);
  const triageUnreadable = manifest.files.filter((f) =>
    f.triage_flags?.some((fl) => fl.kind === "unreadable"),
  );
  const triageBlackFrames = manifest.files.filter((f) =>
    f.triage_flags?.some((fl) => fl.kind === "black_frame"),
  );
  const elapsedStr = elapsed(manifest.started_at, manifest.finished_at);

  let verifyExplanation = "";
  if (manifest.verify_mode === "none") {
    verifyExplanation =
      "No post-copy verification was performed. Hashes were computed during the copy pass only.";
  } else if (manifest.verify_mode === "sentinel") {
    verifyExplanation =
      "Sentinel verification: a representative subset of files (first, last, and largest) were re-read and re-hashed to confirm integrity.";
  } else {
    verifyExplanation =
      "Full verification: every copied file was re-read and re-hashed to confirm integrity.";
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>BaxBot Safety Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 2rem; color: #1a1a1a; background: #fafafa; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  .safe-banner { display: flex; align-items: center; gap: 16px; padding: 16px 20px; border-radius: 8px; margin-bottom: 1.5rem; font-size: 0.95rem; }
  .safe-banner__icon { font-size: 2rem; line-height: 1; flex-shrink: 0; }
  .safe-banner__title { font-weight: 700; font-size: 1.1rem; }
  .safe-banner__sub { font-size: 0.85rem; margin-top: 2px; }
  .safe-banner--yes { background: #e8f5e9; border: 2px solid #2e7d32; color: #1b5e20; }
  .safe-banner--yes .safe-banner__icon { color: #2e7d32; }
  .safe-banner--no { background: #ffebee; border: 2px solid #c62828; color: #b71c1c; }
  .safe-banner--no .safe-banner__icon { color: #c62828; }
  .safe-banner--warn { background: #fff3e0; border: 2px solid #f57c00; color: #e65100; }
  .safe-banner--warn .safe-banner__icon { color: #f57c00; }
  .summary { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 1.25rem; margin-bottom: 1.5rem; }
  .summary dt { font-weight: 600; display: inline; }
  .summary dd { display: inline; margin-left: 0.25rem; margin-right: 1.5rem; }
  .verify-note { background: #f0f4ff; border-left: 4px solid #4a7dff; padding: 0.75rem 1rem; margin-bottom: 1.5rem; border-radius: 0 4px 4px 0; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; font-size: 0.875rem; }
  th, td { border: 1px solid #ddd; padding: 0.4rem 0.6rem; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  tr.error { background: #fff0f0; }
  tr.mismatch { background: #fff3e0; }
  .mono { font-family: "SF Mono", Monaco, Consolas, monospace; font-size: 0.8rem; }
  .footer { margin-top: 2rem; font-size: 0.75rem; color: #888; border-top: 1px solid #ddd; padding-top: 0.5rem; }
  .status-copied { color: #2e7d32; }
  .status-skipped { color: #f57c00; }
  .status-error { color: #c62828; font-weight: 600; }
</style>
</head>
<body>
<h1>BaxBot Safety Report</h1>

${renderSafeToFormatBanner(manifest)}

<div class="summary">
  <dl>
    <dt>Project:</dt><dd>${escapeHtml(manifest.project_name)}</dd>
    <dt>Source:</dt><dd class="mono">${escapeHtml(manifest.source_path)}</dd><br>
    <dt>Primary:</dt><dd class="mono">${escapeHtml(manifest.dest_root)}</dd>${
      manifest.backup_root
        ? `
    <dt>Backup:</dt><dd class="mono">${escapeHtml(manifest.backup_root)}</dd>`
        : ""
    }<br>
    <dt>Files copied:</dt><dd>${t.success_count}</dd>
    <dt>Skipped:</dt><dd>${t.skip_count}</dd>${
      t.duplicate_count > 0
        ? `
    <dt>Duplicates skipped:</dt><dd>${t.duplicate_count} (${formatBytes(t.bytes_saved)} saved)</dd>`
        : ""
    }
    <dt>Failures:</dt><dd>${t.fail_count}</dd>
    <dt>Total size:</dt><dd>${formatBytes(t.total_bytes)}</dd>${
      manifest.backup_dest
        ? `<br>
    <dt>Backup copied:</dt><dd>${t.backup_success_count}</dd>
    <dt>Backup failures:</dt><dd>${t.backup_fail_count}</dd>`
        : ""
    }<br>
${t.xmp_written_count > 0 ? `    <dt>Photo info added:</dt><dd>${t.xmp_written_count} photos</dd>` : ""}${
    t.xmp_failed_count > 0
      ? `
    <dt>Photo info skipped:</dt><dd>${t.xmp_failed_count} photos</dd>`
      : ""
  }
${t.triage_unreadable_count > 0 || t.triage_black_frame_count > 0 ? `    <dt>Triage:</dt><dd>${t.triage_unreadable_count} unreadable, ${t.triage_black_frame_count} possible junk frames</dd>` : ""}
    <dt>Hash algorithm:</dt><dd>${escapeHtml(manifest.hash_algo)}</dd>
    <dt>Verify mode:</dt><dd>${escapeHtml(manifest.verify_mode)}</dd>
    <dt>Elapsed:</dt><dd>${elapsedStr}</dd>
    <dt>Started:</dt><dd>${escapeHtml(manifest.started_at)}</dd>
    <dt>Finished:</dt><dd>${escapeHtml(manifest.finished_at)}</dd>
  </dl>
</div>

<div class="verify-note">
  <strong>Verification:</strong> ${verifyExplanation}
  ${t.verified_count > 0 ? `<br>Primary: ${t.verified_ok}/${t.verified_count} OK${t.verified_mismatch > 0 ? `, <strong style="color:#c62828">${t.verified_mismatch} MISMATCH</strong>` : ""}` : ""}
  ${t.backup_verified_count > 0 ? `<br>Backup: ${t.backup_verified_ok}/${t.backup_verified_count} OK${t.backup_verified_mismatch > 0 ? `, <strong style="color:#c62828">${t.backup_verified_mismatch} MISMATCH</strong>` : ""}` : ""}
</div>

${
  triageUnreadable.length > 0
    ? `<div class="safe-banner safe-banner--no">
  <div class="safe-banner__icon">&#x26A0;</div>
  <div>
    <div class="safe-banner__title">${triageUnreadable.length} Unreadable File${triageUnreadable.length === 1 ? "" : "s"} Detected</div>
    <div class="safe-banner__sub">These files could not be decoded and may be corrupt. Do NOT format your cards until you verify them manually.</div>
  </div>
</div>

<h2>Unreadable Files (${triageUnreadable.length})</h2>
<table>
<tr><th>File</th><th>Reason</th><th>Confidence</th></tr>
${triageUnreadable
  .map((f) => {
    const flag = f.triage_flags!.find((fl) => fl.kind === "unreadable")!;
    return `<tr class="error"><td class="mono">${escapeHtml(f.src_rel)}</td><td>${escapeHtml(flag.reason)}</td><td>${Math.round(flag.confidence * 100)}%</td></tr>`;
  })
  .join("\n")}
</table>`
    : ""
}

${
  triageBlackFrames.length > 0
    ? `<h2>Possible Junk Frames (${triageBlackFrames.length})</h2>
<table>
<tr><th>File</th><th>Reason</th><th>Brightness</th></tr>
${triageBlackFrames
  .map((f) => {
    const flag = f.triage_flags!.find((fl) => fl.kind === "black_frame")!;
    return `<tr><td class="mono">${escapeHtml(f.src_rel)}</td><td>${escapeHtml(flag.reason)}</td><td>${flag.metric ?? "-"}/255</td></tr>`;
  })
  .join("\n")}
</table>`
    : ""
}

${
  failures.length > 0
    ? `<h2>Primary Failures (${failures.length})</h2>
<table>
<tr><th>File</th><th>Error</th></tr>
${failures.map((f) => `<tr class="error"><td class="mono">${escapeHtml(f.src_rel)}</td><td>${escapeHtml(f.error ?? "unknown")}</td></tr>`).join("\n")}
</table>`
    : ""
}

${
  backupFailures.length > 0
    ? `<h2>Backup Failures (${backupFailures.length})</h2>
<table>
<tr><th>File</th><th>Error</th></tr>
${backupFailures.map((f) => `<tr class="error"><td class="mono">${escapeHtml(f.src_rel)}</td><td>${escapeHtml(f.backup_error ?? "unknown")}</td></tr>`).join("\n")}
</table>`
    : ""
}

${
  mismatches.length > 0
    ? `<h2>Primary Verification Mismatches (${mismatches.length})</h2>
<table>
<tr><th>File</th><th>Copy Hash</th><th>Dest Hash</th></tr>
${mismatches.map((f) => `<tr class="mismatch"><td class="mono">${escapeHtml(f.src_rel)}</td><td class="mono">${escapeHtml(f.hash.slice(0, 16))}...</td><td class="mono">${escapeHtml((f.hash_dest ?? "").slice(0, 16))}...</td></tr>`).join("\n")}
</table>`
    : ""
}

${
  backupMismatches.length > 0
    ? `<h2>Backup Verification Mismatches (${backupMismatches.length})</h2>
<table>
<tr><th>File</th><th>Copy Hash</th><th>Backup Hash</th></tr>
${backupMismatches.map((f) => `<tr class="mismatch"><td class="mono">${escapeHtml(f.src_rel)}</td><td class="mono">${escapeHtml((f.backup_hash ?? "").slice(0, 16))}...</td><td class="mono">${escapeHtml((f.backup_hash_dest ?? "").slice(0, 16))}...</td></tr>`).join("\n")}
</table>`
    : ""
}

${
  duplicates.length > 0
    ? `<h2>Duplicates Skipped (${duplicates.length}) &mdash; mirror backups</h2>
<table>
<tr><th>Skipped File</th><th>Size</th><th>Hash</th><th>Duplicate Of</th></tr>
${duplicates.map((f) => `<tr><td class="mono">${escapeHtml(f.src_rel)}</td><td>${formatBytes(f.bytes)}</td><td class="mono">${f.hash ? escapeHtml(f.hash.slice(0, 16)) + "..." : "-"}</td><td class="mono">${escapeHtml(f.duplicate_of ?? "")}</td></tr>`).join("\n")}
</table>`
    : ""
}

<h2>All Files (${manifest.files.length})</h2>
<table>
<tr><th>Path</th><th>Size</th><th>Hash</th><th>Primary</th>${manifest.backup_dest ? "<th>Backup</th>" : ""}</tr>
${manifest.files
  .map((f) => {
    const statusClass = f.status === "error" ? "error" : f.verified === false ? "mismatch" : "";
    const statusLabel =
      f.status === "copied"
        ? '<span class="status-copied">copied</span>'
        : f.status === "skipped_exists"
          ? '<span class="status-skipped">skipped</span>'
          : f.status === "skipped_duplicate"
            ? '<span class="status-skipped">duplicate</span>'
            : '<span class="status-error">error</span>';
    const verifiedBadge =
      f.verified === true
        ? ' <span style="color:#2e7d32">&#x2713;</span>'
        : f.verified === false
          ? ' <span style="color:#c62828">&#x2717;</span>'
          : "";
    const backupCell = manifest.backup_dest
      ? `<td>${
          f.backup_status === "copied"
            ? '<span class="status-copied">copied</span>'
            : f.backup_status === "skipped_exists"
              ? '<span class="status-skipped">skipped</span>'
              : f.backup_status === "error"
                ? '<span class="status-error">error</span>'
                : f.status === "skipped_duplicate"
                  ? '<span class="status-skipped">-</span>'
                  : "-"
        }${
          f.backup_verified === true
            ? ' <span style="color:#2e7d32">&#x2713;</span>'
            : f.backup_verified === false
              ? ' <span style="color:#c62828">&#x2717;</span>'
              : ""
        }</td>`
      : "";
    return `<tr class="${statusClass}"><td class="mono">${escapeHtml(f.src_rel)}</td><td>${formatBytes(f.bytes)}</td><td class="mono">${f.hash ? escapeHtml(f.hash.slice(0, 16)) + "..." : "-"}</td><td>${statusLabel}${verifiedBadge}</td>${backupCell}</tr>`;
  })
  .join("\n")}
</table>

${manifest.manifest_path ? `<p>Manifest JSON: <span class="mono">${escapeHtml(manifest.manifest_path)}</span></p>` : ""}

<div class="footer">
  Generated by BaxBot v${escapeHtml(manifest.app_version)} &middot; tool_version ${manifest.tool_version}
</div>
</body>
</html>`;

  await fs.writeFile(filePath, html, { mode: 0o600 });
  return filePath;
}
