import type { EventLogEntry } from "./app-events.ts";
import type { OpenClawApp } from "./app.ts";
import type { ExecApprovalRequest } from "./controllers/exec-approval.ts";
import type { GatewayEventFrame, GatewayHelloOk } from "./gateway.ts";
import type { Tab } from "./navigation.ts";
import type { UiSettings } from "./storage.ts";
import type { AgentsListResult, PresenceEntry, HealthSnapshot, StatusSummary } from "./types.ts";
import { CHAT_SESSIONS_ACTIVE_MINUTES, flushChatQueueForEvent } from "./app-chat.ts";
import {
  applySettings,
  loadCron,
  refreshActiveTab,
  setLastActiveSessionKey,
} from "./app-settings.ts";
import { handleAgentEvent, resetToolStream, type AgentEventPayload } from "./app-tool-stream.ts";
import { loadAgents } from "./controllers/agents.ts";
import { loadAssistantIdentity } from "./controllers/assistant-identity.ts";
import { loadChatHistory } from "./controllers/chat.ts";
import { handleChatEvent, type ChatEventPayload } from "./controllers/chat.ts";
import { loadDevices } from "./controllers/devices.ts";
import {
  addExecApproval,
  parseExecApprovalRequested,
  parseExecApprovalResolved,
  removeExecApproval,
} from "./controllers/exec-approval.ts";
import { loadNodes } from "./controllers/nodes.ts";
import { loadSessions } from "./controllers/sessions.ts";
import { GatewayBrowserClient } from "./gateway.ts";

type GatewayHost = {
  settings: UiSettings;
  password: string;
  client: GatewayBrowserClient | null;
  connected: boolean;
  hello: GatewayHelloOk | null;
  lastError: string | null;
  onboarding?: boolean;
  eventLogBuffer: EventLogEntry[];
  eventLog: EventLogEntry[];
  tab: Tab;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: StatusSummary | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  debugHealth: HealthSnapshot | null;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  sessionKey: string;
  chatRunId: string | null;
  refreshSessionsAfterChat: Set<string>;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalError: string | null;
};

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
  mainKey?: string;
  mainSessionKey?: string;
  scope?: string;
};

function normalizeSessionKeyForDefaults(
  value: string | undefined,
  defaults: SessionDefaultsSnapshot,
): string {
  const raw = (value ?? "").trim();
  const mainSessionKey = defaults.mainSessionKey?.trim();
  if (!mainSessionKey) {
    return raw;
  }
  if (!raw) {
    return mainSessionKey;
  }
  const mainKey = defaults.mainKey?.trim() || "main";
  const defaultAgentId = defaults.defaultAgentId?.trim();
  const isAlias =
    raw === "main" ||
    raw === mainKey ||
    (defaultAgentId &&
      (raw === `agent:${defaultAgentId}:main` || raw === `agent:${defaultAgentId}:${mainKey}`));
  return isAlias ? mainSessionKey : raw;
}

function applySessionDefaults(host: GatewayHost, defaults?: SessionDefaultsSnapshot) {
  if (!defaults?.mainSessionKey) {
    return;
  }
  const resolvedSessionKey = normalizeSessionKeyForDefaults(host.sessionKey, defaults);
  const resolvedSettingsSessionKey = normalizeSessionKeyForDefaults(
    host.settings.sessionKey,
    defaults,
  );
  const resolvedLastActiveSessionKey = normalizeSessionKeyForDefaults(
    host.settings.lastActiveSessionKey,
    defaults,
  );
  const nextSessionKey = resolvedSessionKey || resolvedSettingsSessionKey || host.sessionKey;
  const nextSettings = {
    ...host.settings,
    sessionKey: resolvedSettingsSessionKey || nextSessionKey,
    lastActiveSessionKey: resolvedLastActiveSessionKey || nextSessionKey,
  };
  const shouldUpdateSettings =
    nextSettings.sessionKey !== host.settings.sessionKey ||
    nextSettings.lastActiveSessionKey !== host.settings.lastActiveSessionKey;
  if (nextSessionKey !== host.sessionKey) {
    host.sessionKey = nextSessionKey;
  }
  if (shouldUpdateSettings) {
    applySettings(host as unknown as Parameters<typeof applySettings>[0], nextSettings);
  }
}

/** Seconds to wait before showing a connection error instead of the spinner. */
const CONNECT_TIMEOUT_MS = 5_000;

export function connectGateway(host: GatewayHost) {
  host.lastError = null;
  host.hello = null;
  host.connected = false;
  host.execApprovalQueue = [];
  host.execApprovalError = null;

  const metaToken =
    document.querySelector('meta[name="cullmate-auth-token"]')?.getAttribute("content") ??
    undefined;
  const windowAny = window as unknown as Record<string, unknown>;
  const bootstrapToken =
    typeof windowAny.__CULLMATE_AUTH_TOKEN__ === "string"
      ? windowAny.__CULLMATE_AUTH_TOKEN__
      : undefined;
  const effectiveToken = host.settings.token.trim() || metaToken || bootstrapToken || undefined;

  const previousClient = host.client;
  const connectTimer = window.setTimeout(() => {
    if (host.client === client && !host.connected) {
      host.lastError = `Unable to reach gateway at ${host.settings.gatewayUrl}. Check that the gateway is running.`;
    }
  }, CONNECT_TIMEOUT_MS);

  const client = new GatewayBrowserClient({
    url: host.settings.gatewayUrl,
    token: effectiveToken,
    password: host.password.trim() ? host.password : undefined,
    clientName: "openclaw-control-ui",
    mode: "webchat",
    onHello: (hello) => {
      if (host.client !== client) {
        return;
      }
      window.clearTimeout(connectTimer);
      host.connected = true;
      host.lastError = null;
      host.hello = hello;
      applySnapshot(host, hello);
      // Reset orphaned chat run state from before disconnect.
      // Any in-flight run's final event was lost during the disconnect window.
      host.chatRunId = null;
      (host as unknown as { chatStream: string | null }).chatStream = null;
      (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void loadAssistantIdentity(host as unknown as OpenClawApp);
      void loadAgents(host as unknown as OpenClawApp);
      void loadNodes(host as unknown as OpenClawApp, { quiet: true });
      void loadDevices(host as unknown as OpenClawApp, { quiet: true });
      void refreshActiveTab(host as unknown as Parameters<typeof refreshActiveTab>[0]);
      // Load server-persisted settings (storage config, profile, template, etc.)
      void loadServerSettings(host as unknown as OpenClawApp);
      // Open deferred modal (e.g. ?modal=ingest) after gateway is ready
      (host as unknown as { consumePendingModal: () => void }).consumePendingModal();
    },
    onClose: ({ code, reason }) => {
      if (host.client !== client) {
        return;
      }
      host.connected = false;
      // Code 1012 = Service Restart (expected during config saves, don't show as error)
      if (code !== 1012) {
        host.lastError = `disconnected (${code}): ${reason || "no reason"}`;
      }
    },
    onEvent: (evt) => {
      if (host.client !== client) {
        return;
      }
      handleGatewayEvent(host, evt);
    },
    onGap: ({ expected, received }) => {
      if (host.client !== client) {
        return;
      }
      host.lastError = `event gap detected (expected seq ${expected}, got ${received}); refresh recommended`;
    },
  });
  host.client = client;
  previousClient?.stop();
  client.start();
}

export function handleGatewayEvent(host: GatewayHost, evt: GatewayEventFrame) {
  try {
    handleGatewayEventUnsafe(host, evt);
  } catch (err) {
    console.error("[gateway] handleGatewayEvent error:", evt.event, err);
  }
}

function handleGatewayEventUnsafe(host: GatewayHost, evt: GatewayEventFrame) {
  host.eventLogBuffer = [
    { ts: Date.now(), event: evt.event, payload: evt.payload },
    ...host.eventLogBuffer,
  ].slice(0, 250);
  if (host.tab === "debug") {
    host.eventLog = host.eventLogBuffer;
  }

  if (evt.event === "agent") {
    if (host.onboarding) {
      return;
    }
    handleAgentEvent(
      host as unknown as Parameters<typeof handleAgentEvent>[0],
      evt.payload as AgentEventPayload | undefined,
    );
    return;
  }

  if (evt.event === "chat") {
    const payload = evt.payload as ChatEventPayload | undefined;
    // Handle tool_update events for ingest progress
    const chatPayloadAny = payload as unknown as Record<string, unknown> | undefined;
    if (chatPayloadAny?.type === "tool_update") {
      const toolPayload = chatPayloadAny as {
        type: string;
        tool?: string;
        runId?: string;
        update?: unknown;
      };
      if (toolPayload.tool === "photo.ingest_verify") {
        (
          host as unknown as { handleIngestToolUpdate: (p: typeof toolPayload) => void }
        ).handleIngestToolUpdate(toolPayload);
      }
    }
    if (payload?.sessionKey) {
      setLastActiveSessionKey(
        host as unknown as Parameters<typeof setLastActiveSessionKey>[0],
        payload.sessionKey,
      );
    }
    const state = handleChatEvent(host as unknown as OpenClawApp, payload);
    if (state === "final" || state === "error" || state === "aborted") {
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void flushChatQueueForEvent(host as unknown as Parameters<typeof flushChatQueueForEvent>[0]);
      const runId = payload?.runId;
      if (runId && host.refreshSessionsAfterChat.has(runId)) {
        host.refreshSessionsAfterChat.delete(runId);
        if (state === "final") {
          void loadSessions(host as unknown as OpenClawApp, {
            activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
          });
        }
      }
    }
    if (state === "final") {
      void loadChatHistory(host as unknown as OpenClawApp);
    }
    return;
  }

  if (evt.event === "presence") {
    const payload = evt.payload as { presence?: PresenceEntry[] } | undefined;
    if (payload?.presence && Array.isArray(payload.presence)) {
      host.presenceEntries = payload.presence;
      host.presenceError = null;
      host.presenceStatus = null;
    }
    return;
  }

  if (evt.event === "cron" && host.tab === "cron") {
    void loadCron(host as unknown as Parameters<typeof loadCron>[0]);
  }

  if (evt.event === "device.pair.requested" || evt.event === "device.pair.resolved") {
    void loadDevices(host as unknown as OpenClawApp, { quiet: true });
  }

  if (evt.event === "exec.approval.requested") {
    const entry = parseExecApprovalRequested(evt.payload);
    if (entry) {
      host.execApprovalQueue = addExecApproval(host.execApprovalQueue, entry);
      host.execApprovalError = null;
      const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
      window.setTimeout(() => {
        host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, entry.id);
      }, delay);
    }
    return;
  }

  if (evt.event === "exec.approval.resolved") {
    const resolved = parseExecApprovalResolved(evt.payload);
    if (resolved) {
      host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, resolved.id);
    }
  }
}

async function loadServerSettings(app: OpenClawApp) {
  if (!app.client) {
    return;
  }
  try {
    const { fetchServerSettings, pushServerSettings } =
      await import("./controllers/settings-sync.ts");
    const serverSettings = await fetchServerSettings(app.client);

    if (serverSettings) {
      // Apply server settings to app state
      const prefs = serverSettings.preferences;
      const nextSettings = {
        ...app.settings,
        theme: (prefs.theme as typeof app.settings.theme) ?? app.settings.theme,
        developerMode: prefs.developerMode ?? app.settings.developerMode,
        defaultSaveLocation: prefs.defaultSaveLocation ?? app.settings.defaultSaveLocation,
        defaultVerifyMode:
          (prefs.defaultVerifyMode as typeof app.settings.defaultVerifyMode) ??
          app.settings.defaultVerifyMode,
        chatFocusMode: prefs.chatFocusMode ?? app.settings.chatFocusMode,
        chatShowThinking: prefs.chatShowThinking ?? app.settings.chatShowThinking,
        splitRatio: prefs.splitRatio ?? app.settings.splitRatio,
        navCollapsed: prefs.navCollapsed ?? app.settings.navCollapsed,
        navGroupsCollapsed: prefs.navGroupsCollapsed ?? app.settings.navGroupsCollapsed,
      };
      app.applySettings(nextSettings);

      if (serverSettings.storageConfig) {
        app.storageConfig = serverSettings.storageConfig as Parameters<
          typeof app.handleSaveStorageSetup
        >[0];
      }
      if (serverSettings.studioProfile) {
        app.studioProfile = serverSettings.studioProfile as typeof app.studioProfile;
      }
      if (serverSettings.folderTemplate) {
        app.folderTemplate = serverSettings.folderTemplate as typeof app.folderTemplate;
      }
      if (serverSettings.recentProjects?.length) {
        app.ingestRecentProjects = serverSettings.recentProjects as typeof app.ingestRecentProjects;
      }
      app.serverSettingsLoaded = true;
    } else {
      // First boot — migrate from localStorage if data exists
      const { loadStorageConfig } = await import("./controllers/storage.ts");
      const { loadStudioProfile } = await import("./controllers/studio-profile.ts");
      const { loadFolderTemplate } = await import("./controllers/folder-template.ts");
      const { loadRecentProjects } = await import("./controllers/ingest.ts");

      const storageConfig = loadStorageConfig();
      const studioProfile = loadStudioProfile();
      const folderTemplate = loadFolderTemplate();
      const recentProjects = loadRecentProjects();

      const hasLocalData =
        storageConfig !== null ||
        studioProfile.completedSetup ||
        folderTemplate !== null ||
        recentProjects.length > 0;

      if (hasLocalData && app.client) {
        await pushServerSettings(app.client, {
          preferences: {
            theme: app.settings.theme,
            developerMode: app.settings.developerMode,
            defaultSaveLocation: app.settings.defaultSaveLocation,
            defaultVerifyMode: app.settings.defaultVerifyMode,
            chatFocusMode: app.settings.chatFocusMode,
            chatShowThinking: app.settings.chatShowThinking,
            splitRatio: app.settings.splitRatio,
            navCollapsed: app.settings.navCollapsed,
            navGroupsCollapsed: app.settings.navGroupsCollapsed,
          },
          storageConfig,
          studioProfile: studioProfile.completedSetup ? studioProfile : null,
          folderTemplate,
          recentProjects,
        });
        // Clear migrated localStorage keys (keep connection-critical ones)
        try {
          localStorage.removeItem("cullmate.storage.config");
          localStorage.removeItem("cullmate.studio-profile.v1");
          localStorage.removeItem("cullmate.folder.template");
          localStorage.removeItem("cullmate.ingest.recent");
        } catch {
          /* ignore */
        }
      }
      app.serverSettingsLoaded = true;
    }
  } catch (err) {
    console.error("[gateway] loadServerSettings error:", err);
    // Fall through — app still works with localStorage fallback
    app.serverSettingsLoaded = true;
  }
}

export function applySnapshot(host: GatewayHost, hello: GatewayHelloOk) {
  const snapshot = hello.snapshot as
    | {
        presence?: PresenceEntry[];
        health?: HealthSnapshot;
        sessionDefaults?: SessionDefaultsSnapshot;
      }
    | undefined;
  if (snapshot?.presence && Array.isArray(snapshot.presence)) {
    host.presenceEntries = snapshot.presence;
  }
  if (snapshot?.health) {
    host.debugHealth = snapshot.health;
  }
  if (snapshot?.sessionDefaults) {
    applySessionDefaults(host, snapshot.sessionDefaults);
  }
}
