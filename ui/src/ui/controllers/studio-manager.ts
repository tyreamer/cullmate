import type { FolderTemplate } from "../../../../src/photo/folder-template.js";
import type { RecentProject, SuggestedSource } from "./ingest.ts";
import { COPY } from "../copy/studio-manager-copy.ts";
import { formatPathLabel } from "./storage.ts";

// ── Timeline entry types (discriminated union on `kind`) ──

export type StudioMessageRole = "baxbot" | "you";

export type TextMessage = {
  kind: "text";
  id: string;
  role: StudioMessageRole;
  body: string;
};

export type ActionCard = {
  kind: "action";
  id: string;
  role: "baxbot";
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
  role: "baxbot";
  statusLine: string;
  progressPercent: number;
  counters?: Array<{ label: string; value: string }>;
};

export type ResultCard = {
  kind: "result";
  id: string;
  role: "baxbot";
  safeToFormat: boolean | null;
  headline: string;
  verdict?: string;
  detail: string;
  buttons: Array<{ label: string; action: string }>;
  counters?: Array<{ label: string; value: string }>;
  triageSummary?: {
    unreadableCount: number;
    blackFrameCount: number;
  };
  burstSummary?: {
    burstCount: number;
    bestPickCount: number;
  };
  reviewFolder?: string;
  badges?: Array<{ label: string; variant: "safe" | "unsafe" | "neutral"; action?: string }>;
};

export type FormCard = {
  kind: "form";
  id: string;
  role: "baxbot";
  title: string;
  fieldId: string;
  placeholder?: string;
  defaultValue?: string;
  chips?: Array<{ label: string; value: string }>;
  submitButton: { label: string; action: string };
};

export type TemplatePickerCard = {
  kind: "template-picker";
  id: string;
  role: "baxbot";
  presets: FolderTemplate[];
};

export type ImportCard = {
  kind: "import";
  id: string;
  role: "baxbot";
  source: { label: string; path: string } | null;
  projectName: string;
  saveTo: string;
  saveToLabel: string;
  optionsExpanded: boolean;
  verifyMode: "none" | "sentinel" | "full";
  dedupeEnabled: boolean;
  folderTemplateName: string;
};

export type StageProgressCard = {
  kind: "stage-progress";
  id: string;
  role: "baxbot";
  projectName: string;
  stages: Array<{ id: string; label: string; status: "pending" | "active" | "done" }>;
  currentStageProgress: number;
  statusLine: string;
};

export type TimelineEntry =
  | TextMessage
  | ActionCard
  | StatusCard
  | ResultCard
  | FormCard
  | TemplatePickerCard
  | ImportCard
  | StageProgressCard;

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
  hasAiOnboardingDone: boolean;
  presets?: FolderTemplate[];
}): TimelineEntry[] {
  const {
    suggestedSources,
    recentProjects,
    hasStorageConfig,
    hasFolderTemplate,
    hasCompletedProfileSetup,
    hasAiOnboardingDone,
    presets,
  } = opts;

  // ── State: storage_missing ──
  if (!hasStorageConfig) {
    return [
      {
        kind: "text",
        id: "welcome",
        role: "baxbot",
        body: COPY.welcomeGreeting,
      },
      {
        kind: "action",
        id: "setup-storage",
        role: "baxbot",
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
        role: "baxbot",
        body: COPY.storageDone,
      },
      {
        kind: "text",
        id: "layout-prompt",
        role: "baxbot",
        body: COPY.layoutPrompt,
      },
      {
        kind: "template-picker",
        id: "setup-layout",
        role: "baxbot",
        presets: presets ?? [],
      },
    ];
  }

  // ── State: profile_missing ──
  if (!hasCompletedProfileSetup) {
    return [
      {
        kind: "text",
        id: "profile-prompt",
        role: "baxbot",
        body: COPY.profilePromptInline,
      },
      {
        kind: "action",
        id: "setup-profile",
        role: "baxbot",
        title: COPY.profileTitleInline,
        description: COPY.profileDescription,
        primaryButton: { label: COPY.profileTurnOn, action: "open-profile-setup" },
        secondaryButtons: [{ label: COPY.profileNotNow, action: "skip-profile-setup" }],
      },
    ];
  }

  // ── State: ai_optional (optional AI setup question) ──
  if (!hasAiOnboardingDone) {
    return [
      {
        kind: "text",
        id: "ai-prompt",
        role: "baxbot",
        body: COPY.aiPromptInline,
      },
      {
        kind: "action",
        id: "setup-ai",
        role: "baxbot",
        title: COPY.aiTitleInline,
        description: COPY.aiDescription,
        primaryButton: { label: COPY.aiSetupNow, action: "open-ai-setup" },
        secondaryButtons: [{ label: COPY.aiNotNow, action: "skip-ai-setup" }],
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
        role: "baxbot",
        body: COPY.detectedSourceBody(label),
      },
      {
        kind: "action",
        id: "import-detected",
        role: "baxbot",
        title: COPY.savePhotosSafely,
        primaryButton: { label: COPY.savePhotosSafely, action: "import-detected" },
        secondaryButtons: [{ label: COPY.notNow, action: "dismiss-detected" }],
      },
    ];

    if (recentProjects.length > 0) {
      entries.push({
        kind: "action",
        id: "recent-projects",
        role: "baxbot",
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
      role: "baxbot",
      body: COPY.readyWhenYouAre,
    },
    {
      kind: "action",
      id: "import-open",
      role: "baxbot",
      title: COPY.savePhotosSafely,
      primaryButton: { label: COPY.savePhotosSafely, action: "open-import" },
    },
  ];

  if (recentProjects.length > 0) {
    entries.push({
      kind: "action",
      id: "recent-projects",
      role: "baxbot",
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
      role: "baxbot",
      body: COPY.namingPrompt,
    },
    {
      kind: "form",
      id: "project-name-form",
      role: "baxbot",
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

/**
 * Build the import card timeline entries (replaces naming form in the new flow).
 */
export function buildImportTimeline(opts: {
  source: { label: string; path: string } | null;
  projectName: string;
  saveTo: string;
  saveToLabel: string;
  verifyMode: "none" | "sentinel" | "full";
  dedupeEnabled: boolean;
  folderTemplateName: string;
}): TimelineEntry[] {
  const entries: TimelineEntry[] = [];
  if (opts.source) {
    entries.push({
      kind: "text",
      id: "import-intro",
      role: "baxbot",
      body: COPY.detectedSourceBody(opts.source.label),
    });
  }
  entries.push({
    kind: "import",
    id: "import-card",
    role: "baxbot",
    source: opts.source,
    projectName: opts.projectName,
    saveTo: opts.saveTo,
    saveToLabel: opts.saveToLabel,
    optionsExpanded: false,
    verifyMode: opts.verifyMode,
    dedupeEnabled: opts.dedupeEnabled,
    folderTemplateName: opts.folderTemplateName,
  });
  return entries;
}

/**
 * Build a folder tree preview string from a FolderTemplate.
 */
export function buildTemplateTree(template: FolderTemplate): string {
  const lines: string[] = [];
  lines.push("ProjectName/");
  const dirs: string[] = [];
  for (const rule of template.routing_rules) {
    // Extract the top-level folder from dest_pattern
    const topDir = rule.dest_pattern.split("/")[0];
    if (topDir && !dirs.includes(topDir)) {
      dirs.push(topDir);
    }
  }
  for (const dir of template.scaffold_dirs) {
    const topDir = dir.split("/")[0];
    if (!dirs.includes(topDir)) {
      dirs.push(topDir);
    }
  }
  for (const dir of dirs) {
    lines.push(`  ${dir}/`);
  }
  return lines.join("\n");
}
