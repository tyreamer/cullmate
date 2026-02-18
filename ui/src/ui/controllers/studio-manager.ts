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

/**
 * Deterministic flow state machine.
 *
 * Given the current app state, returns exactly the right timeline entries.
 * States flow: storage_missing → template_missing → (card_detected | idle).
 * Each state emits a single "next step" action card — never two competing primary CTAs.
 */
export function buildStarterTimeline(opts: {
  suggestedSources: SuggestedSource[];
  recentProjects: RecentProject[];
  hasStorageConfig: boolean;
  hasFolderTemplate: boolean;
}): TimelineEntry[] {
  const { suggestedSources, recentProjects, hasStorageConfig, hasFolderTemplate } = opts;

  // ── State: storage_missing ──
  if (!hasStorageConfig) {
    return [
      {
        kind: "text",
        id: "welcome",
        role: "cullmate",
        body: COPY.welcomeGreeting,
      },
      {
        kind: "action",
        id: "setup-storage",
        role: "cullmate",
        title: COPY.storageTitle,
        primaryButton: { label: COPY.storageButton, action: "open-storage-setup" },
      },
    ];
  }

  // ── State: template_missing ──
  if (!hasFolderTemplate) {
    return [
      {
        kind: "text",
        id: "storage-done",
        role: "cullmate",
        body: COPY.storageDone,
      },
      {
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
      },
    ];
  }

  // ── State: card_detected (both configured, source found) ──
  if (suggestedSources.length > 0) {
    const source = suggestedSources[0];
    const label = source.label || formatPathLabel(source.path);
    const entries: TimelineEntry[] = [
      {
        kind: "text",
        id: "detected-source",
        role: "cullmate",
        body: COPY.detectedSourceBody(label),
      },
      {
        kind: "action",
        id: "import-detected",
        role: "cullmate",
        title: COPY.savePhotosSafely,
        primaryButton: { label: COPY.savePhotosSafely, action: "import-detected" },
        secondaryButtons: [{ label: COPY.notNow, action: "dismiss-detected" }],
      },
    ];

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

  // ── State: idle (both configured, no source detected) ──
  const entries: TimelineEntry[] = [
    {
      kind: "text",
      id: "ready",
      role: "cullmate",
      body: COPY.readyWhenYouAre,
    },
    {
      kind: "action",
      id: "import-open",
      role: "cullmate",
      title: COPY.savePhotosSafely,
      primaryButton: { label: COPY.savePhotosSafely, action: "open-import" },
    },
  ];

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
