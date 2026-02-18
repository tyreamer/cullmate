import type { FolderTemplate } from "../../../../src/photo/folder-template.js";
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
  verdict?: string;
  detail: string;
  buttons: Array<{ label: string; action: string }>;
  counters?: Array<{ label: string; value: string }>;
};

export type FormCard = {
  kind: "form";
  id: string;
  role: "cullmate";
  title: string;
  fieldId: string;
  placeholder?: string;
  defaultValue?: string;
  chips?: Array<{ label: string; value: string }>;
  submitButton: { label: string; action: string };
};

export type TimelineEntry = TextMessage | ActionCard | StatusCard | ResultCard | FormCard;

// ── Builder ──

/**
 * Deterministic flow state machine.
 *
 * Given the current app state, returns exactly the right timeline entries.
 * States flow: storage_missing → template_missing → profile_missing → (card_detected | idle).
 * Each state emits a single "next step" action card — never two competing primary CTAs.
 */
export function buildStarterTimeline(opts: {
  suggestedSources: SuggestedSource[];
  recentProjects: RecentProject[];
  hasStorageConfig: boolean;
  hasFolderTemplate: boolean;
  hasCompletedProfileSetup: boolean;
  presets?: FolderTemplate[];
}): TimelineEntry[] {
  const {
    suggestedSources,
    recentProjects,
    hasStorageConfig,
    hasFolderTemplate,
    hasCompletedProfileSetup,
    presets,
  } = opts;

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
    const layoutChips = (presets ?? []).map((p) => ({
      label: p.name,
      action: `select-layout:${p.template_id}`,
    }));
    return [
      {
        kind: "text",
        id: "storage-done",
        role: "cullmate",
        body: COPY.storageDone,
      },
      {
        kind: "action",
        id: "setup-layout",
        role: "cullmate",
        title: COPY.layoutPrompt,
        chips: layoutChips.length > 0 ? layoutChips : undefined,
        primaryButton: {
          label: COPY.layoutClassicButton,
          action: "select-layout:preset:classic",
        },
      },
    ];
  }

  // ── State: profile_missing ──
  if (!hasCompletedProfileSetup) {
    return [
      {
        kind: "text",
        id: "profile-prompt",
        role: "cullmate",
        body: COPY.profilePromptInline,
      },
      {
        kind: "action",
        id: "setup-profile",
        role: "cullmate",
        title: COPY.profileTitleInline,
        primaryButton: { label: COPY.profileTurnOn, action: "open-profile-setup" },
        secondaryButtons: [{ label: COPY.profileNotNow, action: "skip-profile-setup" }],
      },
    ];
  }

  // ── State: card_detected (all configured, source found) ──
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

/**
 * Build the naming step timeline entries shown before ingest starts.
 */
export function buildNamingTimeline(opts: {
  sourceLabel: string;
  smartSuggestion: string;
}): TimelineEntry[] {
  const today = new Date();
  const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return [
    {
      kind: "text",
      id: "naming-prompt",
      role: "cullmate",
      body: COPY.namingPrompt,
    },
    {
      kind: "form",
      id: "project-name-form",
      role: "cullmate",
      title: COPY.namingTitle,
      fieldId: "project-name",
      placeholder: COPY.namingPlaceholder,
      defaultValue: opts.smartSuggestion,
      chips: [
        { label: "Wedding", value: `Wedding ${dateStr}` },
        { label: "Portrait", value: `Portrait ${dateStr}` },
        { label: "Event", value: `Event ${dateStr}` },
        { label: dateStr, value: dateStr },
      ],
      submitButton: { label: COPY.savePhotosButton, action: "start-named-ingest" },
    },
  ];
}
