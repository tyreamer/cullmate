import { html, nothing } from "lit";
import type { RecentProject } from "../controllers/ingest.ts";

export type ProjectsViewState = {
  recentProjects: RecentProject[];
  onOpenFolder: (p: RecentProject) => void;
  onOpenReport: (p: RecentProject) => void;
  onImportClick: () => void;
};

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

function truncatePath(p: string, max = 50): string {
  if (p.length <= max) {
    return p;
  }
  return "\u2026" + p.slice(p.length - max + 1);
}

export function renderProjectsView(state: ProjectsViewState) {
  if (state.recentProjects.length === 0) {
    return html`
      <div class="home" style="text-align: center; padding: 48px 20px;">
        <div style="font-size: 2.5rem; margin-bottom: 12px;">&#x1F4F7;</div>
        <h2 style="font-size: 1.1rem; margin-bottom: 8px;">Import your first shoot</h2>
        <p style="color: var(--muted); font-size: 0.85rem; margin-bottom: 16px;">Your imported projects will appear here.</p>
        <button class="btn primary" @click=${state.onImportClick}>Import Photos</button>
      </div>
    `;
  }

  return html`
    <div class="home">
      <div class="home-recents">
        ${state.recentProjects.map(
          (p) => html`
            <div class="home-recent-card">
              <div class="home-recent-card__info">
                <div class="home-recent-card__name">${p.projectName}</div>
                <div class="home-recent-card__meta">
                  <span>${formatDate(p.timestamp)}</span>
                  <span class="home-recent-card__sep">\u00b7</span>
                  <span class="mono" style="font-size: 0.75rem;">${truncatePath(p.sourcePath)} \u2192 ${truncatePath(p.destPath)}</span>
                </div>
              </div>
              <div class="home-recent-card__actions">
                <button class="btn btn--sm" @click=${() => state.onOpenFolder(p)}>Open Folder</button>
                ${
                  p.reportPath
                    ? html`<button class="btn btn--sm" @click=${() => state.onOpenReport(p)}>View Receipt</button>`
                    : nothing
                }
              </div>
            </div>
          `,
        )}
      </div>
    </div>
  `;
}
