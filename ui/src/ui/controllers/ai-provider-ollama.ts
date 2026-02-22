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

/** Model used for Smart Folders. Must match SMART_FOLDERS_MODEL on the server. */
const SMART_FOLDERS_MODEL = "llama3.2:3b";

/**
 * Ollama-backed provider for Smart Folders AI.
 * Detects whether Ollama is running and whether the required model is present.
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
          message: "To use smart folders, install the free Ollama app from ollama.ai",
          _dev: { provider: "Ollama", endpoint: "http://127.0.0.1:11434" },
        };
      }

      // Ollama is running — check if the required model is present
      const hasModel = result.models.some(
        (m) => m === SMART_FOLDERS_MODEL || m.startsWith(`${SMART_FOLDERS_MODEL}:`),
      );

      if (!hasModel) {
        return {
          status: "needs_model",
          message: `Ollama is running but the ${SMART_FOLDERS_MODEL} model needs to be downloaded.`,
          _dev: {
            provider: "Ollama",
            endpoint: "http://127.0.0.1:11434",
            models: result.models,
          },
        };
      }

      // Ensure the smart folders model is selected
      if (!this.selectedModel || !result.models.includes(this.selectedModel)) {
        const match = result.models.find(
          (m) => m === SMART_FOLDERS_MODEL || m.startsWith(`${SMART_FOLDERS_MODEL}:`),
        );
        if (match) {
          this.selectedModel = match;
        }
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
        message: "Couldn\u2019t reach the AI helper. Try again or choose a preset layout instead.",
        _dev: {
          provider: "Ollama",
          endpoint: "http://127.0.0.1:11434",
        },
      };
    }
  }

  async ensureModel(): Promise<{ ok: boolean; error?: string }> {
    if (!this.client) {
      return { ok: false, error: "Not connected to gateway." };
    }
    try {
      await this.client.request("ollama.ensure_model", {
        model_id: SMART_FOLDERS_MODEL,
      });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
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
          model_id: this.selectedModel || SMART_FOLDERS_MODEL,
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
