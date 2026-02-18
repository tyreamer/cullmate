import type { GatewayBrowserClient } from "../gateway.ts";
import type { FolderTemplateAIProvider } from "./ai-provider.ts";
import { OllamaFolderTemplateProvider } from "./ai-provider-ollama.ts";
import { NullFolderTemplateProvider } from "./ai-provider.ts";

/**
 * Create the appropriate AI provider based on mode.
 *
 * In developer mode (or VITE_DEV_AI=1): Ollama provider
 * Otherwise: Null provider (always not_installed)
 */
export function createAIProvider(opts: {
  developerMode: boolean;
  client: GatewayBrowserClient | null;
}): FolderTemplateAIProvider {
  if (opts.developerMode) {
    return new OllamaFolderTemplateProvider(opts.client);
  }

  return new NullFolderTemplateProvider();
}
