import { html, nothing } from "lit";
import type { FolderTemplate } from "../../../../src/photo/folder-template.js";
import type {
  IngestProgress,
  IngestResult,
  IngestStage,
  RecentProject,
  SuggestedSource,
} from "../controllers/ingest.ts";
import { formatPathLabel } from "../controllers/storage.ts";

export type IngestViewState = {
  stage: IngestStage;
  sourcePath: string;
  destPath: string;
  projectName: string;
  verifyMode: "none" | "sentinel";
  dedupeEnabled: boolean;
  progress: IngestProgress | null;
  result: IngestResult | null;
  error: string | null;
  connected: boolean;
  recentProjects: RecentProject[];
  suggestedSources: SuggestedSource[];
  folderTemplate: FolderTemplate | null;
  onSourcePathChange: (v: string) => void;
  onDestPathChange: (v: string) => void;
  onProjectNameChange: (v: string) => void;
  onVerifyModeChange: (v: "none" | "sentinel") => void;
  onDedupeChange: (v: boolean) => void;
  onSelectRecent: (p: RecentProject) => void;
  onPickSource: () => void;
  onPickDest: () => void;
  onChangeStorage?: () => void;
  onChangeFolderTemplate?: () => void;
  onSelectSuggestedSource: (s: SuggestedSource) => void;
  onStart: () => void;
  onClose: () => void;
  onOpenReport: () => void;
  onRevealProject: () => void;
};

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

function truncateFilename(name: string, max = 30): string {
  if (name.length <= max) {
    return name;
  }
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
  const base = name.slice(0, max - ext.length - 3);
  return `${base}...${ext}`;
}

function formatElapsed(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const mins = Math.floor(ms / 60_000);
  const secs = Math.round((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

// Track when copy started for throughput calculation
let copyStartMs = 0;

function progressLabel(p: IngestProgress | null): string {
  if (!p) {
    return "Starting...";
  }
  switch (p.type) {
    case "ingest.start":
      return "Preparing project folder...";
    case "ingest.scan.progress":
      return `Scanning for photos and videos... (${p.discovered_count ?? 0} found)`;
    case "ingest.copy.progress": {
      if (!copyStartMs) {
        copyStartMs = Date.now();
      }
      const filename = p.rel_path
        ? truncateFilename(p.rel_path.split("/").pop() ?? p.rel_path)
        : "";
      let throughput = "";
      if (p.total_bytes_copied && copyStartMs) {
        const elapsedSec = (Date.now() - copyStartMs) / 1000;
        if (elapsedSec > 0.5) {
          const mbps = p.total_bytes_copied / (1024 * 1024) / elapsedSec;
          throughput = ` (${mbps.toFixed(1)} MB/s)`;
        }
      }
      return `Copying file ${p.index} of ${p.total} \u2014 ${filename}${throughput}`;
    }
    case "ingest.verify.progress":
      return `Verifying integrity... (${p.verified_count ?? 0} of ${p.verified_total ?? 0})`;
    case "ingest.backup.start":
      return "Starting backup copy...";
    case "ingest.backup.copy.progress": {
      const filename = p.rel_path
        ? truncateFilename(p.rel_path.split("/").pop() ?? p.rel_path)
        : "";
      return `Backup: copying file ${p.index} of ${p.total} \u2014 ${filename}`;
    }
    case "ingest.backup.verify.progress":
      return `Verifying backup... (${p.verified_count ?? 0} of ${p.verified_total ?? 0})`;
    case "ingest.report.generated":
      return "Writing Safety Report...";
    case "ingest.done": {
      copyStartMs = 0;
      return "Complete!";
    }
    default:
      return "Processing...";
  }
}

function progressPercent(p: IngestProgress | null): number {
  if (!p) {
    return 0;
  }
  if (p.type === "ingest.copy.progress" && p.total) {
    return Math.round(((p.index ?? 0) / p.total) * 100);
  }
  if (p.type === "ingest.backup.copy.progress" && p.total) {
    return Math.round(((p.index ?? 0) / p.total) * 100);
  }
  if (p.type === "ingest.done") {
    return 100;
  }
  return -1; // indeterminate
}

export function renderIngestModal(state: IngestViewState) {
  if (state.stage === "idle") {
    return nothing;
  }

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-label="Import Photos">
      <div class="exec-approval-card" style="width: min(580px, 95vw);">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">Import Photos</div>
            <div class="exec-approval-sub">
              ${
                state.stage === "prompting"
                  ? "Copy from your card and get a Safety Report"
                  : state.stage === "running"
                    ? "Importing..."
                    : state.stage === "done"
                      ? "Complete"
                      : "Error"
              }
            </div>
          </div>
          ${
            state.stage !== "running"
              ? html`<button class="btn btn--sm" @click=${state.onClose} aria-label="Close"
                style="font-size: 1.1rem; line-height: 1; padding: 4px 8px;">&#x2715;</button>`
              : nothing
          }
        </div>

        ${state.stage === "prompting" ? renderPromptForm(state) : nothing}
        ${state.stage === "running" ? renderProgress(state) : nothing}
        ${state.stage === "done" ? renderDone(state) : nothing}
        ${state.stage === "error" ? renderError(state) : nothing}
      </div>
    </div>
  `;
}

function truncatePath(p: string, max = 40): string {
  if (p.length <= max) {
    return p;
  }
  return "..." + p.slice(p.length - max + 3);
}

function renderRecentProjects(state: IngestViewState) {
  if (state.recentProjects.length === 0) {
    return nothing;
  }
  return html`
    <div style="margin-bottom: 4px;">
      <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; margin-bottom: 6px;">Recent</div>
      ${state.recentProjects.map(
        (p) => html`
          <button
            class="btn btn--sm"
            style="display: flex; align-items: center; gap: 8px; width: 100%; text-align: left; padding: 6px 8px; margin-bottom: 2px; background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); cursor: pointer; font-size: 0.78rem;"
            @click=${() => state.onSelectRecent(p)}
          >
            <span style="font-weight: 500; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.projectName}</span>
            <span class="mono" style="color: var(--muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${truncatePath(p.sourcePath)}</span>
            <span style="color: var(--muted); margin-left: auto; flex-shrink: 0; font-size: 0.7rem;">${new Date(p.timestamp).toLocaleDateString()}</span>
          </button>
        `,
      )}
    </div>
  `;
}

function renderSuggestedSources(state: IngestViewState) {
  if (state.suggestedSources.length === 0) {
    return nothing;
  }
  return html`
    <div style="margin-bottom: 4px;">
      <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase; margin-bottom: 6px;">Detected Sources</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${state.suggestedSources.slice(0, 3).map(
          (s) => html`
            <button
              class="btn btn--sm"
              style="padding: 4px 10px; font-size: 0.78rem; background: var(--accent); color: var(--on-accent, #fff); border: none; border-radius: 999px; cursor: pointer;"
              @click=${() => state.onSelectSuggestedSource(s)}
              title=${s.path}
            >${s.label}</button>
          `,
        )}
      </div>
    </div>
  `;
}

function renderPromptForm(state: IngestViewState) {
  const canStart =
    state.sourcePath.trim() && state.destPath.trim() && state.projectName.trim() && state.connected;
  const dedupeNote = state.dedupeEnabled ? " \u00b7 Skips duplicates" : "";
  const modeLabel =
    state.verifyMode === "none"
      ? `Creates a Safety Report${dedupeNote} \u00b7 Copy only (never deletes originals)`
      : `Creates a Safety Report \u00b7 Verifies a sample after copy${dedupeNote} \u00b7 Copy only (never deletes originals)`;
  return html`
    <div style="display: flex; flex-direction: column; gap: 12px; margin-top: 12px;">
      ${renderSuggestedSources(state)}
      ${renderRecentProjects(state)}
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span style="font-size: 0.8rem; color: var(--muted);">Source (SD card or photo folder)</span>
        <div style="display: flex; gap: 6px; align-items: stretch;">
          <input
            type="text"
            class="mono"
            placeholder="Choose your SD card or photo folder"
            .value=${state.sourcePath}
            @input=${(e: InputEvent) => state.onSourcePathChange((e.target as HTMLInputElement).value)}
            style="flex: 1; background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; color: var(--text); font-size: 0.85rem;"
          />
          <button
            class="btn btn--sm"
            @click=${state.onPickSource}
            ?disabled=${!state.connected}
            title="Browse for source folder"
            style="padding: 6px 12px; white-space: nowrap;"
          >Choose&hellip;</button>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 4px;">
        <span style="font-size: 0.8rem; color: var(--muted);">Save to</span>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span
            style="display: inline-flex; align-items: center; gap: 6px; background: var(--secondary); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; font-size: 0.82rem;"
          >
            <span style="font-weight: 500;">${formatPathLabel(state.destPath)}</span>
            <span class="mono" style="font-size: 0.72rem; color: var(--muted);">${state.destPath}</span>
          </span>
          ${
            state.onChangeStorage
              ? html`<button
                class="btn btn--sm"
                @click=${state.onChangeStorage}
                style="padding: 4px 10px; font-size: 0.75rem;"
              >Change\u2026</button>`
              : html`<button
                class="btn btn--sm"
                @click=${state.onPickDest}
                ?disabled=${!state.connected}
                style="padding: 4px 10px; font-size: 0.75rem;"
              >Change\u2026</button>`
          }
        </div>
      </div>
      <label style="display: flex; flex-direction: column; gap: 4px;">
        <span style="font-size: 0.8rem; color: var(--muted);">Project name</span>
        <input
          type="text"
          placeholder="WeddingShoot_2026"
          .value=${state.projectName}
          @input=${(e: InputEvent) => state.onProjectNameChange((e.target as HTMLInputElement).value)}
          style="background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; color: var(--text); font-size: 0.85rem;"
        />
      </label>
      ${
        state.folderTemplate
          ? html`
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 0.78rem; color: var(--muted);">Structure:</span>
            <span
              style="display: inline-flex; align-items: center; gap: 4px; background: var(--secondary); border: 1px solid var(--border); border-radius: 999px; padding: 2px 10px; font-size: 0.78rem;"
            >
              <span style="font-weight: 500;">${state.folderTemplate.name}</span>
            </span>
            ${
              state.onChangeFolderTemplate
                ? html`<button
                  class="btn btn--sm"
                  @click=${state.onChangeFolderTemplate}
                  style="padding: 2px 8px; font-size: 0.72rem;"
                >Change</button>`
                : nothing
            }
          </div>
        `
          : nothing
      }
      <div style="display: flex; gap: 6px;">
        <button
          class="btn btn--sm ${state.verifyMode === "none" ? "primary" : ""}"
          style="flex: 1; padding: 6px 10px; font-size: 0.78rem;"
          @click=${() => state.onVerifyModeChange("none")}
        >
          <div style="font-weight: 600;">Fast</div>
          <div style="font-size: 0.7rem; color: ${state.verifyMode === "none" ? "inherit" : "var(--muted)"};">Hash during copy, skip verification</div>
        </button>
        <button
          class="btn btn--sm ${state.verifyMode === "sentinel" ? "primary" : ""}"
          style="flex: 1; padding: 6px 10px; font-size: 0.78rem;"
          @click=${() => state.onVerifyModeChange("sentinel")}
        >
          <div style="font-weight: 600;">Careful</div>
          <div style="font-size: 0.7rem; color: ${state.verifyMode === "sentinel" ? "inherit" : "var(--muted)"};">Hash + verify a sample after copy</div>
        </button>
      </div>
      <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 0;">
        <input
          type="checkbox"
          .checked=${state.dedupeEnabled}
          @change=${(e: Event) => state.onDedupeChange((e.target as HTMLInputElement).checked)}
        />
        <span style="font-size: 0.82rem;">Skip duplicate files</span>
      </label>
      <div style="font-size: 0.75rem; color: var(--muted); padding: 4px 0;">
        ${modeLabel}
      </div>
      <div class="exec-approval-actions">
        <button class="btn primary" ?disabled=${!canStart} @click=${state.onStart}>
          Start Import
        </button>
        <button class="btn" @click=${state.onClose}>Cancel</button>
      </div>
    </div>
  `;
}

function renderProgress(state: IngestViewState) {
  const label = progressLabel(state.progress);
  const pct = progressPercent(state.progress);
  return html`
    <div style="margin-top: 16px;">
      <div style="font-size: 0.85rem; color: var(--text); margin-bottom: 8px; word-break: break-all;">${label}</div>
      <div style="background: var(--secondary); border-radius: var(--radius-sm); height: 6px; overflow: hidden;">
        ${
          pct >= 0
            ? html`<div style="background: var(--accent); height: 100%; width: ${pct}%; transition: width 0.2s ease;"></div>`
            : html`
                <div
                  style="
                    background: var(--accent);
                    height: 100%;
                    width: 30%;
                    animation: ingest-progress-pulse 1.2s ease-in-out infinite;
                  "
                ></div>
              `
        }
      </div>
      <style>
        @keyframes ingest-progress-pulse {
          0%, 100% { opacity: 0.4; transform: translateX(-100%); }
          50% { opacity: 1; transform: translateX(230%); }
        }
      </style>
    </div>
  `;
}

function renderSafeToFormatBanner(result: IngestResult | null) {
  if (!result) {
    return nothing;
  }
  if (result.safe_to_format === true) {
    return html`
      <div
        style="
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px 16px;
          border-radius: var(--radius-sm);
          margin-bottom: 12px;
          background: rgba(46, 125, 50, 0.1);
          border: 2px solid var(--ok);
        "
      >
        <span style="font-size: 1.5rem; color: var(--ok)">&#x2713;</span>
        <div>
          <div style="font-weight: 700; font-size: 0.95rem; color: var(--ok)">
            You can eject your card
          </div>
          <div style="font-size: 0.78rem; color: var(--muted)">
            Every photo was copied and double-checked. Your backup is ready too.
          </div>
        </div>
      </div>
    `;
  }
  if (result.safe_to_format === false) {
    const hasBackup =
      (result.totals?.backup_success_count ?? 0) > 0 || (result.totals?.backup_fail_count ?? 0) > 0;
    return html`
      <div style="display: flex; align-items: center; gap: 10px; padding: 12px 16px; border-radius: var(--radius-sm); margin-bottom: 12px; background: rgba(198, 40, 40, 0.1); border: 2px solid var(--danger);">
        <span style="font-size: 1.5rem; color: var(--danger);">&#x2717;</span>
        <div>
          <div style="font-weight: 700; font-size: 0.95rem; color: var(--danger);">Don\u2019t eject yet</div>
          <div style="font-size: 0.78rem; color: var(--muted);">${hasBackup ? "Some files failed to copy or verify. Check the Safety Report for details." : "No backup configured. Set up backup in Settings first."}</div>
        </div>
      </div>`;
  }
  return nothing;
}

function renderDone(state: IngestViewState) {
  const t = state.result?.totals;
  const elapsed = state.progress?.elapsed_ms;
  const throughput =
    elapsed && t?.total_bytes
      ? formatBytes(Math.round(t.total_bytes / (elapsed / 1000))) + "/s"
      : null;
  return html`
    <div style="margin-top: 12px;">
      ${renderSafeToFormatBanner(state.result)}
      ${
        t
          ? html`
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px;">
            <div style="background: var(--secondary); padding: 10px; border-radius: var(--radius-sm);">
              <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">Copied</div>
              <div style="font-size: 1.2rem; font-weight: 600; color: var(--ok);">${t.success_count}</div>
            </div>
            <div style="background: var(--secondary); padding: 10px; border-radius: var(--radius-sm);">
              <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">Total size</div>
              <div style="font-size: 1.2rem; font-weight: 600;">${formatBytes(t.total_bytes)}</div>
            </div>
            ${
              elapsed
                ? html`<div style="background: var(--secondary); padding: 10px; border-radius: var(--radius-sm);">
                  <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">Elapsed</div>
                  <div style="font-size: 1.2rem; font-weight: 600;">${formatElapsed(elapsed)}</div>
                </div>`
                : nothing
            }
            ${
              throughput
                ? html`<div style="background: var(--secondary); padding: 10px; border-radius: var(--radius-sm);">
                  <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">Throughput</div>
                  <div style="font-size: 1.2rem; font-weight: 600;">${throughput}</div>
                </div>`
                : nothing
            }
            ${
              t.verified_count > 0
                ? html`<div style="background: var(--secondary); padding: 10px; border-radius: var(--radius-sm);">
                  <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">Verified</div>
                  <div style="font-size: 1.2rem; font-weight: 600; color: ${t.verified_mismatch > 0 ? "var(--danger)" : "var(--ok)"};">${t.verified_ok}/${t.verified_count}</div>
                </div>`
                : nothing
            }
            ${
              t.backup_success_count > 0
                ? html`<div style="background: var(--secondary); padding: 10px; border-radius: var(--radius-sm);">
                  <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">Backup</div>
                  <div style="font-size: 1.2rem; font-weight: 600; color: ${t.backup_fail_count > 0 ? "var(--danger)" : "var(--ok)"};">${t.backup_success_count} copied</div>
                </div>`
                : nothing
            }
            ${
              t.backup_verified_count > 0
                ? html`<div style="background: var(--secondary); padding: 10px; border-radius: var(--radius-sm);">
                  <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">Backup verified</div>
                  <div style="font-size: 1.2rem; font-weight: 600; color: ${t.backup_verified_mismatch > 0 ? "var(--danger)" : "var(--ok)"};">${t.backup_verified_ok}/${t.backup_verified_count}</div>
                </div>`
                : nothing
            }
            ${
              t.skip_count > 0
                ? html`<div style="background: var(--secondary); padding: 10px; border-radius: var(--radius-sm);">
                  <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">Skipped</div>
                  <div style="font-size: 1.2rem; font-weight: 600; color: var(--warn);">${t.skip_count}</div>
                </div>`
                : nothing
            }
            ${
              t.fail_count > 0
                ? html`<div style="background: var(--secondary); padding: 10px; border-radius: var(--radius-sm);">
                  <div style="font-size: 0.7rem; color: var(--muted); text-transform: uppercase;">Failed</div>
                  <div style="font-size: 1.2rem; font-weight: 600; color: var(--danger);">${t.fail_count}</div>
                </div>`
                : nothing
            }
          </div>
        `
          : nothing
      }
      <div class="exec-approval-actions">
        <button class="btn primary" @click=${state.onOpenReport}>Open Safety Report</button>
        <button class="btn" @click=${state.onRevealProject}>Reveal in Finder</button>
        <button class="btn" @click=${state.onClose}>Close</button>
      </div>
    </div>
  `;
}

function renderError(state: IngestViewState) {
  return html`
    <div style="margin-top: 12px;">
      <div style="background: rgba(198, 40, 40, 0.1); border: 1px solid var(--danger); border-radius: var(--radius-sm); padding: 12px; color: var(--danger); font-size: 0.85rem; margin-bottom: 16px;">
        ${state.error ?? "Unknown error"}
      </div>
      <div class="exec-approval-actions">
        <button class="btn" @click=${state.onClose}>Close</button>
      </div>
    </div>
  `;
}
