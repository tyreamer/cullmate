import type { FolderTemplate } from "../../../../src/photo/folder-template.js";
import type { GatewayBrowserClient } from "../gateway.ts";
import type {
  FolderTemplateAIProvider,
  GenerateTemplateRequest,
  GenerateTemplateResult,
  SmartOrganizerStatusResult,
} from "./ai-provider.ts";
import { validateAITemplateResponse } from "./folder-templates/schema.ts";
import { checkOllamaAvailability } from "./ollama-check.ts";

/**
 * Ollama-backed provider — DEV ONLY.
 * Uses the existing local Ollama check + gateway RPC.
 */
export class OllamaFolderTemplateProvider implements FolderTemplateAIProvider {
  private client: GatewayBrowserClient | null;
  private cachedModels: string[] = [];
  private selectedModel = "";

  constructor(client: GatewayBrowserClient | null) {
    this.client = client;
  }

  setClient(client: GatewayBrowserClient | null) {
    this.client = client;
  }

  getSelectedModel(): string {
    return this.selectedModel;
  }

  setSelectedModel(model: string) {
    this.selectedModel = model;
  }

  getModels(): string[] {
    return this.cachedModels;
  }

  async status(): Promise<SmartOrganizerStatusResult> {
    try {
      const result = await checkOllamaAvailability();
      this.cachedModels = result.models;
      if (this.cachedModels.length > 0 && !this.selectedModel) {
        this.selectedModel = this.cachedModels[0];
      }

      if (!result.available) {
        return {
          status: "not_installed",
          message: "Smart Organizer is not running.",
          _dev: { provider: "Ollama", endpoint: "http://127.0.0.1:11434" },
        };
      }

      return {
        status: "ready",
        _dev: {
          provider: "Ollama",
          endpoint: "http://127.0.0.1:11434",
          models: result.models,
        },
      };
    } catch {
      return {
        status: "error",
        message: "Could not check Smart Organizer availability.",
        _dev: {
          provider: "Ollama",
          endpoint: "http://127.0.0.1:11434",
        },
      };
    }
  }

  async generateTemplate(args: GenerateTemplateRequest): Promise<GenerateTemplateResult> {
    if (!this.client) {
      return { ok: false, error: "Not connected." };
    }

    try {
      const response = await this.client.request<{ template: FolderTemplate }>(
        "photo.generate_template",
        {
          prompt: args.prompt,
          model_id: this.selectedModel || undefined,
        },
      );

      const validation = validateAITemplateResponse(response.template);
      if (!validation.ok) {
        return { ok: false, error: validation.error, raw: response.template };
      }

      return { ok: true, template: response.template, raw: response };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: "Could not create layout. Please try again.", raw: message };
    }
  }
}
