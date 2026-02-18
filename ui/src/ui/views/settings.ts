import { html } from "lit";
import type { FolderTemplate } from "../../../../src/photo/folder-template.js";
import type { StudioProfile } from "../controllers/studio-profile.ts";
import type { UiSettings } from "../storage.ts";
import { formatPathLabel, type StorageConfig } from "../controllers/storage.ts";

export type SettingsViewState = {
  settings: UiSettings;
  connected: boolean;
  storageConfig: StorageConfig | null;
  folderTemplate: FolderTemplate | null;
  studioProfile: StudioProfile;
  onSettingsChange: (next: UiSettings) => void;
  onPickFolder: () => void;
  onChangeStorage: () => void;
  onChangeFolderTemplate: () => void;
  onEditProfile: () => void;
  onToggleProfileEnabled: (enabled: boolean) => void;
};

export function renderSettingsView(state: SettingsViewState) {
  const profile = state.studioProfile;
  const profileSummary =
    profile.completedSetup && profile.displayName
      ? profile.displayName + (profile.studioName ? ` / ${profile.studioName}` : "")
      : null;

  return html`
    <div style="max-width: 540px; display: flex; flex-direction: column; gap: 24px;">
      ${
        state.storageConfig
          ? html`
          <section>
            <h3 style="font-size: 0.9rem; margin: 0 0 8px;">Storage & Backup</h3>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.78rem; color: var(--muted); min-width: 60px;">Primary</span>
                <span
                  style="display: inline-flex; align-items: center; gap: 6px; background: var(--secondary); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; font-size: 0.82rem;"
                >
                  <span style="font-weight: 500;">${formatPathLabel(state.storageConfig.primaryDest)}</span>
                  <span class="mono" style="font-size: 0.72rem; color: var(--muted);">${state.storageConfig.primaryDest}</span>
                </span>
              </div>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 0.78rem; color: var(--muted); min-width: 60px;">Backup</span>
                <span
                  style="display: inline-flex; align-items: center; gap: 6px; background: var(--secondary); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; font-size: 0.82rem;"
                >
                  <span style="font-weight: 500;">${formatPathLabel(state.storageConfig.backupDest)}</span>
                  <span class="mono" style="font-size: 0.72rem; color: var(--muted);">${state.storageConfig.backupDest}</span>
                </span>
              </div>
              <div>
                <button
                  class="btn btn--sm"
                  @click=${state.onChangeStorage}
                  style="padding: 4px 12px; font-size: 0.78rem;"
                >Change\u2026</button>
              </div>
            </div>
          </section>
        `
          : html`
          <section>
            <h3 style="font-size: 0.9rem; margin: 0 0 8px;">Storage & Backup</h3>
            <p style="font-size: 0.82rem; color: var(--muted); margin: 0 0 8px;">No storage configured yet.</p>
            <button
              class="btn btn--sm primary"
              @click=${state.onChangeStorage}
              style="padding: 6px 14px; font-size: 0.82rem;"
            >Set Up Storage</button>
          </section>
        `
      }

      <section>
        <h3 style="font-size: 0.9rem; margin: 0 0 8px;">Folder Structure</h3>
        ${
          state.folderTemplate
            ? html`
            <div style="display: flex; align-items: center; gap: 10px;">
              <span
                style="display: inline-flex; align-items: center; gap: 6px; background: var(--secondary); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; font-size: 0.82rem;"
              >
                <span style="font-weight: 500;">${state.folderTemplate.name}</span>
                <span style="font-size: 0.72rem; color: var(--muted);">${state.folderTemplate.description}</span>
              </span>
              <button
                class="btn btn--sm"
                @click=${state.onChangeFolderTemplate}
                style="padding: 4px 12px; font-size: 0.78rem;"
              >Change\u2026</button>
            </div>
          `
            : html`
            <p style="font-size: 0.82rem; color: var(--muted); margin: 0 0 8px;">No folder template configured. Using classic layout.</p>
            <button
              class="btn btn--sm primary"
              @click=${state.onChangeFolderTemplate}
              style="padding: 6px 14px; font-size: 0.82rem;"
            >Choose Template</button>
          `
        }
      </section>

      <section>
        <h3 style="font-size: 0.9rem; margin: 0 0 8px;">Default save location</h3>
        <div style="display: flex; gap: 6px; align-items: stretch;">
          <input
            type="text"
            class="mono"
            .value=${state.settings.defaultSaveLocation}
            @input=${(e: InputEvent) =>
              state.onSettingsChange({
                ...state.settings,
                defaultSaveLocation: (e.target as HTMLInputElement).value,
              })}
            style="flex: 1; background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; color: var(--text); font-size: 0.85rem;"
          />
          <button
            class="btn btn--sm"
            @click=${state.onPickFolder}
            ?disabled=${!state.connected}
            style="padding: 6px 12px; white-space: nowrap;"
          >Browse\u2026</button>
        </div>
      </section>

      <section>
        <h3 style="font-size: 0.9rem; margin: 0 0 8px;">Import speed</h3>
        <div style="display: flex; gap: 6px;">
          <button
            class="btn btn--sm ${state.settings.defaultVerifyMode === "none" ? "primary" : ""}"
            style="flex: 1; padding: 6px 10px; font-size: 0.78rem;"
            @click=${() => state.onSettingsChange({ ...state.settings, defaultVerifyMode: "none" })}
          >
            <div style="font-weight: 600;">Fast</div>
            <div style="font-size: 0.7rem; color: ${state.settings.defaultVerifyMode === "none" ? "inherit" : "var(--muted)"};">Hash during copy, skip verification</div>
          </button>
          <button
            class="btn btn--sm ${state.settings.defaultVerifyMode === "sentinel" ? "primary" : ""}"
            style="flex: 1; padding: 6px 10px; font-size: 0.78rem;"
            @click=${() =>
              state.onSettingsChange({ ...state.settings, defaultVerifyMode: "sentinel" })}
          >
            <div style="font-weight: 600;">Careful</div>
            <div style="font-size: 0.7rem; color: ${state.settings.defaultVerifyMode === "sentinel" ? "inherit" : "var(--muted)"};">Hash + verify a sample after copy</div>
          </button>
        </div>
      </section>

      <section>
        <h3 style="font-size: 0.9rem; margin: 0 0 8px;">Studio Profile</h3>
        ${
          profileSummary
            ? html`
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
              <span
                style="display: inline-flex; align-items: center; gap: 6px; background: var(--secondary); border: 1px solid var(--border); border-radius: 999px; padding: 4px 12px; font-size: 0.82rem;"
              >
                <span style="font-weight: 500;">${profileSummary}</span>
                <span style="font-size: 0.72rem; color: var(--muted);">${profile.enabled ? "On" : "Off"}</span>
              </span>
              <button
                class="btn btn--sm"
                @click=${state.onEditProfile}
                style="padding: 4px 12px; font-size: 0.78rem;"
              >Edit</button>
            </div>
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input
                type="checkbox"
                .checked=${profile.enabled}
                @change=${(e: Event) =>
                  state.onToggleProfileEnabled((e.target as HTMLInputElement).checked)}
              />
              <span style="font-size: 0.85rem;">Add this to new imports</span>
            </label>
          `
            : html`
            <p style="font-size: 0.82rem; color: var(--muted); margin: 0 0 8px;">No profile set up yet.</p>
            <button
              class="btn btn--sm primary"
              @click=${state.onEditProfile}
              style="padding: 6px 14px; font-size: 0.82rem;"
            >Add Studio Profile</button>
          `
        }
        <details style="margin-top: 10px;">
          <summary style="font-size: 0.75rem; color: var(--muted); cursor: pointer;">What does this do?</summary>
          <p style="font-size: 0.75rem; color: var(--muted); margin: 6px 0 0;">
            BaxBot saves this info in a small helper file next to each photo so apps like Lightroom
            can read it. Your original photos are never changed.
          </p>
        </details>
      </section>

      <section>
        <h3 style="font-size: 0.9rem; margin: 0 0 8px;">Developer Mode</h3>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input
            type="checkbox"
            .checked=${state.settings.developerMode}
            @change=${(e: Event) =>
              state.onSettingsChange({
                ...state.settings,
                developerMode: (e.target as HTMLInputElement).checked,
              })}
          />
          <span style="font-size: 0.85rem;">Show advanced tools (chat, channels, sessions)</span>
        </label>
      </section>
    </div>
  `;
}
