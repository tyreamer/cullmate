import { html, nothing } from "lit";
import type {
  TimelineEntry,
  TextMessage,
  ActionCard,
  StatusCard,
  ResultCard,
  FormCard,
} from "../controllers/studio-manager.ts";
import { COPY } from "../copy/studio-manager-copy.ts";

export type StudioManagerViewState = {
  connected: boolean;
  timeline: TimelineEntry[];
  formValues: Record<string, string>;
  onAction: (action: string) => void;
  onFormValueChange: (fieldId: string, value: string) => void;
  onFormSubmit: (fieldId: string, value: string) => void;
};

// ── Sub-renderers ──

function renderTextBubble(msg: TextMessage) {
  const align = msg.role === "cullmate" ? "cullmate" : "you";
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

// ── Main render ──

export function renderStudioManager(state: StudioManagerViewState) {
  if (!state.connected) {
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
          }
        })}
      </div>
    </div>
  `;
}
