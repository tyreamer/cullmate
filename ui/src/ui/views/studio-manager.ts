import { html, nothing } from "lit";
import type {
  TimelineEntry,
  TextMessage,
  ActionCard,
  StatusCard,
  ResultCard,
  FormCard,
  TemplatePickerCard,
  ImportCard,
  StageProgressCard,
} from "../controllers/studio-manager.ts";
import { buildTemplateTree } from "../controllers/studio-manager.ts";
import { COPY } from "../copy/studio-manager-copy.ts";

export type StudioManagerViewState = {
  connected: boolean;
  lastError: string | null;
  timeline: TimelineEntry[];
  formValues: Record<string, string>;
  importOptionsExpanded: boolean;
  onAction: (action: string) => void;
  onFormValueChange: (fieldId: string, value: string) => void;
  onFormSubmit: (fieldId: string, value: string) => void;
  onOpenSettings: () => void;
};

// ── Sub-renderers ──

function renderTextBubble(msg: TextMessage) {
  const align = msg.role === "baxbot" ? "baxbot" : "you";
  return html`
    <div class="studio-msg studio-msg--${align}">
      <div class="studio-bubble studio-bubble--${align}">
        ${msg.body}
      </div>
    </div>
  `;
}

function renderActionCard(card: ActionCard, state: StudioManagerViewState) {
  if (card.done) {
    return html`
      <div class="studio-card studio-card--done">
        <div class="studio-card__header">
          <span class="studio-card__check">\u2713</span>
          <span class="studio-card__title">${card.title}</span>
        </div>
      </div>
    `;
  }

  return html`
    <div class="studio-card ${card.disabled ? "studio-card--disabled" : ""}">
      <div class="studio-card__title">${card.title}</div>
      ${card.description ? html`<div class="studio-card__desc">${card.description}</div>` : nothing}
      ${
        card.chips && card.chips.length > 0
          ? html`
          <div class="studio-card__chips">
            ${card.chips.map(
              (chip) => html`
                <button
                  class="chip"
                  ?disabled=${card.disabled || !state.connected}
                  @click=${() => state.onAction(chip.action)}
                >${chip.label}</button>
              `,
            )}
          </div>
        `
          : nothing
      }
      <div class="studio-card__actions">
        <button
          class="btn primary"
          ?disabled=${card.disabled || !state.connected}
          @click=${() => state.onAction(card.primaryButton.action)}
        >${card.primaryButton.label}</button>
        ${
          card.secondaryButtons
            ? card.secondaryButtons.map(
                (btn) => html`
              <button
                class="btn"
                ?disabled=${card.disabled || !state.connected}
                @click=${() => state.onAction(btn.action)}
              >${btn.label}</button>
            `,
              )
            : nothing
        }
      </div>
    </div>
  `;
}

function renderStatusCard(card: StatusCard) {
  const percent = Math.max(0, Math.min(100, card.progressPercent));
  const indeterminate = percent <= 0;

  return html`
    <div class="studio-card studio-card--status">
      <div class="studio-card__title">${card.statusLine}</div>
      <div class="studio-card__progress-track">
        <div
          class="studio-card__progress-fill ${indeterminate ? "studio-card__progress-fill--indeterminate" : ""}"
          style=${indeterminate ? "" : `width: ${percent}%`}
        ></div>
      </div>
      ${
        card.counters && card.counters.length > 0
          ? html`
          <div class="studio-card__counters">
            ${card.counters.map(
              (c) => html`
                <div class="studio-card__counter">
                  <span class="studio-card__counter-value">${c.value}</span>
                  <span class="studio-card__counter-label">${c.label}</span>
                </div>
              `,
            )}
          </div>
        `
          : nothing
      }
    </div>
  `;
}

function renderTriageSummary(card: ResultCard) {
  if (!card.triageSummary) {
    return nothing;
  }
  const { unreadableCount, blackFrameCount } = card.triageSummary;

  if (unreadableCount === 0 && blackFrameCount === 0) {
    return html`
      <div class="studio-card__triage studio-card__triage--ok">
        \u2713 ${COPY.triageClean}
      </div>
    `;
  }

  return html`
    <div class="studio-card__triage">
      ${
        unreadableCount > 0
          ? html`
        <div class="studio-card__triage-warn">
          \u26A0 ${COPY.triageUnreadable(unreadableCount)}
        </div>
      `
          : nothing
      }
      ${
        blackFrameCount > 0
          ? html`
        <div class="studio-card__triage-info">
          ${COPY.triageBlackFrames(blackFrameCount)}
        </div>
      `
          : nothing
      }
    </div>
  `;
}

function renderBurstSummary(card: ResultCard) {
  if (!card.burstSummary || card.burstSummary.burstCount === 0) {
    return nothing;
  }
  return html`
    <div class="studio-card__triage studio-card__triage--info">
      ${COPY.burstsFound(card.burstSummary.burstCount, card.burstSummary.bestPickCount)}
    </div>
  `;
}

function renderResultBadges(card: ResultCard, state: StudioManagerViewState) {
  if (!card.badges || card.badges.length === 0) {
    return nothing;
  }
  return html`
    <div class="studio-badges">
      ${card.badges.map(
        (badge) => html`
          <span
            class="studio-badge studio-badge--${badge.variant}"
            @click=${badge.action ? () => state.onAction(badge.action!) : nothing}
            style=${badge.action ? "cursor: pointer" : ""}
          >${badge.label}</span>
        `,
      )}
    </div>
  `;
}

function renderResultCard(card: ResultCard, state: StudioManagerViewState) {
  const variant = card.safeToFormat === true ? "safe" : "unsafe";

  return html`
    <div class="studio-card studio-card--result studio-card--result-${variant}">
      ${
        card.verdict
          ? html`
            <div class="studio-card__project-name">${card.headline}</div>
            <div class="studio-card__result-banner studio-card__result-banner--${variant}">
              ${card.verdict}
            </div>
          `
          : html`
            <div class="studio-card__result-banner studio-card__result-banner--${variant}">
              ${card.headline}
            </div>
          `
      }
      <div class="studio-card__desc">${card.detail}</div>
      ${renderResultBadges(card, state)}
      ${
        card.counters && card.counters.length > 0
          ? html`
          <div class="studio-card__counters">
            ${card.counters.map(
              (c) => html`
                <div class="studio-card__counter">
                  <span class="studio-card__counter-value">${c.value}</span>
                  <span class="studio-card__counter-label">${c.label}</span>
                </div>
              `,
            )}
          </div>
        `
          : nothing
      }
      ${renderTriageSummary(card)}
      ${renderBurstSummary(card)}
      <div class="studio-card__actions">
        ${card.buttons.map(
          (btn) => html`
            <button
              class="btn"
              @click=${() => state.onAction(btn.action)}
            >${btn.label}</button>
          `,
        )}
      </div>
    </div>
  `;
}

function renderFormCard(card: FormCard, state: StudioManagerViewState) {
  const currentValue = state.formValues[card.fieldId] ?? card.defaultValue ?? "";

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      state.onFormSubmit(card.fieldId, currentValue);
    }
  };

  return html`
    <div class="studio-card">
      <div class="studio-card__title">${card.title}</div>
      ${
        card.chips && card.chips.length > 0
          ? html`
          <div class="studio-card__chips">
            ${card.chips.map(
              (chip) => html`
                <button
                  class="chip"
                  ?disabled=${!state.connected}
                  @click=${() => state.onFormValueChange(card.fieldId, chip.value)}
                >${chip.label}</button>
              `,
            )}
          </div>
        `
          : nothing
      }
      <input
        class="studio-card__input"
        type="text"
        .value=${currentValue}
        placeholder=${card.placeholder ?? ""}
        ?disabled=${!state.connected}
        @input=${(e: InputEvent) => {
          const target = e.target as HTMLInputElement;
          state.onFormValueChange(card.fieldId, target.value);
        }}
        @keydown=${handleKeyDown}
      />
      <div class="studio-card__actions">
        <button
          class="btn primary"
          ?disabled=${!state.connected || !currentValue.trim()}
          @click=${() => state.onFormSubmit(card.fieldId, currentValue)}
        >${card.submitButton.label}</button>
      </div>
    </div>
  `;
}

function renderTemplatePickerCard(card: TemplatePickerCard, state: StudioManagerViewState) {
  return html`
    <div class="studio-card">
      <div class="studio-card__desc">${COPY.templatePickerSubtitle}</div>
      <div class="studio-template-grid">
        ${card.presets.map(
          (preset) => html`
            <button
              class="studio-template-option"
              ?disabled=${!state.connected}
              @click=${() => state.onAction(`select-layout:${preset.template_id}`)}
            >
              <div class="studio-template-option__name">${preset.name}</div>
              <div class="studio-template-option__desc">${preset.description}</div>
              <div class="studio-template-option__tree">${buildTemplateTree(preset)}</div>
            </button>
          `,
        )}
      </div>
    </div>
  `;
}

function renderImportCard(card: ImportCard, state: StudioManagerViewState) {
  const projectName = state.formValues["import-project-name"] ?? card.projectName;

  const handleProjectNameKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      state.onAction("start-import");
    }
  };

  return html`
    <div class="studio-card studio-import-card">
      <div class="studio-card__desc">${COPY.importSubtitle}</div>

      ${
        card.source
          ? html`
            <div class="studio-import-card__source">
              ${card.source.label}
            </div>
          `
          : html`
            <button
              class="btn"
              ?disabled=${!state.connected}
              @click=${() => state.onAction("choose-import-folder")}
            >${COPY.importChooseFolder}</button>
          `
      }

      <div class="studio-import-card__field">
        <span class="studio-import-card__field-label">Project</span>
        <input
          class="studio-card__input"
          type="text"
          .value=${projectName}
          placeholder=${COPY.namingPlaceholder}
          ?disabled=${!state.connected}
          @input=${(e: InputEvent) => {
            const target = e.target as HTMLInputElement;
            state.onFormValueChange("import-project-name", target.value);
          }}
          @keydown=${handleProjectNameKeyDown}
        />
      </div>

      <div class="studio-import-card__field">
        <span class="studio-import-card__field-label">${COPY.importSaveTo}</span>
        <span class="studio-import-card__field-value">${card.saveToLabel}</span>
        <button
          class="studio-import-card__link-btn"
          ?disabled=${!state.connected}
          @click=${() => state.onAction("change-save-location")}
        >${COPY.importChangeSaveTo}</button>
      </div>

      <div class="studio-card__actions">
        <button
          class="btn primary"
          ?disabled=${!state.connected || (!card.source && !projectName.trim())}
          @click=${() => state.onAction("start-import")}
        >${COPY.importAndVerify}</button>
      </div>

      <button
        class="studio-import-card__options-toggle"
        @click=${() => state.onAction("toggle-import-options")}
      >${COPY.importOptions} ${card.optionsExpanded ? "\u25B4" : "\u25BE"}</button>

      ${
        card.optionsExpanded
          ? html`
            <div class="studio-import-card__options">
              <div class="studio-import-card__option-group">
                <span class="studio-import-card__option-label">Verification</span>
                <div class="studio-import-card__option-radios">
                  <label class="studio-import-card__radio">
                    <input
                      type="radio"
                      name="verify-mode"
                      .checked=${card.verifyMode === "sentinel"}
                      @change=${() => state.onAction("import-set-verify:sentinel")}
                    />
                    <span>
                      <strong>${COPY.optionsVerifyStandard}</strong>
                      <span class="studio-import-card__radio-desc">${COPY.optionsVerifyStandardDesc}</span>
                    </span>
                  </label>
                  <label class="studio-import-card__radio">
                    <input
                      type="radio"
                      name="verify-mode"
                      .checked=${card.verifyMode === "full"}
                      @change=${() => state.onAction("import-set-verify:full")}
                    />
                    <span>
                      <strong>${COPY.optionsVerifyMax}</strong>
                      <span class="studio-import-card__radio-desc">${COPY.optionsVerifyMaxDesc}</span>
                    </span>
                  </label>
                  <label class="studio-import-card__radio">
                    <input
                      type="radio"
                      name="verify-mode"
                      .checked=${card.verifyMode === "none"}
                      @change=${() => state.onAction("import-set-verify:none")}
                    />
                    <span>
                      <strong>${COPY.optionsVerifyFast}</strong>
                      <span class="studio-import-card__radio-desc">${COPY.optionsVerifyFastDesc}</span>
                    </span>
                  </label>
                </div>
              </div>
              <label class="studio-import-card__checkbox">
                <input
                  type="checkbox"
                  .checked=${card.dedupeEnabled}
                  @change=${() => state.onAction("import-toggle-dedupe")}
                />
                ${COPY.optionsDuplicates}
              </label>
              <div class="studio-import-card__option-group">
                <span class="studio-import-card__option-label">${COPY.optionsFolderLabel}</span>
                <span class="studio-import-card__option-value">${card.folderTemplateName}</span>
              </div>
            </div>
          `
          : nothing
      }
    </div>
  `;
}

function renderStageProgressCard(card: StageProgressCard) {
  return html`
    <div class="studio-card studio-card--status">
      <div class="studio-stages">
        ${card.stages.map(
          (stage) => html`
            <div class="studio-stage studio-stage--${stage.status}">
              <span class="studio-stage__icon">
                ${stage.status === "done" ? "\u2713" : stage.status === "active" ? "\u25C9" : "\u25CB"}
              </span>
              <span>${stage.label}</span>
            </div>
            ${
              stage.status === "active" && card.currentStageProgress > 0
                ? html`
                  <div class="studio-card__progress-track">
                    <div
                      class="studio-card__progress-fill"
                      style="width: ${Math.min(100, card.currentStageProgress)}%"
                    ></div>
                  </div>
                `
                : nothing
            }
          `,
        )}
      </div>
      <div class="studio-card__desc">${card.statusLine}</div>
    </div>
  `;
}

// ── Main render ──

export function renderStudioManager(state: StudioManagerViewState) {
  if (!state.connected) {
    if (state.lastError) {
      return html`
        <div class="studio-manager">
          <div class="studio-manager__disconnected studio-manager__disconnected--error">
            <div class="studio-manager__error-title">${COPY.connectionErrorTitle}</div>
            <div class="studio-manager__error-detail">${state.lastError}</div>
            <button class="btn primary" @click=${() => state.onOpenSettings()}>
              ${COPY.openSettings}
            </button>
          </div>
        </div>
      `;
    }
    return html`
      <div class="studio-manager">
        <div class="studio-manager__disconnected">
          ${COPY.disconnectedMessage}
        </div>
      </div>
    `;
  }

  return html`
    <div class="studio-manager">
      <div class="studio-manager__timeline">
        ${state.timeline.map((entry) => {
          switch (entry.kind) {
            case "text":
              return renderTextBubble(entry);
            case "action":
              return renderActionCard(entry, state);
            case "status":
              return renderStatusCard(entry);
            case "result":
              return renderResultCard(entry, state);
            case "form":
              return renderFormCard(entry, state);
            case "template-picker":
              return renderTemplatePickerCard(entry, state);
            case "import":
              return renderImportCard(entry, state);
            case "stage-progress":
              return renderStageProgressCard(entry);
          }
        })}
      </div>
    </div>
  `;
}
