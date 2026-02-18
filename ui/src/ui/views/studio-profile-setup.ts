import { html } from "lit";
import type { StudioProfile } from "../controllers/studio-profile.ts";

export type StudioProfileSetupState = {
  profile: StudioProfile;
  onSave: (profile: StudioProfile) => void;
  onSkip: (() => void) | undefined;
  onCancel: (() => void) | undefined;
};

export function renderStudioProfileSetup(state: StudioProfileSetupState) {
  let displayName = state.profile.displayName;
  let studioName = state.profile.studioName;
  let website = state.profile.website;
  let validationError = "";

  function handleSave() {
    if (!displayName.trim()) {
      validationError = "Please add your name.";
      return;
    }
    state.onSave({
      ...state.profile,
      enabled: true,
      displayName: displayName.trim(),
      studioName: studioName.trim(),
      website: website.trim(),
      copyrightLine: `\u00A9 ${new Date().getFullYear()} ${displayName.trim()}`,
      completedSetup: true,
    });
  }

  function handleSkip() {
    if (state.onSkip) {
      state.onSkip();
    }
  }

  return html`
    <div class="setup-fullscreen">
      <div class="setup-card" style="max-width: 440px;">
        <h2 style="font-size: 1.2rem; margin: 0 0 4px;">Studio Profile</h2>
        <p style="font-size: 0.85rem; color: var(--muted); margin: 0 0 20px;">
          Your name on every photo &mdash; visible in Lightroom, Capture One, and other apps.
        </p>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="display: block; font-size: 0.78rem; color: var(--muted); margin-bottom: 4px;">Your Name</label>
            <input
              type="text"
              placeholder="Jane Doe"
              .value=${displayName}
              @input=${(e: InputEvent) => {
                displayName = (e.target as HTMLInputElement).value;
                validationError = "";
              }}
              style="width: 100%; box-sizing: border-box; background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; color: var(--text); font-size: 0.9rem;"
            />
            ${validationError ? html`<p style="font-size: 0.78rem; color: var(--destructive, #e53935); margin: 4px 0 0;">${validationError}</p>` : ""}
          </div>

          <div>
            <label style="display: block; font-size: 0.78rem; color: var(--muted); margin-bottom: 4px;">Studio or Business <span style="color: var(--muted); font-weight: 400;">(optional)</span></label>
            <input
              type="text"
              placeholder="JD Photography"
              .value=${studioName}
              @input=${(e: InputEvent) => {
                studioName = (e.target as HTMLInputElement).value;
              }}
              style="width: 100%; box-sizing: border-box; background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; color: var(--text); font-size: 0.9rem;"
            />
          </div>

          <div>
            <label style="display: block; font-size: 0.78rem; color: var(--muted); margin-bottom: 4px;">Website <span style="color: var(--muted); font-weight: 400;">(optional)</span></label>
            <input
              type="text"
              placeholder="https://janedoe.com"
              .value=${website}
              @input=${(e: InputEvent) => {
                website = (e.target as HTMLInputElement).value;
              }}
              style="width: 100%; box-sizing: border-box; background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px 12px; color: var(--text); font-size: 0.9rem;"
            />
          </div>
        </div>

        <div style="display: flex; gap: 8px; margin-top: 20px;">
          <button
            class="btn primary"
            @click=${handleSave}
            style="flex: 1;"
          >Save</button>
          ${
            state.onSkip
              ? html`<button
                  class="btn"
                  @click=${handleSkip}
                  style="flex: 1;"
                >Skip</button>`
              : ""
          }
          ${
            state.onCancel
              ? html`<button
                  class="btn"
                  @click=${state.onCancel}
                  style="flex: 1;"
                >Cancel</button>`
              : ""
          }
        </div>

        <details style="margin-top: 16px;">
          <summary style="font-size: 0.75rem; color: var(--muted); cursor: pointer;">What does this do?</summary>
          <p style="font-size: 0.75rem; color: var(--muted); margin: 6px 0 0;">
            BaxBot saves this info in a small helper file next to each photo so apps like Lightroom
            can read it. Your original photos are never changed.
          </p>
        </details>
      </div>
    </div>
  `;
}
