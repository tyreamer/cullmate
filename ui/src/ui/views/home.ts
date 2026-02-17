import { html, nothing } from "lit";
import type { RecentProject, SuggestedSource } from "../controllers/ingest.ts";

export type HomeViewState = {
  connected: boolean;
  suggestedSources: SuggestedSource[];
  recentProjects: RecentProject[];
  onImportClick: () => void;
  onSelectSuggestedSource: (s: SuggestedSource) => void;
  onSelectRecent: (p: RecentProject) => void;
  onOpenReport: (p: RecentProject) => void;
  onRevealProject: (p: RecentProject) => void;
};

/** Turn a raw absolute path into a friendly display label. */
function formatPathLabel(path: string): string {
  // /Volumes/<name>/DCIM  ->  "<name> (DCIM)"
  const volumeDcim = path.match(/^\/Volumes\/([^/]+)\/DCIM/);
  if (volumeDcim) {
    return `${volumeDcim[1]} (DCIM)`;
  }

  // /Volumes/<name>  ->  "<name>"
  const volume = path.match(/^\/Volumes\/([^/]+)/);
  if (volume) {
    return volume[1];
  }

  // /Users/<user>/Downloads/... -> "Downloads"
  const downloads = path.match(/\/Users\/[^/]+\/Downloads/);
  if (downloads) {
    return "Downloads";
  }

  // /Users/<user>/Pictures/... -> "Pictures"
  const pictures = path.match(/\/Users\/[^/]+\/Pictures/);
  if (pictures) {
    return "Pictures";
  }

  // /Users/<user>/Desktop/... -> "Desktop"
  const desktop = path.match(/\/Users\/[^/]+\/Desktop/);
  if (desktop) {
    return "Desktop";
  }

  // Fallback: last folder segment
  const segments = path.replace(/\/+$/, "").split("/");
  return segments[segments.length - 1] || path;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function renderHome(state: HomeViewState) {
  const hasSources = state.suggestedSources.length > 0;

  return html`
    <div class="home">
      <div class="home-hero">
        <h1 class="home-hero__title">Import. Verify. Done.</h1>
        <p class="home-hero__sub">Copy from your card, stay organized, and get a receipt.</p>
        <div class="home-hero__actions">
          <button
            class="btn primary home-hero__cta"
            ?disabled=${!state.connected}
            @click=${() => {
              if (hasSources) {
                state.onSelectSuggestedSource(state.suggestedSources[0]);
              } else {
                state.onImportClick();
              }
            }}
          >
            ${hasSources ? "Import from SD Card" : "Import Photos"}
          </button>
          <button
            class="btn home-hero__secondary"
            ?disabled=${!state.connected}
            @click=${state.onImportClick}
          >Choose Folder\u2026</button>
        </div>
      </div>

      ${
        hasSources
          ? html`
          <section class="home-section">
            <h2 class="home-section__title">Detected Sources</h2>
            <div class="home-sources">
              ${state.suggestedSources.map(
                (s) => html`
                  <button
                    class="home-source-card"
                    @click=${() => state.onSelectSuggestedSource(s)}
                    title=${s.path}
                  >
                    <span class="home-source-card__icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <rect x="2" y="4" width="20" height="16" rx="2"/>
                        <path d="M2 8h20"/>
                      </svg>
                    </span>
                    <span class="home-source-card__label">${formatPathLabel(s.path)}</span>
                    <span class="home-source-card__path">${s.path}</span>
                  </button>
                `,
              )}
            </div>
          </section>
        `
          : nothing
      }

      ${
        state.recentProjects.length > 0
          ? html`
          <section class="home-section">
            <h2 class="home-section__title">Recent Imports</h2>
            <div class="home-recents">
              ${state.recentProjects.map(
                (p) => html`
                  <div class="home-recent-card">
                    <div class="home-recent-card__info">
                      <div class="home-recent-card__name">${p.projectName}</div>
                      <div class="home-recent-card__meta">
                        <span>${formatDate(p.timestamp)}</span>
                        <span class="home-recent-card__sep">\u00b7</span>
                        <span>${formatPathLabel(p.destPath)}</span>
                      </div>
                    </div>
                    <div class="home-recent-card__actions">
                      ${
                        p.reportPath
                          ? html`<button class="btn btn--sm" @click=${() => state.onOpenReport(p)}>Open Receipt</button>`
                          : nothing
                      }
                      <button class="btn btn--sm" @click=${() => state.onRevealProject(p)}>Reveal in Finder</button>
                      <button class="btn btn--sm" @click=${() => state.onSelectRecent(p)}>Import Again</button>
                    </div>
                  </div>
                `,
              )}
            </div>
          </section>
        `
          : nothing
      }

      ${
        !hasSources && state.recentProjects.length === 0
          ? html`
              <div class="home-empty">
                <p class="home-empty__text">
                  Insert an SD card or click <strong>Import Photos</strong> to get started.
                </p>
              </div>
            `
          : nothing
      }
    </div>
  `;
}
