import type { RecentProject, SuggestedSource } from "./ingest.ts";
import { COPY } from "../copy/studio-manager-copy.ts";
import { formatPathLabel } from "./storage.ts";

// ── Timeline entry types (discriminated union on `kind`) ──

export type StudioMessageRole = "cullmate" | "you";

export type TextMessage = {
  kind: "text";
  id: string;
  role: StudioMessageRole;
  body: string;
};

export type ActionCard = {
  kind: "action";
  id: string;
  role: "cullmate";
  title: string;
  description?: string;
  primaryButton: { label: string; action: string };
  secondaryButtons?: Array<{ label: string; action: string }>;
  chips?: Array<{ label: string; action: string }>;
  disabled?: boolean;
  done?: boolean;
};

export type StatusCard = {
  kind: "status";
  id: string;
  role: "cullmate";
  statusLine: string;
  progressPercent: number;
  counters?: Array<{ label: string; value: string }>;
};

export type ResultCard = {
  kind: "result";
  id: string;
  role: "cullmate";
  safeToFormat: boolean | null;
  headline: string;
  detail: string;
  buttons: Array<{ label: string; action: string }>;
  counters?: Array<{ label: string; value: string }>;
};

export type TimelineEntry = TextMessage | ActionCard | StatusCard | ResultCard;

// ── Builder ──

export function buildStarterTimeline(opts: {
  suggestedSources: SuggestedSource[];
  recentProjects: RecentProject[];
  hasStorageConfig: boolean;
  hasFolderTemplate: boolean;
}): TimelineEntry[] {
  const { suggestedSources, recentProjects, hasStorageConfig, hasFolderTemplate } = opts;
  const bothReady = hasStorageConfig && hasFolderTemplate;

  // ── First-boot path ──
  if (!bothReady) {
    const entries: TimelineEntry[] = [];

    entries.push({
      kind: "text",
      id: "welcome",
      role: "cullmate",
      body: COPY.welcomeGreeting,
    });

    entries.push({
      kind: "action",
      id: "setup-storage",
      role: "cullmate",
      title: COPY.storageTitle,
      primaryButton: { label: COPY.storageButton, action: "open-storage-setup" },
      done: hasStorageConfig,
    });

    entries.push({
      kind: "action",
      id: "setup-organization",
      role: "cullmate",
      title: COPY.organizationTitle,
      primaryButton: {
        label: COPY.organizationChooseButton,
        action: "open-template-picker",
      },
      secondaryButtons: [
        { label: COPY.organizationDescribeButton, action: "open-template-describe" },
      ],
      done: hasFolderTemplate,
    });

    entries.push({
      kind: "action",
      id: "first-import",
      role: "cullmate",
      title: COPY.readyToImport,
      primaryButton: { label: COPY.savePhotosSafely, action: "open-import" },
      disabled: !bothReady,
    });

    return entries;
  }

  // ── Returning user path ──
  const entries: TimelineEntry[] = [];

  if (suggestedSources.length > 0) {
    const source = suggestedSources[0];
    const label = source.label || formatPathLabel(source.path);

    entries.push({
      kind: "text",
      id: "detected-source",
      role: "cullmate",
      body: COPY.detectedSourceBody(label),
    });

    entries.push({
      kind: "action",
      id: "import-detected",
      role: "cullmate",
      title: COPY.savePhotosSafely,
      primaryButton: { label: COPY.savePhotosSafely, action: "import-detected" },
      secondaryButtons: [{ label: COPY.notNow, action: "dismiss-detected" }],
    });
  } else {
    entries.push({
      kind: "text",
      id: "ready",
      role: "cullmate",
      body: COPY.readyWhenYouAre,
    });

    entries.push({
      kind: "action",
      id: "import-open",
      role: "cullmate",
      title: COPY.savePhotosSafely,
      primaryButton: { label: COPY.savePhotosSafely, action: "open-import" },
    });
  }

  if (recentProjects.length > 0) {
    entries.push({
      kind: "action",
      id: "recent-projects",
      role: "cullmate",
      title: COPY.recentTitle,
      description: COPY.recentDescription,
      primaryButton: { label: COPY.recentTitle, action: "view-projects" },
      chips: recentProjects.slice(0, 5).map((p) => ({
        label: p.projectName,
        action: `open-recent:${p.projectRoot}`,
      })),
    });
  }

  return entries;
}
