import { html, nothing } from "lit";
import type { FolderTemplate } from "../../../../src/photo/folder-template.js";
import type { SmartOrganizerStatus } from "../controllers/ai-provider.ts";
import { renderFolderTreePreview } from "./folder-tree-preview.ts";

export type FolderTemplatePickerState = {
  presets: FolderTemplate[];
  selectedTemplate: FolderTemplate | null;
  customTemplate: FolderTemplate | null;
  // Smart Organizer state (replaces Ollama-specific props)
  smartOrganizerStatus: SmartOrganizerStatus;
  smartOrganizerPrompt: string;
  smartOrganizerGenerating: boolean;
  smartOrganizerError: string | null;
  smartOrganizerStatusMessage: string | null;
  // Dev-only details
  developerMode: boolean;
  devProviderInfo: string | null;
  onSelectPreset: (t: FolderTemplate) => void;
  onPromptChange: (v: string) => void;
  onGenerate: () => void;
  onTurnOnSmartOrganizer: () => void;
  onSave: (t: FolderTemplate) => void;
  onSkip?: () => void;
  onCancel?: () => void;
};

export function renderFolderTemplatePicker(state: FolderTemplatePickerState) {
  const selected = state.customTemplate ?? state.selectedTemplate;
  const isReady = state.smartOrganizerStatus === "ready";

  return html`
    <div style="max-width: 600px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px;">
      <div>
        <h2 style="font-size: 1.1rem; margin: 0 0 4px;">Folder Structure</h2>
        <p style="font-size: 0.82rem; color: var(--muted); margin: 0;">
          Choose how imported files are organized in your project folders.
        </p>
      </div>

      <!-- Preset cards grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px;">
        ${state.presets.map(
          (preset) => html`
            <button
              class="btn"
              style="
                display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
                padding: 12px; text-align: left; cursor: pointer;
                background: ${state.selectedTemplate?.template_id === preset.template_id && !state.customTemplate ? "var(--accent)" : "var(--secondary)"};
                color: ${state.selectedTemplate?.template_id === preset.template_id && !state.customTemplate ? "var(--on-accent, #fff)" : "var(--text)"};
                border: 2px solid ${state.selectedTemplate?.template_id === preset.template_id && !state.customTemplate ? "var(--accent)" : "var(--border)"};
                border-radius: var(--radius-sm);
              "
              @click=${() => state.onSelectPreset(preset)}
            >
              <div style="font-weight: 600; font-size: 0.85rem;">${preset.name}</div>
              <div style="font-size: 0.72rem; opacity: 0.8;">${preset.description}</div>
            </button>
          `,
        )}
      </div>

      <!-- Custom layout section -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div>
          <div style="font-size: 0.85rem; font-weight: 600; color: var(--text);">
            Custom layout
            <span style="font-size: 0.75rem; font-weight: 400; color: var(--muted);"> (optional)</span>
          </div>
          <div style="font-size: 0.78rem; color: var(--muted); margin-top: 2px;">
            Describe how you want your project folders organized.
          </div>
        </div>
        <textarea
          placeholder="RAW in 01 RAW by camera, videos in VIDEO, exports in DELIVERY."
          .value=${state.smartOrganizerPrompt}
          @input=${(e: InputEvent) => state.onPromptChange((e.target as HTMLTextAreaElement).value)}
          ?disabled=${!isReady && state.smartOrganizerStatus !== "not_installed"}
          rows="2"
          style="flex: 1; background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; color: var(--text); font-size: 0.82rem; resize: vertical; font-family: inherit;"
        ></textarea>
        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
          ${
            isReady
              ? html`
                <button
                  class="btn btn--sm primary"
                  ?disabled=${!state.smartOrganizerPrompt.trim() || state.smartOrganizerGenerating}
                  @click=${state.onGenerate}
                  style="padding: 6px 14px; font-size: 0.82rem;"
                >${state.smartOrganizerGenerating ? "Creating\u2026" : "Create layout"}</button>
              `
              : html`
                <button
                  class="btn btn--sm"
                  @click=${state.onTurnOnSmartOrganizer}
                  style="padding: 6px 14px; font-size: 0.82rem;"
                >Turn on Smart Organizer</button>
              `
          }
          ${
            state.smartOrganizerError
              ? html`<span style="font-size: 0.75rem; color: var(--danger);">${state.smartOrganizerError}</span>`
              : nothing
          }
        </div>
        ${renderDevDetails(state)}
      </div>

      <!-- Live preview -->
      ${
        selected
          ? html`
          <div>
            <div style="font-size: 0.8rem; color: var(--muted); margin-bottom: 6px;">
              Preview: ${selected.name}
              ${
                state.customTemplate
                  ? html`
                      <span style="font-size: 0.7rem"> (custom)</span>
                    `
                  : nothing
              }
            </div>
            ${renderFolderTreePreview(selected)}
          </div>
        `
          : nothing
      }

      <!-- Actions -->
      <div style="display: flex; gap: 8px; justify-content: flex-end;">
        ${
          state.onCancel
            ? html`<button class="btn" @click=${state.onCancel} style="padding: 8px 16px;">Cancel</button>`
            : nothing
        }
        ${
          state.onSkip
            ? html`<button class="btn" @click=${state.onSkip} style="padding: 8px 16px;">Use Default</button>`
            : nothing
        }
        <button
          class="btn primary"
          ?disabled=${!selected}
          @click=${() => selected && state.onSave(selected)}
          style="padding: 8px 16px;"
        >Save</button>
      </div>
    </div>
  `;
}

/** Dev-only: Show provider details behind a "Show details" toggle. */
function renderDevDetails(state: FolderTemplatePickerState) {
  if (!state.developerMode) {
    return nothing;
  }

  const statusLabel = state.smartOrganizerStatus;
  const message = state.smartOrganizerStatusMessage;
  const provider = state.devProviderInfo;

  return html`
    <details style="margin-top: 4px;">
      <summary style="font-size: 0.7rem; color: var(--muted); cursor: pointer; user-select: none;">
        Show details
      </summary>
      <div style="font-size: 0.72rem; color: var(--muted); margin-top: 6px; display: flex; flex-direction: column; gap: 3px; font-family: var(--mono);">
        <div>Status: <span style="color: var(--text);">${statusLabel}</span></div>
        ${message ? html`<div>Message: <span style="color: var(--text);">${message}</span></div>` : nothing}
        ${provider ? html`<div>Provider: <span style="color: var(--text);">${provider}</span></div>` : nothing}
      </div>
    </details>
  `;
}
