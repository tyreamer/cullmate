import { html, nothing } from "lit";
import type { FolderTemplate } from "../../../../src/photo/folder-template.js";
import { renderFolderTreePreview } from "./folder-tree-preview.ts";

export type FolderTemplatePickerState = {
  presets: FolderTemplate[];
  selectedTemplate: FolderTemplate | null;
  customTemplate: FolderTemplate | null;
  ollamaAvailable: boolean;
  ollamaPrompt: string;
  ollamaGenerating: boolean;
  ollamaError: string | null;
  ollamaModels: string[];
  ollamaSelectedModel: string;
  onSelectPreset: (t: FolderTemplate) => void;
  onPromptChange: (v: string) => void;
  onGenerate: () => void;
  onModelChange: (id: string) => void;
  onSave: (t: FolderTemplate) => void;
  onSkip?: () => void;
  onCancel?: () => void;
};

export function renderFolderTemplatePicker(state: FolderTemplatePickerState) {
  const selected = state.customTemplate ?? state.selectedTemplate;

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

      <!-- Describe your structure (Ollama) -->
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="font-size: 0.8rem; color: var(--muted);">
          Or describe your ideal folder structure
          ${
            !state.ollamaAvailable
              ? html`
                  <span style="font-size: 0.7rem"> (requires Ollama running locally)</span>
                `
              : nothing
          }
        </div>
        <div style="display: flex; gap: 6px; align-items: stretch;">
          <textarea
            placeholder="e.g. RAW files sorted by camera body, videos in a separate folder, exports for web and print..."
            .value=${state.ollamaPrompt}
            @input=${(e: InputEvent) => state.onPromptChange((e.target as HTMLTextAreaElement).value)}
            ?disabled=${!state.ollamaAvailable}
            rows="2"
            style="flex: 1; background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px 10px; color: var(--text); font-size: 0.82rem; resize: vertical; font-family: inherit;"
          ></textarea>
        </div>
        ${
          state.ollamaAvailable && state.ollamaModels.length > 1
            ? html`
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 0.75rem; color: var(--muted);">Model:</span>
              <select
                .value=${state.ollamaSelectedModel}
                @change=${(e: Event) => state.onModelChange((e.target as HTMLSelectElement).value)}
                style="background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 8px; color: var(--text); font-size: 0.78rem;"
              >
                ${state.ollamaModels.map(
                  (m) =>
                    html`<option value=${m} ?selected=${m === state.ollamaSelectedModel}>${m}</option>`,
                )}
              </select>
            </div>
          `
            : nothing
        }
        <div style="display: flex; gap: 6px; align-items: center;">
          <button
            class="btn btn--sm primary"
            ?disabled=${!state.ollamaAvailable || !state.ollamaPrompt.trim() || state.ollamaGenerating}
            @click=${state.onGenerate}
            style="padding: 6px 14px; font-size: 0.82rem;"
          >${state.ollamaGenerating ? "Generating..." : "Generate"}</button>
          ${
            state.ollamaError
              ? html`<span style="font-size: 0.75rem; color: var(--danger);">${state.ollamaError}</span>`
              : nothing
          }
        </div>
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
                      <span style="font-size: 0.7rem"> (AI generated)</span>
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
