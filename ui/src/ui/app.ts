import { LitElement } from "lit";
import { customElement, state } from "lit/decorators.js";
import type { FolderTemplate } from "../../../src/photo/folder-template.js";
import type { EventLogEntry } from "./app-events.ts";
import type { AppViewState } from "./app-view-state.ts";
import type { DevicePairingList } from "./controllers/devices.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { ExecApprovalsFile, ExecApprovalsSnapshot } from "./controllers/exec-approvals.ts";
import type {
  IngestProgress,
  IngestResult,
  IngestStage,
  RecentProject,
  SuggestedSource,
  VolumeEntry,
} from "./controllers/ingest.ts";
import type { SkillMessage } from "./controllers/skills.ts";
import type { TimelineEntry } from "./controllers/studio-manager.ts";
import type { GatewayBrowserClient, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { ResolvedTheme, ThemeMode } from "./theme.ts";
import type {
  AgentsListResult,
  AgentsFilesListResult,
  AgentIdentityResult,
  ConfigSnapshot,
  ConfigUiHints,
  CronJob,
  CronRunLogEntry,
  CronStatus,
  HealthSnapshot,
  LogEntry,
  LogLevel,
  PresenceEntry,
  ChannelsStatusSnapshot,
  SessionsListResult,
  SkillStatusReport,
  StatusSummary,
  NostrProfile,
} from "./types.ts";
import type { NostrProfileFormState } from "./views/channels.nostr-profile-form.ts";
import {
  handleChannelConfigReload as handleChannelConfigReloadInternal,
  handleChannelConfigSave as handleChannelConfigSaveInternal,
  handleNostrProfileCancel as handleNostrProfileCancelInternal,
  handleNostrProfileEdit as handleNostrProfileEditInternal,
  handleNostrProfileFieldChange as handleNostrProfileFieldChangeInternal,
  handleNostrProfileImport as handleNostrProfileImportInternal,
  handleNostrProfileSave as handleNostrProfileSaveInternal,
  handleNostrProfileToggleAdvanced as handleNostrProfileToggleAdvancedInternal,
  handleWhatsAppLogout as handleWhatsAppLogoutInternal,
  handleWhatsAppStart as handleWhatsAppStartInternal,
  handleWhatsAppWait as handleWhatsAppWaitInternal,
} from "./app-channels.ts";
import {
  handleAbortChat as handleAbortChatInternal,
  handleSendChat as handleSendChatInternal,
  removeQueuedMessage as removeQueuedMessageInternal,
} from "./app-chat.ts";
import { DEFAULT_CRON_FORM, DEFAULT_LOG_LEVEL_FILTERS } from "./app-defaults.ts";
import { connectGateway as connectGatewayInternal } from "./app-gateway.ts";
import {
  handleConnected,
  handleDisconnected,
  handleFirstUpdated,
  handleUpdated,
} from "./app-lifecycle.ts";
import { renderApp } from "./app-render.ts";
import {
  exportLogs as exportLogsInternal,
  handleChatScroll as handleChatScrollInternal,
  handleLogsScroll as handleLogsScrollInternal,
  resetChatScroll as resetChatScrollInternal,
  scheduleChatScroll as scheduleChatScrollInternal,
} from "./app-scroll.ts";
import {
  applySettings as applySettingsInternal,
  loadCron as loadCronInternal,
  loadOverview as loadOverviewInternal,
  setTab as setTabInternal,
  setTheme as setThemeInternal,
  onPopState as onPopStateInternal,
} from "./app-settings.ts";
import {
  resetToolStream as resetToolStreamInternal,
  type ToolStreamEntry,
  type CompactionStatus,
} from "./app-tool-stream.ts";
import { normalizeAssistantIdentity } from "./assistant-identity.ts";
import { loadAssistantIdentity as loadAssistantIdentityInternal } from "./controllers/assistant-identity.ts";
import { loadFolderTemplate, ALL_PRESETS } from "./controllers/folder-template.ts";
import { loadStorageConfig, formatPathLabel, type StorageConfig } from "./controllers/storage.ts";
import { loadStudioProfile, type StudioProfile } from "./controllers/studio-profile.ts";
import { loadSettings, type UiSettings } from "./storage.ts";
import { type ChatAttachment, type ChatQueueItem, type CronFormState } from "./ui-types.ts";

declare global {
  interface Window {
    __OPENCLAW_CONTROL_UI_BASE_PATH__?: string;
  }
}

function formatBytesSimple(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function suggestProjectNameClient(sourcePath: string): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const segments = sourcePath.split(/[/\\]/).filter(Boolean);
  const last = segments.at(-1);
  if (!last) {
    return "";
  }
  const sanitized = last.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ymd}_${sanitized}`;
}

const bootAssistantIdentity = normalizeAssistantIdentity({});

function resolveOnboardingMode(): boolean {
  if (!window.location.search) {
    return false;
  }
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("onboarding");
  if (!raw) {
    return false;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

@customElement("openclaw-app")
export class OpenClawApp extends LitElement {
  @state() settings: UiSettings = loadSettings();
  @state() password = "";
  @state() tab: Tab = "chat";
  @state() onboarding = resolveOnboardingMode();
  @state() connected = false;
  @state() theme: ThemeMode = this.settings.theme ?? "system";
  @state() themeResolved: ResolvedTheme = "dark";
  @state() hello: GatewayHelloOk | null = null;
  @state() lastError: string | null = null;
  @state() eventLog: EventLogEntry[] = [];
  private eventLogBuffer: EventLogEntry[] = [];
  private toolStreamSyncTimer: number | null = null;
  private sidebarCloseTimer: number | null = null;

  @state() assistantName = bootAssistantIdentity.name;
  @state() assistantAvatar = bootAssistantIdentity.avatar;
  @state() assistantAgentId = bootAssistantIdentity.agentId ?? null;

  @state() sessionKey = this.settings.sessionKey;
  @state() chatLoading = false;
  @state() chatSending = false;
  @state() chatMessage = "";
  @state() chatMessages: unknown[] = [];
  @state() chatToolMessages: unknown[] = [];
  @state() chatStream: string | null = null;
  @state() chatStreamStartedAt: number | null = null;
  @state() chatRunId: string | null = null;
  @state() compactionStatus: CompactionStatus | null = null;
  @state() chatAvatarUrl: string | null = null;
  @state() chatThinkingLevel: string | null = null;
  @state() chatQueue: ChatQueueItem[] = [];
  @state() chatAttachments: ChatAttachment[] = [];
  @state() chatManualRefreshInFlight = false;
  // Sidebar state for tool output viewing
  @state() sidebarOpen = false;
  @state() sidebarContent: string | null = null;
  @state() sidebarError: string | null = null;
  @state() splitRatio = this.settings.splitRatio;

  // Ingest modal state
  @state() ingestStage: IngestStage = "idle";
  @state() ingestSourcePath = "";
  @state() ingestDestPath = "";
  @state() ingestProjectName = "";
  @state() ingestProgress: IngestProgress | null = null;
  @state() ingestResult: IngestResult | null = null;
  @state() ingestError: string | null = null;
  @state() ingestRunId: string | null = null;
  @state() ingestVerifyMode: "none" | "sentinel" = "none";
  @state() ingestDedupeEnabled = false;
  @state() ingestRecentProjects: RecentProject[] = [];
  @state() ingestSuggestedSources: SuggestedSource[] = [];
  private ingestSuggestedName = "";
  // Deferred modal open via ?modal=ingest&source_path=... query params
  private pendingModalIngest = false;
  private pendingSourcePath: string | null = null;
  private lastProgressUpdateAt = 0;

  // Folder template state
  @state() folderTemplate: FolderTemplate | null = loadFolderTemplate();
  @state() isFolderTemplatePickerOpen = false;
  @state() folderTemplatePickerSelected: FolderTemplate | null = null;
  @state() folderTemplatePickerCustom: FolderTemplate | null = null;
  @state() smartOrganizerStatus: import("./controllers/ai-provider.ts").SmartOrganizerStatus =
    "not_installed";
  @state() smartOrganizerPrompt = "";
  @state() smartOrganizerGenerating = false;
  @state() smartOrganizerError: string | null = null;
  @state() smartOrganizerStatusMessage: string | null = null;
  @state() smartOrganizerDevInfo: string | null = null;

  // Storage setup state
  @state() storageConfig: StorageConfig | null = loadStorageConfig();
  @state() isStorageSetupOpen = false;
  @state() storageSetupVolumes: VolumeEntry[] = [];
  @state() storageSetupVolumesLoading = false;
  @state() storageSetupPrimaryDest = "";
  @state() storageSetupBackupDest = "";

  // Studio Profile
  @state() studioProfile: StudioProfile = loadStudioProfile();
  @state() isStudioProfileOpen = false;

  // Studio Manager timeline
  @state() studioTimeline: TimelineEntry[] = [];
  @state() studioFormValues: Record<string, string> = {};
  @state() studioIngestPendingSource: import("./controllers/ingest.ts").SuggestedSource | null =
    null;
  // Import card options expanded
  @state() importOptionsExpanded = false;
  // Settings sheet (normal mode overlay)
  @state() isSettingsSheetOpen = false;
  // Diagnostics export
  @state() diagnosticsExporting = false;
  // Server-side settings sync
  @state() serverSettingsLoaded = false;
  private settingsSyncTimer: number | null = null;

  @state() nodesLoading = false;
  @state() nodes: Array<Record<string, unknown>> = [];
  @state() devicesLoading = false;
  @state() devicesError: string | null = null;
  @state() devicesList: DevicePairingList | null = null;
  @state() execApprovalsLoading = false;
  @state() execApprovalsSaving = false;
  @state() execApprovalsDirty = false;
  @state() execApprovalsSnapshot: ExecApprovalsSnapshot | null = null;
  @state() execApprovalsForm: ExecApprovalsFile | null = null;
  @state() execApprovalsSelectedAgent: string | null = null;
  @state() execApprovalsTarget: "gateway" | "node" = "gateway";
  @state() execApprovalsTargetNodeId: string | null = null;
  @state() execApprovalQueue: ExecApprovalRequest[] = [];
  @state() execApprovalBusy = false;
  @state() execApprovalError: string | null = null;
  @state() pendingGatewayUrl: string | null = null;

  @state() configLoading = false;
  @state() configRaw = "{\n}\n";
  @state() configRawOriginal = "";
  @state() configValid: boolean | null = null;
  @state() configIssues: unknown[] = [];
  @state() configSaving = false;
  @state() configApplying = false;
  @state() updateRunning = false;
  @state() applySessionKey = this.settings.lastActiveSessionKey;
  @state() configSnapshot: ConfigSnapshot | null = null;
  @state() configSchema: unknown = null;
  @state() configSchemaVersion: string | null = null;
  @state() configSchemaLoading = false;
  @state() configUiHints: ConfigUiHints = {};
  @state() configForm: Record<string, unknown> | null = null;
  @state() configFormOriginal: Record<string, unknown> | null = null;
  @state() configFormDirty = false;
  @state() configFormMode: "form" | "raw" = "form";
  @state() configSearchQuery = "";
  @state() configActiveSection: string | null = null;
  @state() configActiveSubsection: string | null = null;

  @state() channelsLoading = false;
  @state() channelsSnapshot: ChannelsStatusSnapshot | null = null;
  @state() channelsError: string | null = null;
  @state() channelsLastSuccess: number | null = null;
  @state() whatsappLoginMessage: string | null = null;
  @state() whatsappLoginQrDataUrl: string | null = null;
  @state() whatsappLoginConnected: boolean | null = null;
  @state() whatsappBusy = false;
  @state() nostrProfileFormState: NostrProfileFormState | null = null;
  @state() nostrProfileAccountId: string | null = null;

  @state() presenceLoading = false;
  @state() presenceEntries: PresenceEntry[] = [];
  @state() presenceError: string | null = null;
  @state() presenceStatus: string | null = null;

  @state() agentsLoading = false;
  @state() agentsList: AgentsListResult | null = null;
  @state() agentsError: string | null = null;
  @state() agentsSelectedId: string | null = null;
  @state() agentsPanel: "overview" | "files" | "tools" | "skills" | "channels" | "cron" =
    "overview";
  @state() agentFilesLoading = false;
  @state() agentFilesError: string | null = null;
  @state() agentFilesList: AgentsFilesListResult | null = null;
  @state() agentFileContents: Record<string, string> = {};
  @state() agentFileDrafts: Record<string, string> = {};
  @state() agentFileActive: string | null = null;
  @state() agentFileSaving = false;
  @state() agentIdentityLoading = false;
  @state() agentIdentityError: string | null = null;
  @state() agentIdentityById: Record<string, AgentIdentityResult> = {};
  @state() agentSkillsLoading = false;
  @state() agentSkillsError: string | null = null;
  @state() agentSkillsReport: SkillStatusReport | null = null;
  @state() agentSkillsAgentId: string | null = null;

  @state() sessionsLoading = false;
  @state() sessionsResult: SessionsListResult | null = null;
  @state() sessionsError: string | null = null;
  @state() sessionsFilterActive = "";
  @state() sessionsFilterLimit = "120";
  @state() sessionsIncludeGlobal = true;
  @state() sessionsIncludeUnknown = false;

  @state() usageLoading = false;
  @state() usageResult: import("./types.js").SessionsUsageResult | null = null;
  @state() usageCostSummary: import("./types.js").CostUsageSummary | null = null;
  @state() usageError: string | null = null;
  @state() usageStartDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageEndDate = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  @state() usageSelectedSessions: string[] = [];
  @state() usageSelectedDays: string[] = [];
  @state() usageSelectedHours: number[] = [];
  @state() usageChartMode: "tokens" | "cost" = "tokens";
  @state() usageDailyChartMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeriesMode: "cumulative" | "per-turn" = "per-turn";
  @state() usageTimeSeriesBreakdownMode: "total" | "by-type" = "by-type";
  @state() usageTimeSeries: import("./types.js").SessionUsageTimeSeries | null = null;
  @state() usageTimeSeriesLoading = false;
  @state() usageSessionLogs: import("./views/usage.js").SessionLogEntry[] | null = null;
  @state() usageSessionLogsLoading = false;
  @state() usageSessionLogsExpanded = false;
  // Applied query (used to filter the already-loaded sessions list client-side).
  @state() usageQuery = "";
  // Draft query text (updates immediately as the user types; applied via debounce or "Search").
  @state() usageQueryDraft = "";
  @state() usageSessionSort: "tokens" | "cost" | "recent" | "messages" | "errors" = "recent";
  @state() usageSessionSortDir: "desc" | "asc" = "desc";
  @state() usageRecentSessions: string[] = [];
  @state() usageTimeZone: "local" | "utc" = "local";
  @state() usageContextExpanded = false;
  @state() usageHeaderPinned = false;
  @state() usageSessionsTab: "all" | "recent" = "all";
  @state() usageVisibleColumns: string[] = [
    "channel",
    "agent",
    "provider",
    "model",
    "messages",
    "tools",
    "errors",
    "duration",
  ];
  @state() usageLogFilterRoles: import("./views/usage.js").SessionLogRole[] = [];
  @state() usageLogFilterTools: string[] = [];
  @state() usageLogFilterHasTools = false;
  @state() usageLogFilterQuery = "";

  // Non-reactive (don’t trigger renders just for timer bookkeeping).
  usageQueryDebounceTimer: number | null = null;

  @state() cronLoading = false;
  @state() cronJobs: CronJob[] = [];
  @state() cronStatus: CronStatus | null = null;
  @state() cronError: string | null = null;
  @state() cronForm: CronFormState = { ...DEFAULT_CRON_FORM };
  @state() cronRunsJobId: string | null = null;
  @state() cronRuns: CronRunLogEntry[] = [];
  @state() cronBusy = false;

  @state() skillsLoading = false;
  @state() skillsReport: SkillStatusReport | null = null;
  @state() skillsError: string | null = null;
  @state() skillsFilter = "";
  @state() skillEdits: Record<string, string> = {};
  @state() skillsBusyKey: string | null = null;
  @state() skillMessages: Record<string, SkillMessage> = {};

  @state() debugLoading = false;
  @state() debugStatus: StatusSummary | null = null;
  @state() debugHealth: HealthSnapshot | null = null;
  @state() debugModels: unknown[] = [];
  @state() debugHeartbeat: unknown = null;
  @state() debugCallMethod = "";
  @state() debugCallParams = "{}";
  @state() debugCallResult: string | null = null;
  @state() debugCallError: string | null = null;

  @state() logsLoading = false;
  @state() logsError: string | null = null;
  @state() logsFile: string | null = null;
  @state() logsEntries: LogEntry[] = [];
  @state() logsFilterText = "";
  @state() logsLevelFilters: Record<LogLevel, boolean> = {
    ...DEFAULT_LOG_LEVEL_FILTERS,
  };
  @state() logsAutoFollow = true;
  @state() logsTruncated = false;
  @state() logsCursor: number | null = null;
  @state() logsLastFetchAt: number | null = null;
  @state() logsLimit = 500;
  @state() logsMaxBytes = 250_000;
  @state() logsAtBottom = true;

  client: GatewayBrowserClient | null = null;
  private chatScrollFrame: number | null = null;
  private chatScrollTimeout: number | null = null;
  private chatHasAutoScrolled = false;
  private chatUserNearBottom = true;
  @state() chatNewMessagesBelow = false;
  private nodesPollInterval: number | null = null;
  private logsPollInterval: number | null = null;
  private debugPollInterval: number | null = null;
  private logsScrollFrame: number | null = null;
  private toolStreamById = new Map<string, ToolStreamEntry>();
  private toolStreamOrder: string[] = [];
  refreshSessionsAfterChat = new Set<string>();
  basePath = "";
  private popStateHandler = () =>
    onPopStateInternal(this as unknown as Parameters<typeof onPopStateInternal>[0]);
  private themeMedia: MediaQueryList | null = null;
  private themeMediaHandler: ((event: MediaQueryListEvent) => void) | null = null;
  private topbarObserver: ResizeObserver | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    handleConnected(this as unknown as Parameters<typeof handleConnected>[0]);
  }

  protected firstUpdated() {
    handleFirstUpdated(this as unknown as Parameters<typeof handleFirstUpdated>[0]);
  }

  disconnectedCallback() {
    handleDisconnected(this as unknown as Parameters<typeof handleDisconnected>[0]);
    super.disconnectedCallback();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    handleUpdated(this as unknown as Parameters<typeof handleUpdated>[0], changed);
  }

  connect() {
    connectGatewayInternal(this as unknown as Parameters<typeof connectGatewayInternal>[0]);
  }

  handleChatScroll(event: Event) {
    handleChatScrollInternal(
      this as unknown as Parameters<typeof handleChatScrollInternal>[0],
      event,
    );
  }

  handleLogsScroll(event: Event) {
    handleLogsScrollInternal(
      this as unknown as Parameters<typeof handleLogsScrollInternal>[0],
      event,
    );
  }

  exportLogs(lines: string[], label: string) {
    exportLogsInternal(lines, label);
  }

  resetToolStream() {
    resetToolStreamInternal(this as unknown as Parameters<typeof resetToolStreamInternal>[0]);
  }

  resetChatScroll() {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
  }

  scrollToBottom(opts?: { smooth?: boolean }) {
    resetChatScrollInternal(this as unknown as Parameters<typeof resetChatScrollInternal>[0]);
    scheduleChatScrollInternal(
      this as unknown as Parameters<typeof scheduleChatScrollInternal>[0],
      true,
      Boolean(opts?.smooth),
    );
  }

  async loadAssistantIdentity() {
    await loadAssistantIdentityInternal(this);
  }

  applySettings(next: UiSettings) {
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], next);
    this.scheduleSettingsSync();
  }

  /** Debounced push of current settings to server (300ms). */
  scheduleSettingsSync() {
    if (!this.client || !this.serverSettingsLoaded) {
      return;
    }
    if (this.settingsSyncTimer != null) {
      window.clearTimeout(this.settingsSyncTimer);
    }
    this.settingsSyncTimer = window.setTimeout(() => {
      this.settingsSyncTimer = null;
      void this.pushSettingsToServer();
    }, 300);
  }

  private async pushSettingsToServer() {
    if (!this.client) {
      return;
    }
    try {
      const { pushServerSettings } = await import("./controllers/settings-sync.ts");
      await pushServerSettings(this.client, {
        preferences: {
          theme: this.settings.theme,
          developerMode: this.settings.developerMode,
          defaultSaveLocation: this.settings.defaultSaveLocation,
          defaultVerifyMode: this.settings.defaultVerifyMode,
          chatFocusMode: this.settings.chatFocusMode,
          chatShowThinking: this.settings.chatShowThinking,
          splitRatio: this.settings.splitRatio,
          navCollapsed: this.settings.navCollapsed,
          navGroupsCollapsed: this.settings.navGroupsCollapsed,
        },
        storageConfig: this.storageConfig,
        studioProfile: this.studioProfile.completedSetup ? this.studioProfile : null,
        folderTemplate: this.folderTemplate,
        recentProjects: this.ingestRecentProjects,
      });
    } catch (err) {
      console.error("[settings-sync] push failed:", err);
    }
  }

  setTab(next: Tab) {
    setTabInternal(this as unknown as Parameters<typeof setTabInternal>[0], next);
  }

  setTheme(next: ThemeMode, context?: Parameters<typeof setThemeInternal>[2]) {
    setThemeInternal(this as unknown as Parameters<typeof setThemeInternal>[0], next, context);
  }

  async loadOverview() {
    await loadOverviewInternal(this as unknown as Parameters<typeof loadOverviewInternal>[0]);
  }

  async loadCron() {
    await loadCronInternal(this as unknown as Parameters<typeof loadCronInternal>[0]);
  }

  async handleAbortChat() {
    await handleAbortChatInternal(this as unknown as Parameters<typeof handleAbortChatInternal>[0]);
  }

  removeQueuedMessage(id: string) {
    removeQueuedMessageInternal(
      this as unknown as Parameters<typeof removeQueuedMessageInternal>[0],
      id,
    );
  }

  async handleSendChat(
    messageOverride?: string,
    opts?: Parameters<typeof handleSendChatInternal>[2],
  ) {
    await handleSendChatInternal(
      this as unknown as Parameters<typeof handleSendChatInternal>[0],
      messageOverride,
      opts,
    );
  }

  async handleWhatsAppStart(force: boolean) {
    await handleWhatsAppStartInternal(this, force);
  }

  async handleWhatsAppWait() {
    await handleWhatsAppWaitInternal(this);
  }

  async handleWhatsAppLogout() {
    await handleWhatsAppLogoutInternal(this);
  }

  async handleChannelConfigSave() {
    await handleChannelConfigSaveInternal(this);
  }

  async handleChannelConfigReload() {
    await handleChannelConfigReloadInternal(this);
  }

  handleNostrProfileEdit(accountId: string, profile: NostrProfile | null) {
    handleNostrProfileEditInternal(this, accountId, profile);
  }

  handleNostrProfileCancel() {
    handleNostrProfileCancelInternal(this);
  }

  handleNostrProfileFieldChange(field: keyof NostrProfile, value: string) {
    handleNostrProfileFieldChangeInternal(this, field, value);
  }

  async handleNostrProfileSave() {
    await handleNostrProfileSaveInternal(this);
  }

  async handleNostrProfileImport() {
    await handleNostrProfileImportInternal(this);
  }

  handleNostrProfileToggleAdvanced() {
    handleNostrProfileToggleAdvancedInternal(this);
  }

  async handleExecApprovalDecision(decision: "allow-once" | "allow-always" | "deny") {
    const active = this.execApprovalQueue[0];
    if (!active || !this.client || this.execApprovalBusy) {
      return;
    }
    this.execApprovalBusy = true;
    this.execApprovalError = null;
    try {
      await this.client.request("exec.approval.resolve", {
        id: active.id,
        decision,
      });
      this.execApprovalQueue = this.execApprovalQueue.filter((entry) => entry.id !== active.id);
    } catch (err) {
      this.execApprovalError = `Exec approval failed: ${String(err)}`;
    } finally {
      this.execApprovalBusy = false;
    }
  }

  handleGatewayUrlConfirm() {
    const nextGatewayUrl = this.pendingGatewayUrl;
    if (!nextGatewayUrl) {
      return;
    }
    this.pendingGatewayUrl = null;
    applySettingsInternal(this as unknown as Parameters<typeof applySettingsInternal>[0], {
      ...this.settings,
      gatewayUrl: nextGatewayUrl,
    });
    this.connect();
  }

  handleGatewayUrlCancel() {
    this.pendingGatewayUrl = null;
  }

  // Ingest handlers
  /** Called after gateway connects to open deferred modals from URL params. */
  consumePendingModal() {
    this.rebuildStudioTimeline();
    if (!this.pendingModalIngest) {
      return;
    }
    this.pendingModalIngest = false;
    const prefillSource = this.pendingSourcePath;
    this.pendingSourcePath = null;
    void this.handleIngestOpen().then(() => {
      if (prefillSource) {
        this.handleIngestSourcePathChange(prefillSource);
      }
    });
    // Clean the URL params so refresh doesn't re-trigger
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("modal");
      url.searchParams.delete("source_path");
      window.history.replaceState({}, "", url.toString());
    } catch {
      /* ignore */
    }
  }

  /** Read URL params and stash for deferred opening after gateway connects. */
  readModalParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("modal") === "ingest") {
        this.pendingModalIngest = true;
        const sourcePath = params.get("source_path");
        if (sourcePath) {
          this.pendingSourcePath = decodeURIComponent(sourcePath);
        }
      }
    } catch {
      /* ignore */
    }
  }

  async handleIngestOpen() {
    const { loadRecentProjects, listVolumes } = await import("./controllers/ingest.ts");
    this.ingestStage = "prompting";
    this.ingestSourcePath = "";
    this.ingestDestPath =
      this.storageConfig?.primaryDest || this.settings.defaultSaveLocation || "~/Pictures/BaxBot";
    this.ingestProjectName = "";
    this.ingestVerifyMode = this.settings.defaultVerifyMode || "none";
    this.ingestDedupeEnabled = false;
    this.ingestProgress = null;
    this.ingestResult = null;
    this.ingestError = null;
    this.ingestRunId = null;
    this.ingestSuggestedName = "";
    this.ingestRecentProjects = loadRecentProjects();
    this.ingestSuggestedSources = [];
    // Load detected volumes in the background
    if (this.client) {
      listVolumes(this.client)
        .then((result) => {
          this.ingestSuggestedSources = result.suggestedSources;
        })
        .catch(() => {
          // Silently ignore — detected sources are a convenience, not critical
        });
    }
  }

  handleIngestSourcePathChange(v: string) {
    this.ingestSourcePath = v;
    // Auto-suggest project name if user hasn't typed a custom name
    if (!this.ingestProjectName || this.ingestProjectName === this.ingestSuggestedName) {
      const suggested = suggestProjectNameClient(v);
      this.ingestSuggestedName = suggested;
      this.ingestProjectName = suggested;
    }
  }

  async handleIngestPickSource() {
    if (!this.client) {
      return;
    }
    const { pickFolder } = await import("./controllers/ingest.ts");
    try {
      const result = await pickFolder(this.client, { prompt: "Choose source folder" });
      if (result.ok) {
        this.handleIngestSourcePathChange(result.path);
      }
    } catch (err) {
      console.error("Failed to pick source folder:", err);
    }
  }

  async handleIngestPickDest() {
    if (!this.client) {
      return;
    }
    const { pickFolder } = await import("./controllers/ingest.ts");
    try {
      const result = await pickFolder(this.client, { prompt: "Choose destination folder" });
      if (result.ok) {
        this.ingestDestPath = result.path;
      }
    } catch (err) {
      console.error("Failed to pick destination folder:", err);
    }
  }

  handleIngestSelectSuggestedSource(s: SuggestedSource) {
    this.handleIngestSourcePathChange(s.path);
  }

  handleIngestClose() {
    this.ingestStage = "idle";
    this.ingestRunId = null;
  }

  async handleIngestStart() {
    if (
      !this.client ||
      !this.ingestSourcePath.trim() ||
      !this.ingestDestPath.trim() ||
      !this.ingestProjectName.trim()
    ) {
      return;
    }
    this.ingestStage = "running";
    this.ingestProgress = null;
    this.ingestError = null;
    this.lastProgressUpdateAt = 0;
    try {
      const xmpPatch = this.studioProfile.enabled
        ? {
            creator: this.studioProfile.displayName || undefined,
            rights: this.studioProfile.copyrightLine || undefined,
            credit: this.studioProfile.studioName || undefined,
            webStatement: this.studioProfile.website || undefined,
          }
        : undefined;
      const { runIngestVerify, saveRecentProject } = await import("./controllers/ingest.ts");
      const result = await runIngestVerify(this.client, {
        source_path: this.ingestSourcePath.trim(),
        dest_project_path: this.ingestDestPath.trim(),
        project_name: this.ingestProjectName.trim(),
        verify_mode: this.ingestVerifyMode,
        hash_algo: "blake3",
        overwrite: false,
        dedupe: this.ingestDedupeEnabled,
        backup_dest: this.storageConfig?.backupDest || undefined,
        folder_template: this.folderTemplate ?? undefined,
        xmp_patch: xmpPatch,
      });
      this.ingestResult = result;
      this.ingestStage = "done";
      if (result.ok && result.project_root) {
        const newProject = {
          projectName: this.ingestProjectName.trim(),
          projectRoot: result.project_root,
          reportPath: result.report_path,
          destPath: this.ingestDestPath.trim(),
          sourcePath: this.ingestSourcePath.trim(),
          timestamp: Date.now(),
        };
        saveRecentProject(newProject);
        // Update in-memory list and sync to server
        const existing = this.ingestRecentProjects.filter(
          (r) => r.projectRoot !== newProject.projectRoot,
        );
        this.ingestRecentProjects = [newProject, ...existing].slice(0, 5);
        this.scheduleSettingsSync();
      }
    } catch (err) {
      this.ingestError = err instanceof Error ? err.message : String(err);
      this.ingestStage = "error";
    }
  }

  async handleIngestOpenReport() {
    if (!this.client || !this.ingestResult?.report_path || !this.ingestResult?.project_root) {
      return;
    }
    const { openPath } = await import("./controllers/ingest.ts");
    try {
      await openPath(this.client, this.ingestResult.report_path, this.ingestResult.project_root);
    } catch (err) {
      console.error("Failed to open report:", err);
    }
  }

  async handleIngestRevealProject() {
    if (!this.client || !this.ingestResult?.project_root) {
      return;
    }
    const { openPath } = await import("./controllers/ingest.ts");
    try {
      await openPath(
        this.client,
        this.ingestResult.project_root,
        this.ingestResult.project_root,
        true,
      );
    } catch (err) {
      console.error("Failed to reveal project:", err);
    }
  }

  async handleStartEditing() {
    if (!this.client || !this.ingestResult?.project_root) {
      return;
    }
    const editorHint = this.studioProfile.preferredEditor || "open_folder";
    const { openWithEditor } = await import("./controllers/ingest.ts");
    try {
      await openWithEditor(
        this.client,
        this.ingestResult.project_root,
        this.ingestResult.project_root,
        editorHint,
      );
    } catch (err) {
      console.error("Failed to open editor:", err);
      // Fallback: reveal in Finder
      void this.handleIngestRevealProject();
    }
  }

  async handleOpenReviewFolder() {
    if (!this.client || !this.ingestResult?.project_root) {
      return;
    }
    const reviewFolder = this.ingestResult.review_folder;
    const target = reviewFolder || this.ingestResult.project_root;
    const { openPath } = await import("./controllers/ingest.ts");
    try {
      await openPath(this.client, target, this.ingestResult.project_root, true);
    } catch (err) {
      console.error("Failed to open review folder:", err);
    }
  }

  handleIngestToolUpdate(payload: { runId?: string; update?: unknown }) {
    if (this.ingestStage !== "running") {
      return;
    }
    const update = payload.update as { details?: IngestProgress } | undefined;
    if (!update?.details?.type) {
      return;
    }
    const details = update.details;
    // Always pass through stage transitions and final events immediately
    const isStageChange = details.type !== this.ingestProgress?.type;
    const isFinal = details.type === "ingest.done" || details.type === "ingest.report.generated";
    if (isFinal || isStageChange) {
      this.ingestProgress = details;
      this.lastProgressUpdateAt = Date.now();
      this.updateStudioIngestProgress(details);
      return;
    }
    // Throttle to max 10 updates/sec for same-stage progress
    const now = Date.now();
    if (now - this.lastProgressUpdateAt >= 100) {
      this.ingestProgress = details;
      this.lastProgressUpdateAt = now;
      this.updateStudioIngestProgress(details);
    }
  }

  /** Update the Studio Manager timeline's progress card with latest progress. */
  private updateStudioIngestProgress(p: IngestProgress) {
    if (this.settings.developerMode) {
      return; // Dev mode uses the old modal
    }
    const progressIndex = this.studioTimeline.findIndex(
      (e) => (e.kind === "stage-progress" || e.kind === "status") && e.id === "ingest-progress",
    );
    if (progressIndex < 0) {
      return;
    }

    // Determine which stage is active
    type StageStatus = "pending" | "active" | "done";
    let copyStatus: StageStatus = "pending";
    let verifyStatus: StageStatus = "pending";
    let finalizeStatus: StageStatus = "pending";
    let stageProgress = 0;
    let statusLine = "Processing\u2026";

    const copyEvents = [
      "ingest.start",
      "ingest.scan.progress",
      "ingest.copy.progress",
      "ingest.backup.start",
      "ingest.backup.copy.progress",
    ];
    const verifyEvents = ["ingest.verify.progress", "ingest.backup.verify.progress"];
    const finalizeEvents = [
      "ingest.triage.start",
      "ingest.triage.progress",
      "ingest.triage.done",
      "ingest.burst.progress",
      "ingest.burst.done",
      "ingest.report.generated",
      "ingest.done",
    ];

    if (copyEvents.includes(p.type)) {
      copyStatus = "active";
      if (p.type === "ingest.copy.progress") {
        stageProgress = p.total ? Math.round(((p.index ?? 0) / p.total) * 100) : 0;
        statusLine = `${p.index ?? 0} of ${p.total ?? 0} files`;
      } else if (p.type === "ingest.backup.copy.progress") {
        stageProgress = p.total ? Math.round(((p.index ?? 0) / p.total) * 100) : 0;
        statusLine = `Backing up\u2026 ${p.index ? `${p.index} of ${p.total ?? 0}` : ""}`;
      } else {
        statusLine = p.discovered_count ? `${p.discovered_count} photos found` : "Scanning\u2026";
      }
    } else if (verifyEvents.includes(p.type)) {
      copyStatus = "done";
      verifyStatus = "active";
      stageProgress = p.verified_total
        ? Math.round(((p.verified_count ?? 0) / p.verified_total) * 100)
        : 0;
      statusLine = p.verified_total
        ? `${p.verified_count ?? 0} of ${p.verified_total} checked`
        : "Verifying\u2026";
    } else if (finalizeEvents.includes(p.type)) {
      copyStatus = "done";
      verifyStatus = "done";
      finalizeStatus = "active";
      if (p.type === "ingest.done") {
        finalizeStatus = "done";
        stageProgress = 100;
        statusLine = "All done!";
      } else {
        statusLine = "Writing Safety Report\u2026";
      }
    }

    const updated = [...this.studioTimeline];
    updated[progressIndex] = {
      kind: "stage-progress" as const,
      id: "ingest-progress",
      role: "cullmate" as const,
      projectName: this.ingestProjectName,
      stages: [
        { id: "copy", label: "Copying", status: copyStatus },
        { id: "verify", label: "Verifying", status: verifyStatus },
        { id: "finalize", label: "Finalizing report", status: finalizeStatus },
      ],
      currentStageProgress: stageProgress,
      statusLine,
    };
    this.studioTimeline = updated;
  }

  // Folder template handlers

  handleOpenFolderTemplatePicker() {
    this.isFolderTemplatePickerOpen = true;
    this.folderTemplatePickerSelected = this.folderTemplate ?? ALL_PRESETS[0];
    this.folderTemplatePickerCustom = null;
    this.smartOrganizerPrompt = "";
    this.smartOrganizerError = null;
    this.smartOrganizerGenerating = false;
    // Check Smart Organizer availability in background
    void this.checkSmartOrganizerStatus();
  }

  handleCloseFolderTemplatePicker() {
    this.isFolderTemplatePickerOpen = false;
  }

  handleSelectFolderTemplatePreset(t: FolderTemplate) {
    this.folderTemplatePickerSelected = t;
    this.folderTemplatePickerCustom = null;
  }

  handleSaveFolderTemplate(t: FolderTemplate) {
    this.folderTemplate = t;
    this.isFolderTemplatePickerOpen = false;
    this.scheduleSettingsSync();
  }

  handleSkipFolderTemplate() {
    // Save the classic preset as default
    this.folderTemplate = ALL_PRESETS[0];
    this.isFolderTemplatePickerOpen = false;
    this.scheduleSettingsSync();
  }

  async checkSmartOrganizerStatus() {
    try {
      const { createAIProvider } = await import("./controllers/ai-provider-factory.ts");
      const provider = createAIProvider({
        developerMode: this.settings.developerMode,
        client: this.client,
      });
      const result = await provider.status();
      this.smartOrganizerStatus = result.status;
      this.smartOrganizerStatusMessage = result.message ?? null;
      this.smartOrganizerDevInfo = result._dev
        ? `${result._dev.provider}${result._dev.endpoint ? ` (${result._dev.endpoint})` : ""}`
        : null;
    } catch {
      this.smartOrganizerStatus = "error";
      this.smartOrganizerStatusMessage = "Could not check availability.";
    }
  }

  async handleSmartOrganizerGenerate() {
    if (!this.smartOrganizerPrompt.trim()) {
      return;
    }
    this.smartOrganizerGenerating = true;
    this.smartOrganizerError = null;
    try {
      const { createAIProvider } = await import("./controllers/ai-provider-factory.ts");
      const { FOLDER_TEMPLATE_JSON_SCHEMA } =
        await import("./controllers/folder-templates/schema.ts");
      const provider = createAIProvider({
        developerMode: this.settings.developerMode,
        client: this.client,
      });
      const result = await provider.generateTemplate({
        prompt: this.smartOrganizerPrompt.trim(),
        presets: ALL_PRESETS.map((p) => ({
          id: p.template_id,
          title: p.name,
          description: p.description,
          exampleTree: p.routing_rules.map((r) => r.dest_pattern).join(", "),
        })),
        schema: FOLDER_TEMPLATE_JSON_SCHEMA,
      });
      if (result.ok) {
        this.folderTemplatePickerCustom = result.template;
        this.folderTemplatePickerSelected = null;
      } else {
        this.smartOrganizerError = result.error;
      }
    } catch {
      this.smartOrganizerError = "Could not create layout. Please try again.";
    } finally {
      this.smartOrganizerGenerating = false;
    }
  }

  handleTurnOnSmartOrganizer() {
    if (this.settings.developerMode) {
      // In dev mode, re-check status
      this.smartOrganizerError = null;
      void this.checkSmartOrganizerStatus().then(() => {
        if (this.smartOrganizerStatus !== "ready") {
          this.smartOrganizerError = "Smart Organizer is not running. Please try again.";
        }
      });
    } else {
      // Normal mode: coming soon
      this.smartOrganizerError = "Coming soon.";
    }
  }

  // Storage setup handlers

  /** Load volumes without resetting user-entered paths. Safe to call on reconnect. */
  loadStorageSetupVolumes() {
    if (!this.client) {
      return;
    }
    this.storageSetupVolumesLoading = true;
    import("./controllers/ingest.ts")
      .then(({ listVolumes }) => {
        listVolumes(this.client!)
          .then((result) => {
            this.storageSetupVolumes = result.volumes;
            this.storageSetupVolumesLoading = false;
          })
          .catch(() => {
            this.storageSetupVolumesLoading = false;
          });
      })
      .catch(() => {
        this.storageSetupVolumesLoading = false;
      });
  }

  /** Opens the storage setup dialog (from settings). Resets paths to current config. */
  handleOpenStorageSetup() {
    this.isStorageSetupOpen = true;
    this.storageSetupPrimaryDest = this.storageConfig?.primaryDest ?? "";
    this.storageSetupBackupDest = this.storageConfig?.backupDest ?? "";
    this.loadStorageSetupVolumes();
  }

  handleSaveStorageSetup(cfg: StorageConfig) {
    this.storageConfig = cfg;
    this.isStorageSetupOpen = false;
    // Update ingest dest path if the import modal is open
    if (this.ingestStage === "prompting") {
      this.ingestDestPath = cfg.primaryDest;
    }
    this.scheduleSettingsSync();
  }

  handleSaveStudioProfile(profile: StudioProfile) {
    this.studioProfile = profile;
    this.isStudioProfileOpen = false;
    this.scheduleSettingsSync();
  }

  async handleExportDiagnostics() {
    if (!this.client || this.diagnosticsExporting) {
      return;
    }
    this.diagnosticsExporting = true;
    try {
      const { exportDiagnostics, buildSafeSettingsSnapshot } =
        await import("./controllers/diagnostics.ts");
      const snapshot = buildSafeSettingsSnapshot(
        this.settings as unknown as Record<string, unknown>,
        this.storageConfig ? (this.storageConfig as unknown as Record<string, unknown>) : {},
      );
      await exportDiagnostics(this.client, { settingsSnapshot: snapshot });
    } catch {
      // Errors are expected if user cancels the save dialog.
    } finally {
      this.diagnosticsExporting = false;
    }
  }

  async handleStoragePickPrimary() {
    if (!this.client) {
      return;
    }
    const { pickFolder } = await import("./controllers/ingest.ts");
    try {
      const result = await pickFolder(this.client, { prompt: "Choose primary folder" });
      if (result.ok) {
        this.storageSetupPrimaryDest = result.path;
      }
    } catch (err) {
      console.error("[storage-setup] Failed to pick primary folder:", err);
    }
  }

  async handleStoragePickBackup() {
    if (!this.client) {
      return;
    }
    const { pickFolder } = await import("./controllers/ingest.ts");
    try {
      const result = await pickFolder(this.client, { prompt: "Choose backup folder" });
      if (result.ok) {
        this.storageSetupBackupDest = result.path;
      }
    } catch (err) {
      console.error("[storage-setup] Failed to pick backup folder:", err);
    }
  }

  handleStoragePrimaryChange(path: string) {
    this.storageSetupPrimaryDest = path;
  }

  handleStorageBackupChange(path: string) {
    this.storageSetupBackupDest = path;
  }

  // Sidebar handlers for tool output viewing
  handleOpenSidebar(content: string) {
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
      this.sidebarCloseTimer = null;
    }
    this.sidebarContent = content;
    this.sidebarError = null;
    this.sidebarOpen = true;
  }

  handleCloseSidebar() {
    this.sidebarOpen = false;
    // Clear content after transition
    if (this.sidebarCloseTimer != null) {
      window.clearTimeout(this.sidebarCloseTimer);
    }
    this.sidebarCloseTimer = window.setTimeout(() => {
      if (this.sidebarOpen) {
        return;
      }
      this.sidebarContent = null;
      this.sidebarError = null;
      this.sidebarCloseTimer = null;
    }, 200);
  }

  handleSplitRatioChange(ratio: number) {
    const newRatio = Math.max(0.4, Math.min(0.7, ratio));
    this.splitRatio = newRatio;
    this.applySettings({ ...this.settings, splitRatio: newRatio });
  }

  // Studio Manager

  handleStudioFormValueChange(fieldId: string, value: string) {
    this.studioFormValues = { ...this.studioFormValues, [fieldId]: value };
  }

  handleStudioFormSubmit(fieldId: string, value: string) {
    if (fieldId === "project-name" && this.studioIngestPendingSource) {
      void this.handleStudioIngestWithName(this.studioIngestPendingSource, value);
    }
  }

  handleStudioAction(action: string) {
    switch (action) {
      case "open-storage-setup":
        this.handleOpenStorageSetup();
        break;
      case "open-template-picker":
      case "open-template-describe":
        this.handleOpenFolderTemplatePicker();
        break;
      case "open-profile-setup":
      case "edit-profile":
        this.isStudioProfileOpen = true;
        break;
      case "skip-profile-setup":
        this.studioProfile = {
          ...this.studioProfile,
          enabled: false,
          completedSetup: true,
        };
        this.scheduleSettingsSync();
        this.rebuildStudioTimeline();
        break;
      case "open-ai-setup":
        this.applySettings({
          ...this.settings,
          aiFeaturesEnabled: true,
          aiOnboardingDone: true,
        });
        this.isSettingsSheetOpen = true;
        void this.checkSmartOrganizerStatus();
        this.rebuildStudioTimeline();
        break;
      case "skip-ai-setup":
        this.applySettings({
          ...this.settings,
          aiFeaturesEnabled: false,
          aiOnboardingDone: true,
        });
        this.rebuildStudioTimeline();
        break;
      case "open-import":
        if (this.settings.developerMode) {
          void this.handleIngestOpen();
        } else {
          // Normal mode: show import card with no source (user picks folder)
          this.studioIngestPendingSource = null;
          this.importOptionsExpanded = false;
          void import("./controllers/studio-manager.ts").then(({ buildImportTimeline }) => {
            const destPath = this.storageConfig?.primaryDest || "~/Pictures/BaxBot";
            this.studioTimeline = buildImportTimeline({
              source: null,
              projectName: "",
              saveTo: destPath,
              saveToLabel: formatPathLabel(destPath),
              verifyMode:
                (this.settings.defaultVerifyMode as "none" | "sentinel" | "full") || "sentinel",
              dedupeEnabled: false,
              folderTemplateName: this.folderTemplate?.name || "Classic",
            });
          });
        }
        break;
      case "open-settings":
        this.isSettingsSheetOpen = true;
        break;
      case "import-detected":
        if (this.ingestSuggestedSources.length > 0) {
          if (this.settings.developerMode) {
            this.handleIngestSelectSuggestedSource(this.ingestSuggestedSources[0]);
          } else {
            // Show import card with auto-populated fields
            const detectedSource = this.ingestSuggestedSources[0];
            this.studioIngestPendingSource = detectedSource;
            const smartName = suggestProjectNameClient(detectedSource.path);
            this.studioFormValues = { ...this.studioFormValues, "import-project-name": smartName };
            this.importOptionsExpanded = false;
            void import("./controllers/studio-manager.ts").then(({ buildImportTimeline }) => {
              const destPath = this.storageConfig?.primaryDest || "~/Pictures/BaxBot";
              this.studioTimeline = buildImportTimeline({
                source: {
                  label: detectedSource.label || formatPathLabel(detectedSource.path),
                  path: detectedSource.path,
                },
                projectName: smartName,
                saveTo: destPath,
                saveToLabel: formatPathLabel(destPath),
                verifyMode:
                  (this.settings.defaultVerifyMode as "none" | "sentinel" | "full") || "sentinel",
                dedupeEnabled: false,
                folderTemplateName: this.folderTemplate?.name || "Classic",
              });
            });
          }
        }
        break;
      case "start-import": {
        // Read project name from form values and start ingest
        const importProjectName = (this.studioFormValues["import-project-name"] ?? "").trim();
        if (this.studioIngestPendingSource && importProjectName) {
          void this.handleStudioIngestWithName(this.studioIngestPendingSource, importProjectName);
        }
        break;
      }
      case "toggle-import-options":
        this.importOptionsExpanded = !this.importOptionsExpanded;
        this.updateImportCardOptions();
        break;
      case "change-save-location":
        this.handleOpenStorageSetup();
        break;
      case "choose-import-folder":
        void this.handleIngestPickSource().then(() => {
          if (this.ingestSourcePath) {
            this.studioIngestPendingSource = {
              label: formatPathLabel(this.ingestSourcePath),
              path: this.ingestSourcePath,
            };
            const smartName2 = suggestProjectNameClient(this.ingestSourcePath);
            this.studioFormValues = { ...this.studioFormValues, "import-project-name": smartName2 };
            this.updateImportCardSource();
          }
        });
        break;
      case "dismiss-detected":
        this.studioTimeline = this.studioTimeline.filter(
          (e) => e.id !== "detected-source" && e.id !== "import-detected",
        );
        break;
      case "view-projects":
        if (this.settings.developerMode) {
          this.setTab("projects" as Tab);
        } else {
          // In normal mode, projects aren't a separate tab — just open finder
          // for each project
        }
        break;
      case "studio-open-report":
        void this.handleIngestOpenReport();
        break;
      case "studio-reveal-project":
        void this.handleIngestRevealProject();
        break;
      case "studio-start-editing":
        void this.handleStartEditing();
        break;
      case "studio-open-review-folder":
        void this.handleOpenReviewFolder();
        break;
      case "studio-show-unreadable":
      case "studio-show-junk":
        void this.handleIngestOpenReport();
        break;
      default:
        if (action.startsWith("import-set-verify:")) {
          const mode = action.slice("import-set-verify:".length) as "none" | "sentinel" | "full";
          this.updateImportCardVerifyMode(mode);
          break;
        }
        if (action === "import-toggle-dedupe") {
          this.updateImportCardDedupe();
          break;
        }
        if (action.startsWith("select-layout:")) {
          const templateId = action.slice("select-layout:".length);
          const preset = ALL_PRESETS.find((p) => p.template_id === templateId);
          if (preset) {
            this.folderTemplate = preset;
            this.scheduleSettingsSync();
            this.rebuildStudioTimeline();
          }
        } else if (action.startsWith("open-recent:")) {
          const root = action.slice("open-recent:".length);
          if (this.client) {
            void import("./controllers/ingest.ts").then(({ openPath: op }) => {
              void op(this.client!, root, root, true).catch(() => {});
            });
          }
        }
        break;
    }
  }

  /**
   * Inline ingest for Studio Manager (normal mode).
   * Auto-names the project and starts ingest with progress in the timeline.
   */
  async handleStudioIngestFromSource(source: import("./controllers/ingest.ts").SuggestedSource) {
    if (!this.client || !this.storageConfig) {
      return;
    }

    const sourcePath = source.path;
    const destPath = this.storageConfig.primaryDest;
    const projectName = suggestProjectNameClient(sourcePath);
    const { COPY } = await import("./copy/studio-manager-copy.ts");

    // Replace the action cards with a stage progress card
    this.studioTimeline = [
      {
        kind: "text" as const,
        id: "ingest-started",
        role: "cullmate" as const,
        body: `Saving photos from ${source.label || sourcePath.split("/").pop() || sourcePath}\u2026`,
      },
      {
        kind: "stage-progress" as const,
        id: "ingest-progress",
        role: "cullmate" as const,
        projectName,
        stages: [
          { id: "copy", label: COPY.stageCopying, status: "active" as const },
          { id: "verify", label: COPY.stageVerifying, status: "pending" as const },
          { id: "finalize", label: COPY.stageFinalizing, status: "pending" as const },
        ],
        currentStageProgress: 0,
        statusLine: COPY.statusScanning,
      },
    ];

    // Track progress in the timeline
    this.ingestStage = "running";
    this.ingestSourcePath = sourcePath;
    this.ingestDestPath = destPath;
    this.ingestProjectName = projectName;
    this.ingestProgress = null;
    this.ingestError = null;
    this.lastProgressUpdateAt = 0;

    try {
      const xmpPatch = this.studioProfile.enabled
        ? {
            creator: this.studioProfile.displayName || undefined,
            rights: this.studioProfile.copyrightLine || undefined,
            credit: this.studioProfile.studioName || undefined,
            webStatement: this.studioProfile.website || undefined,
          }
        : undefined;
      const { runIngestVerify, saveRecentProject } = await import("./controllers/ingest.ts");
      const result = await runIngestVerify(this.client, {
        source_path: sourcePath,
        dest_project_path: destPath,
        project_name: projectName,
        verify_mode: this.settings.defaultVerifyMode || "none",
        hash_algo: "blake3",
        overwrite: false,
        dedupe: false,
        backup_dest: this.storageConfig.backupDest || undefined,
        folder_template: this.folderTemplate ?? undefined,
        xmp_patch: xmpPatch,
      });

      this.ingestResult = result;
      this.ingestStage = "done";

      if (result.ok && result.project_root) {
        saveRecentProject({
          projectName,
          projectRoot: result.project_root,
          reportPath: result.report_path,
          destPath,
          sourcePath,
          timestamp: Date.now(),
        });
      }

      // Build badges
      const safeToFormat = result.safe_to_format ?? null;
      const burstCount = result.bursts?.burst_count ?? 0;
      const summaryBody = safeToFormat
        ? COPY.completionSafe(result.totals?.success_count ?? 0, burstCount)
        : COPY.completionUnsafe(
            result.totals?.success_count ?? 0,
            result.triage?.unreadable_count ?? 0,
          );

      const badges: Array<{
        label: string;
        variant: "safe" | "unsafe" | "neutral";
        action?: string;
      }> = [];
      if (safeToFormat !== null) {
        badges.push({
          label: safeToFormat ? "Safe to format: YES" : "Safe to format: NO",
          variant: safeToFormat ? "safe" : "unsafe",
        });
      }
      if (result.totals) {
        const copyCount = this.storageConfig?.backupDest ? 2 : 1;
        badges.push({ label: COPY.completionCopies(copyCount), variant: "neutral" });
      }
      if (result.report_path) {
        badges.push({
          label: COPY.completionReceipt,
          variant: "neutral",
          action: "studio-open-report",
        });
      }

      this.studioTimeline = [
        {
          kind: "text" as const,
          id: "ingest-done-summary",
          role: "cullmate" as const,
          body: summaryBody,
        },
        {
          kind: "result" as const,
          id: "ingest-result",
          role: "cullmate" as const,
          safeToFormat,
          headline: COPY.completionHeadline,
          verdict: safeToFormat ? COPY.safeToFormatYes : COPY.safeToFormatNotYet,
          detail: safeToFormat ? COPY.safeToFormatYesDetail : COPY.safeToFormatNoDetail,
          buttons: [
            { label: COPY.completionShowFinder, action: "studio-reveal-project" },
            { label: COPY.startEditing, action: "studio-start-editing" },
          ],
          badges,
          counters: result.totals
            ? [
                { label: "Copied", value: String(result.totals.success_count) },
                ...(result.totals.total_bytes
                  ? [{ label: "Size", value: formatBytesSimple(result.totals.total_bytes) }]
                  : []),
                ...(result.totals.fail_count > 0
                  ? [{ label: "Failed", value: String(result.totals.fail_count) }]
                  : []),
              ]
            : [],
          triageSummary: result.triage
            ? {
                unreadableCount: result.triage.unreadable_count,
                blackFrameCount: result.triage.black_frame_count,
              }
            : undefined,
          burstSummary: result.bursts
            ? {
                burstCount: result.bursts.burst_count,
                bestPickCount: result.bursts.best_pick_count,
              }
            : undefined,
          reviewFolder: result.review_folder,
        },
      ];
    } catch (err) {
      this.ingestError = err instanceof Error ? err.message : String(err);
      this.ingestStage = "error";

      this.studioTimeline = [
        {
          kind: "text" as const,
          id: "ingest-error",
          role: "cullmate" as const,
          body: `Something went wrong: ${this.ingestError}`,
        },
        {
          kind: "action" as const,
          id: "import-retry",
          role: "cullmate" as const,
          title: "Try again?",
          primaryButton: { label: COPY.savePhotosSafely, action: "import-detected" },
        },
      ];
    }
  }

  /**
   * Inline ingest with user-provided project name (from the naming form).
   */
  async handleStudioIngestWithName(
    source: import("./controllers/ingest.ts").SuggestedSource,
    projectName: string,
  ) {
    if (!this.client || !this.storageConfig) {
      return;
    }

    // Clear pending state
    this.studioIngestPendingSource = null;
    this.studioFormValues = {};

    const sourcePath = source.path;
    const destPath = this.storageConfig.primaryDest;
    const trimmedName = projectName.trim() || suggestProjectNameClient(sourcePath);
    const { COPY } = await import("./copy/studio-manager-copy.ts");

    // Read import card settings if present
    const importCard = this.studioTimeline.find((e) => e.kind === "import");
    const verifyMode =
      importCard?.verifyMode ??
      (this.settings.defaultVerifyMode as "none" | "sentinel" | "full") ??
      "sentinel";
    const dedupeEnabled = importCard?.dedupeEnabled ?? false;

    // Replace the action cards with a stage progress card
    this.studioTimeline = [
      {
        kind: "text" as const,
        id: "ingest-started",
        role: "cullmate" as const,
        body: `Saving photos from ${source.label || sourcePath.split("/").pop() || sourcePath}\u2026`,
      },
      {
        kind: "stage-progress" as const,
        id: "ingest-progress",
        role: "cullmate" as const,
        projectName: trimmedName,
        stages: [
          { id: "copy", label: COPY.stageCopying, status: "active" as const },
          { id: "verify", label: COPY.stageVerifying, status: "pending" as const },
          { id: "finalize", label: COPY.stageFinalizing, status: "pending" as const },
        ],
        currentStageProgress: 0,
        statusLine: COPY.statusScanning,
      },
    ];

    // Track progress in the timeline
    this.ingestStage = "running";
    this.ingestSourcePath = sourcePath;
    this.ingestDestPath = destPath;
    this.ingestProjectName = trimmedName;
    this.ingestProgress = null;
    this.ingestError = null;
    this.lastProgressUpdateAt = 0;

    try {
      const xmpPatch = this.studioProfile.enabled
        ? {
            creator: this.studioProfile.displayName || undefined,
            rights: this.studioProfile.copyrightLine || undefined,
            credit: this.studioProfile.studioName || undefined,
            webStatement: this.studioProfile.website || undefined,
          }
        : undefined;
      const { runIngestVerify, saveRecentProject } = await import("./controllers/ingest.ts");
      const result = await runIngestVerify(this.client, {
        source_path: sourcePath,
        dest_project_path: destPath,
        project_name: trimmedName,
        verify_mode: verifyMode,
        hash_algo: "blake3",
        overwrite: false,
        dedupe: dedupeEnabled,
        backup_dest: this.storageConfig.backupDest || undefined,
        folder_template: this.folderTemplate ?? undefined,
        xmp_patch: xmpPatch,
      });

      this.ingestResult = result;
      this.ingestStage = "done";

      if (result.ok && result.project_root) {
        saveRecentProject({
          projectName: trimmedName,
          projectRoot: result.project_root,
          reportPath: result.report_path,
          destPath,
          sourcePath,
          timestamp: Date.now(),
        });
      }

      // Build badges
      const safeToFormat = result.safe_to_format ?? null;
      const burstCount2 = result.bursts?.burst_count ?? 0;
      const summaryBody2 = safeToFormat
        ? COPY.completionSafe(result.totals?.success_count ?? 0, burstCount2)
        : COPY.completionUnsafe(
            result.totals?.success_count ?? 0,
            result.triage?.unreadable_count ?? 0,
          );

      const badges: Array<{
        label: string;
        variant: "safe" | "unsafe" | "neutral";
        action?: string;
      }> = [];
      if (safeToFormat !== null) {
        badges.push({
          label: safeToFormat ? "Safe to format: YES" : "Safe to format: NO",
          variant: safeToFormat ? "safe" : "unsafe",
        });
      }
      if (result.totals) {
        const copyCount = this.storageConfig?.backupDest ? 2 : 1;
        badges.push({ label: COPY.completionCopies(copyCount), variant: "neutral" });
      }
      if (result.report_path) {
        badges.push({
          label: COPY.completionReceipt,
          variant: "neutral",
          action: "studio-open-report",
        });
      }

      this.studioTimeline = [
        {
          kind: "text" as const,
          id: "ingest-done-summary",
          role: "cullmate" as const,
          body: summaryBody2,
        },
        {
          kind: "result" as const,
          id: "ingest-result",
          role: "cullmate" as const,
          safeToFormat,
          headline: COPY.completionHeadline,
          verdict: safeToFormat ? COPY.safeToFormatYes : COPY.safeToFormatNotYet,
          detail: safeToFormat ? COPY.safeToFormatYesDetail : COPY.safeToFormatNoDetail,
          buttons: [
            { label: COPY.completionShowFinder, action: "studio-reveal-project" },
            { label: COPY.startEditing, action: "studio-start-editing" },
          ],
          badges,
          counters: result.totals
            ? [
                { label: "Copied", value: String(result.totals.success_count) },
                ...(result.totals.total_bytes
                  ? [{ label: "Size", value: formatBytesSimple(result.totals.total_bytes) }]
                  : []),
                ...(result.totals.fail_count > 0
                  ? [{ label: "Failed", value: String(result.totals.fail_count) }]
                  : []),
              ]
            : [],
          triageSummary: result.triage
            ? {
                unreadableCount: result.triage.unreadable_count,
                blackFrameCount: result.triage.black_frame_count,
              }
            : undefined,
          burstSummary: result.bursts
            ? {
                burstCount: result.bursts.burst_count,
                bestPickCount: result.bursts.best_pick_count,
              }
            : undefined,
          reviewFolder: result.review_folder,
        },
      ];
    } catch (err) {
      this.ingestError = err instanceof Error ? err.message : String(err);
      this.ingestStage = "error";

      this.studioTimeline = [
        {
          kind: "text" as const,
          id: "ingest-error",
          role: "cullmate" as const,
          body: `Something went wrong: ${this.ingestError}`,
        },
        {
          kind: "action" as const,
          id: "import-retry",
          role: "cullmate" as const,
          title: "Try again?",
          primaryButton: { label: COPY.savePhotosSafely, action: "import-detected" },
        },
      ];
    }
  }

  /** Update import card's options expanded state in the timeline. */
  private updateImportCardOptions() {
    const idx = this.studioTimeline.findIndex((e) => e.kind === "import");
    if (idx < 0) {
      return;
    }
    const card = this.studioTimeline[idx] as import("./controllers/studio-manager.ts").ImportCard;
    const updated = [...this.studioTimeline];
    updated[idx] = { ...card, optionsExpanded: this.importOptionsExpanded };
    this.studioTimeline = updated;
  }

  /** Update import card's verify mode in the timeline. */
  private updateImportCardVerifyMode(mode: "none" | "sentinel" | "full") {
    const idx = this.studioTimeline.findIndex((e) => e.kind === "import");
    if (idx < 0) {
      return;
    }
    const card = this.studioTimeline[idx] as import("./controllers/studio-manager.ts").ImportCard;
    const updated = [...this.studioTimeline];
    updated[idx] = { ...card, verifyMode: mode };
    this.studioTimeline = updated;
  }

  /** Toggle import card's dedupe in the timeline. */
  private updateImportCardDedupe() {
    const idx = this.studioTimeline.findIndex((e) => e.kind === "import");
    if (idx < 0) {
      return;
    }
    const card = this.studioTimeline[idx] as import("./controllers/studio-manager.ts").ImportCard;
    const updated = [...this.studioTimeline];
    updated[idx] = { ...card, dedupeEnabled: !card.dedupeEnabled };
    this.studioTimeline = updated;
  }

  /** Update import card's source after folder pick. */
  private updateImportCardSource() {
    const idx = this.studioTimeline.findIndex((e) => e.kind === "import");
    if (idx < 0) {
      return;
    }
    const card = this.studioTimeline[idx] as import("./controllers/studio-manager.ts").ImportCard;
    const updated = [...this.studioTimeline];
    updated[idx] = {
      ...card,
      source: this.studioIngestPendingSource
        ? {
            label:
              this.studioIngestPendingSource.label ||
              formatPathLabel(this.studioIngestPendingSource.path),
            path: this.studioIngestPendingSource.path,
          }
        : null,
    };
    this.studioTimeline = updated;
  }

  rebuildStudioTimeline() {
    void import("./controllers/studio-manager.ts").then(({ buildStarterTimeline }) => {
      this.studioTimeline = buildStarterTimeline({
        suggestedSources: this.ingestSuggestedSources,
        recentProjects: this.ingestRecentProjects,
        hasStorageConfig: !!this.storageConfig,
        hasFolderTemplate: !!this.folderTemplate,
        hasCompletedProfileSetup: this.studioProfile.completedSetup,
        hasAiOnboardingDone: this.settings.aiOnboardingDone,
        presets: ALL_PRESETS,
      });
    });
  }

  render() {
    return renderApp(this as unknown as AppViewState);
  }
}
