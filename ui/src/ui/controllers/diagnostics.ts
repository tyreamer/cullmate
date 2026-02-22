import type { GatewayBrowserClient } from "../gateway.ts";

export function buildSafeSettingsSnapshot(
  settings: Record<string, unknown>,
  storageConfig: Record<string, unknown>,
): Record<string, unknown> {
  return {
    theme: settings.theme,
    developerMode: settings.developerMode,
    defaultVerifyMode: settings.defaultVerifyMode,
    hasStorage: !!storageConfig.primaryDest,
    hasBackup: !!storageConfig.backupDest,
  };
}

export async function exportDiagnostics(
  client: GatewayBrowserClient,
  opts: { settingsSnapshot: Record<string, unknown> },
): Promise<void> {
  const result = await client.request<{ diagnostics: string }>("health", {});
  const blob = new Blob([JSON.stringify({ ...result, settings: opts.settingsSnapshot }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `baxbot-diagnostics-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
