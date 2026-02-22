import type { GatewayBrowserClient } from "../gateway.ts";

export type ServerSettings = {
  preferences: Record<string, unknown>;
  storageConfig: unknown;
  studioProfile: unknown;
  folderTemplate: unknown;
  recentProjects: unknown[];
};

export async function fetchServerSettings(
  client: GatewayBrowserClient,
): Promise<ServerSettings | null> {
  try {
    const result = await client.request<{ settings?: ServerSettings }>("config.get", {
      key: "ui_settings",
    });
    return (result as { settings?: ServerSettings }).settings ?? null;
  } catch {
    return null;
  }
}

export async function pushServerSettings(
  client: GatewayBrowserClient,
  settings: {
    preferences: Record<string, unknown>;
    storageConfig: unknown;
    studioProfile: unknown;
    folderTemplate: unknown;
    recentProjects: unknown[];
  },
): Promise<void> {
  try {
    await client.request("config.set", {
      key: "ui_settings",
      value: { settings },
    });
  } catch {
    // Silently ignore — settings sync is best-effort
  }
}
