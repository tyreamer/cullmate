import { html, nothing } from "lit";
import type { VolumeEntry } from "../controllers/ingest.ts";
import type { StorageConfig } from "../controllers/storage.ts";
import { formatPathLabel, getVolumeRoot } from "../controllers/storage.ts";

export type StorageSetupState = {
  primaryDest: string;
  backupDest: string;
  volumes: VolumeEntry[];
  volumesLoading: boolean;
  connected: boolean;
  /** Pre-fill from existing config when editing (not first-run). */
  editing?: boolean;
  onPrimaryChange: (path: string) => void;
  onBackupChange: (path: string) => void;
  onPickPrimary: () => void;
  onPickBackup: () => void;
  onSave: (cfg: StorageConfig) => void;
  onCancel?: () => void;
};

function isSamePath(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  const normalize = (p: string) => p.replace(/\/+$/, "").toLowerCase();
  return normalize(a) === normalize(b);
}

function isSameVolume(a: string, b: string): boolean {
  if (!a || !b) {
    return false;
  }
  return getVolumeRoot(a) === getVolumeRoot(b);
}

function renderVolumeCards(
  volumes: VolumeEntry[],
  selectedPath: string,
  onSelect: (path: string) => void,
) {
  if (volumes.length === 0) {
    return nothing;
  }
  // Sort: external volumes (/Volumes/...) first
  const sorted = [...volumes].toSorted((a, b) => {
    const aExt = a.path.startsWith("/Volumes/") ? 0 : 1;
    const bExt = b.path.startsWith("/Volumes/") ? 0 : 1;
    return aExt - bExt;
  });
  return html`
    <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px;">
      ${sorted.map(
        (v) => html`
          <button
            class="btn btn--sm ${isSamePath(v.path, selectedPath) ? "primary" : ""}"
            style="padding: 8px 14px; font-size: 0.82rem; border-radius: var(--radius-sm); cursor: pointer; min-width: 100px; text-align: left;"
            @click=${() => onSelect(v.path)}
            title=${v.path}
          >
            <div style="font-weight: 600;">${v.name}</div>
            <div class="mono" style="font-size: 0.7rem; color: ${isSamePath(v.path, selectedPath) ? "inherit" : "var(--muted)"}; opacity: 0.8;">${v.path}</div>
          </button>
        `,
      )}
    </div>
  `;
}

function renderSelectedPath(path: string | null) {
  if (!path) {
    return html`
      <span style="color: var(--muted); font-style: italic; font-size: 0.82rem">None selected</span>
    `;
  }
  return html`
    <span
      style="display: inline-flex; align-items: center; gap: 6px; background: var(--secondary); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; font-size: 0.82rem;"
    >
      <span style="font-weight: 500;">${formatPathLabel(path)}</span>
      <span class="mono" style="font-size: 0.72rem; color: var(--muted);">${path}</span>
    </span>
  `;
}

export function renderStorageSetup(state: StorageSetupState) {
  const sameFolder = isSamePath(state.primaryDest, state.backupDest);
  const sameVolume =
    !sameFolder &&
    state.primaryDest &&
    state.backupDest &&
    isSameVolume(state.primaryDest, state.backupDest);
  const canSave = state.primaryDest.trim() && state.backupDest.trim() && !sameFolder;

  return html`
    <div class="exec-approval-overlay" role="dialog" aria-label="Set up Storage & Backup">
      <div class="exec-approval-card" style="width: min(600px, 95vw);">
        <div class="exec-approval-header">
          <div>
            <div class="exec-approval-title">Set up Storage & Backup</div>
            <div class="exec-approval-sub">Choose where to save your photos and a backup copy</div>
          </div>
          ${
            state.editing && state.onCancel
              ? html`<button class="btn btn--sm" @click=${state.onCancel} aria-label="Close"
                style="font-size: 1.1rem; line-height: 1; padding: 4px 8px;">&#x2715;</button>`
              : nothing
          }
        </div>

        <div style="display: flex; flex-direction: column; gap: 20px; margin-top: 16px;">
          <!-- Step 1: Primary -->
          <section>
            <h3 style="font-size: 0.9rem; margin: 0 0 6px;">
              <span style="background: var(--accent); color: var(--on-accent, #fff); border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700; margin-right: 6px;">1</span>
              Primary (Working Copy)
            </h3>
            <p style="font-size: 0.78rem; color: var(--muted); margin: 0 0 8px;">This is where you'll work from. Defaults to your Pictures folder.</p>
            ${renderVolumeCards(
              state.volumes.filter((v) => !v.path.startsWith("/Volumes/")),
              state.primaryDest,
              state.onPrimaryChange,
            )}
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              ${renderSelectedPath(state.primaryDest || null)}
              <button
                class="btn btn--sm"
                @click=${state.onPickPrimary}
                ?disabled=${!state.connected}
                style="padding: 4px 12px; font-size: 0.78rem;"
              >Choose Folder\u2026</button>
            </div>
          </section>

          <!-- Step 2: Backup -->
          <section>
            <h3 style="font-size: 0.9rem; margin: 0 0 6px;">
              <span style="background: var(--accent); color: var(--on-accent, #fff); border-radius: 50%; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.72rem; font-weight: 700; margin-right: 6px;">2</span>
              Backup (Second Copy)
            </h3>
            <p style="font-size: 0.78rem; color: var(--muted); margin: 0 0 8px;">Choose an external drive or separate location for your backup.</p>
            ${renderVolumeCards(
              state.volumes.filter((v) => v.path.startsWith("/Volumes/")),
              state.backupDest,
              state.onBackupChange,
            )}
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              ${renderSelectedPath(state.backupDest || null)}
              <button
                class="btn btn--sm"
                @click=${state.onPickBackup}
                ?disabled=${!state.connected}
                style="padding: 4px 12px; font-size: 0.78rem;"
              >Choose Folder\u2026</button>
            </div>
          </section>

          <!-- Validation -->
          ${
            sameFolder
              ? html`
                  <div
                    style="
                      background: rgba(198, 40, 40, 0.1);
                      border: 1px solid var(--danger);
                      border-radius: var(--radius-sm);
                      padding: 10px 12px;
                      font-size: 0.82rem;
                      color: var(--danger);
                    "
                  >
                    Primary and Backup cannot be the same folder.
                  </div>
                `
              : nothing
          }
          ${
            sameVolume
              ? html`
                  <div
                    style="
                      background: rgba(245, 124, 0, 0.1);
                      border: 1px solid var(--warn);
                      border-radius: var(--radius-sm);
                      padding: 10px 12px;
                      font-size: 0.82rem;
                      color: var(--warn);
                    "
                  >
                    Not recommended \u2014 backup should be on a different drive.
                  </div>
                `
              : nothing
          }

          <p style="font-size: 0.75rem; color: var(--muted); margin: 0;">Cullmate never deletes originals. You'll get a receipt when it's safe.</p>

          <div class="exec-approval-actions">
            <button class="btn primary" ?disabled=${!canSave} @click=${() => {
              if (canSave) {
                state.onSave({
                  primaryDest: state.primaryDest.trim(),
                  backupDest: state.backupDest.trim(),
                });
              }
            }}>
              Save & Continue
            </button>
            ${
              state.editing && state.onCancel
                ? html`<button class="btn" @click=${state.onCancel}>Cancel</button>`
                : nothing
            }
          </div>
        </div>
      </div>
    </div>
  `;
}
