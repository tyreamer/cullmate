import type { FolderTemplate } from "../../../../src/photo/folder-template.js";

export type SmartOrganizerStatus =
  | "ready"
  | "not_installed"
  | "needs_model"
  | "downloading"
  | "unavailable"
  | "error";

export type SmartOrganizerStatusResult = {
  status: SmartOrganizerStatus;
  message?: string;
  /** Provider-internal details, only shown in developer mode. */
  _dev?: { provider: string; endpoint?: string; models?: string[] };
};

export type GenerateTemplateRequest = {
  prompt: string;
  presets: Array<{
    id: string;
    title: string;
    description: string;
    exampleTree: string;
  }>;
  schema: unknown;
};

export type GenerateTemplateResult =
  | { ok: true; template: FolderTemplate; raw?: unknown }
  | { ok: false; error: string; raw?: unknown };

export interface FolderTemplateAIProvider {
  status(): Promise<SmartOrganizerStatusResult>;
  generateTemplate(args: GenerateTemplateRequest): Promise<GenerateTemplateResult>;
  /** Trigger model download via the gateway. Returns when download starts (progress comes via broadcast). */
  ensureModel?(): Promise<{ ok: boolean; error?: string }>;
}

/**
 * Null provider — always returns not_installed.
 * Used when no provider is available.
 */
export class NullFolderTemplateProvider implements FolderTemplateAIProvider {
  async status(): Promise<SmartOrganizerStatusResult> {
    return { status: "not_installed" };
  }

  async generateTemplate(): Promise<GenerateTemplateResult> {
    return {
      ok: false,
      error: "Smart folders isn\u2019t available yet. Choose a preset layout instead.",
    };
  }
}
