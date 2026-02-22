import type { GatewayBrowserClient } from "../gateway.ts";
import type { FolderTemplateAIProvider } from "./ai-provider.ts";
import { OllamaFolderTemplateProvider } from "./ai-provider-ollama.ts";

/**
 * Create the AI provider for Smart Folders.
 *
 * Always returns OllamaFolderTemplateProvider — the provider itself handles
 * status detection (not installed, needs model, ready, etc.).
 */
export function createAIProvider(opts: {
  developerMode: boolean;
  client: GatewayBrowserClient | null;
}): FolderTemplateAIProvider {
  return new OllamaFolderTemplateProvider(opts.client);
}
