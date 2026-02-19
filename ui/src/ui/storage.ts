const KEY = "openclaw.control.settings.v1";

import type { ThemeMode } from "./theme.ts";

export type UiSettings = {
  gatewayUrl: string;
  token: string;
  sessionKey: string;
  lastActiveSessionKey: string;
  theme: ThemeMode;
  chatFocusMode: boolean;
  chatShowThinking: boolean;
  splitRatio: number; // Sidebar split ratio (0.4 to 0.7, default 0.6)
  navCollapsed: boolean; // Collapsible sidebar state
  navGroupsCollapsed: Record<string, boolean>; // Which nav groups are collapsed
  developerMode: boolean;
  defaultSaveLocation: string;
  defaultVerifyMode: "none" | "sentinel";
  copyrightEnabled: boolean;
  copyrightName: string;
  copyrightStudio: string;
  copyrightWebsite: string;
  aiFeaturesEnabled: boolean;
  aiOnboardingDone: boolean;
};

export function loadSettings(): UiSettings {
  const defaultUrl = (() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${location.host}`;
  })();

  const defaults: UiSettings = {
    gatewayUrl: defaultUrl,
    token: "",
    sessionKey: "main",
    lastActiveSessionKey: "main",
    theme: "system",
    chatFocusMode: false,
    chatShowThinking: true,
    splitRatio: 0.6,
    navCollapsed: false,
    navGroupsCollapsed: {},
    developerMode: false,
    defaultSaveLocation: "~/Pictures/BaxBot",
    defaultVerifyMode: "none",
    copyrightEnabled: false,
    copyrightName: "",
    copyrightStudio: "",
    copyrightWebsite: "",
    aiFeaturesEnabled: false,
    aiOnboardingDone: false,
  };

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      return defaults;
    }
    const parsed = JSON.parse(raw) as Partial<UiSettings>;
    return {
      gatewayUrl:
        typeof parsed.gatewayUrl === "string" && parsed.gatewayUrl.trim()
          ? parsed.gatewayUrl.trim()
          : defaults.gatewayUrl,
      token: typeof parsed.token === "string" ? parsed.token : defaults.token,
      sessionKey:
        typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()
          ? parsed.sessionKey.trim()
          : defaults.sessionKey,
      lastActiveSessionKey:
        typeof parsed.lastActiveSessionKey === "string" && parsed.lastActiveSessionKey.trim()
          ? parsed.lastActiveSessionKey.trim()
          : (typeof parsed.sessionKey === "string" && parsed.sessionKey.trim()) ||
            defaults.lastActiveSessionKey,
      theme:
        parsed.theme === "light" || parsed.theme === "dark" || parsed.theme === "system"
          ? parsed.theme
          : defaults.theme,
      chatFocusMode:
        typeof parsed.chatFocusMode === "boolean" ? parsed.chatFocusMode : defaults.chatFocusMode,
      chatShowThinking:
        typeof parsed.chatShowThinking === "boolean"
          ? parsed.chatShowThinking
          : defaults.chatShowThinking,
      splitRatio:
        typeof parsed.splitRatio === "number" &&
        parsed.splitRatio >= 0.4 &&
        parsed.splitRatio <= 0.7
          ? parsed.splitRatio
          : defaults.splitRatio,
      navCollapsed:
        typeof parsed.navCollapsed === "boolean" ? parsed.navCollapsed : defaults.navCollapsed,
      navGroupsCollapsed:
        typeof parsed.navGroupsCollapsed === "object" && parsed.navGroupsCollapsed !== null
          ? parsed.navGroupsCollapsed
          : defaults.navGroupsCollapsed,
      developerMode:
        typeof parsed.developerMode === "boolean" ? parsed.developerMode : defaults.developerMode,
      defaultSaveLocation:
        typeof parsed.defaultSaveLocation === "string" && parsed.defaultSaveLocation.trim()
          ? parsed.defaultSaveLocation.trim()
          : defaults.defaultSaveLocation,
      defaultVerifyMode:
        parsed.defaultVerifyMode === "none" || parsed.defaultVerifyMode === "sentinel"
          ? parsed.defaultVerifyMode
          : defaults.defaultVerifyMode,
      copyrightEnabled:
        typeof parsed.copyrightEnabled === "boolean"
          ? parsed.copyrightEnabled
          : defaults.copyrightEnabled,
      copyrightName:
        typeof parsed.copyrightName === "string" ? parsed.copyrightName : defaults.copyrightName,
      copyrightStudio:
        typeof parsed.copyrightStudio === "string"
          ? parsed.copyrightStudio
          : defaults.copyrightStudio,
      copyrightWebsite:
        typeof parsed.copyrightWebsite === "string"
          ? parsed.copyrightWebsite
          : defaults.copyrightWebsite,
      aiFeaturesEnabled:
        typeof parsed.aiFeaturesEnabled === "boolean"
          ? parsed.aiFeaturesEnabled
          : defaults.aiFeaturesEnabled,
      aiOnboardingDone:
        typeof parsed.aiOnboardingDone === "boolean"
          ? parsed.aiOnboardingDone
          : defaults.aiOnboardingDone,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(next: UiSettings) {
  localStorage.setItem(KEY, JSON.stringify(next));
}
