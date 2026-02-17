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
<title>Cullmate Import Receipt</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; margin: 2rem; color: #1a1a1a; background: #fafafa; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
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
<h1>Cullmate Import Receipt</h1>
<div class="summary">
  <dl>
    <dt>Project:</dt><dd>${escapeHtml(manifest.project_name)}</dd>
    <dt>Source:</dt><dd class="mono">${escapeHtml(manifest.source_path)}</dd>
    <dt>Destination:</dt><dd class="mono">${escapeHtml(manifest.dest_root)}</dd><br>
    <dt>Files copied:</dt><dd>${t.success_count}</dd>
    <dt>Skipped:</dt><dd>${t.skip_count}</dd>${
      t.duplicate_count > 0
        ? `
    <dt>Duplicates skipped:</dt><dd>${t.duplicate_count} (${formatBytes(t.bytes_saved)} saved)</dd>`
        : ""
    }
    <dt>Failures:</dt><dd>${t.fail_count}</dd>
    <dt>Total size:</dt><dd>${formatBytes(t.total_bytes)}</dd><br>
    <dt>Hash algorithm:</dt><dd>${escapeHtml(manifest.hash_algo)}</dd>
    <dt>Verify mode:</dt><dd>${escapeHtml(manifest.verify_mode)}</dd>
    <dt>Elapsed:</dt><dd>${elapsedStr}</dd>
    <dt>Started:</dt><dd>${escapeHtml(manifest.started_at)}</dd>
    <dt>Finished:</dt><dd>${escapeHtml(manifest.finished_at)}</dd>
  </dl>
</div>

<div class="verify-note">
  <strong>Verification:</strong> ${verifyExplanation}
  ${t.verified_count > 0 ? `<br>Verified: ${t.verified_ok}/${t.verified_count} OK${t.verified_mismatch > 0 ? `, <strong style="color:#c62828">${t.verified_mismatch} MISMATCH</strong>` : ""}` : ""}
</div>

${
  failures.length > 0
    ? `<h2>Failures (${failures.length})</h2>
<table>
<tr><th>File</th><th>Error</th></tr>
${failures.map((f) => `<tr class="error"><td class="mono">${escapeHtml(f.src_rel)}</td><td>${escapeHtml(f.error ?? "unknown")}</td></tr>`).join("\n")}
</table>`
    : ""
}

${
  mismatches.length > 0
    ? `<h2>Verification Mismatches (${mismatches.length})</h2>
<table>
<tr><th>File</th><th>Copy Hash</th><th>Dest Hash</th></tr>
${mismatches.map((f) => `<tr class="mismatch"><td class="mono">${escapeHtml(f.src_rel)}</td><td class="mono">${escapeHtml(f.hash.slice(0, 16))}...</td><td class="mono">${escapeHtml((f.hash_dest ?? "").slice(0, 16))}...</td></tr>`).join("\n")}
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
<tr><th>Path</th><th>Size</th><th>Hash</th><th>Status</th></tr>
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
    return `<tr class="${statusClass}"><td class="mono">${escapeHtml(f.src_rel)}</td><td>${formatBytes(f.bytes)}</td><td class="mono">${f.hash ? escapeHtml(f.hash.slice(0, 16)) + "..." : "-"}</td><td>${statusLabel}${verifiedBadge}</td></tr>`;
  })
  .join("\n")}
</table>

${manifest.manifest_path ? `<p>Manifest JSON: <span class="mono">${escapeHtml(manifest.manifest_path)}</span></p>` : ""}

<div class="footer">
  Generated by Cullmate v${escapeHtml(manifest.app_version)} &middot; tool_version ${manifest.tool_version}
</div>
</body>
</html>`;

  await fs.writeFile(filePath, html, { mode: 0o600 });
  return filePath;
}
