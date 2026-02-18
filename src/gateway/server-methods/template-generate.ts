import type { GatewayRequestHandlers } from "./types.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const templateGenerateHandlers: GatewayRequestHandlers = {
  "photo.generate_template": async ({ params, respond }) => {
    const prompt = typeof params.prompt === "string" ? params.prompt.trim() : "";
    if (!prompt) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "prompt is required"));
      return;
    }

    const modelId = typeof params.model_id === "string" ? params.model_id.trim() : "";
    if (!modelId) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "model_id is required"));
      return;
    }

    const ollamaBaseUrl =
      typeof params.ollama_base_url === "string" ? params.ollama_base_url.trim() : undefined;

    try {
      const { generateTemplateFromPrompt } = await import("../../photo/template-from-prompt.js");
      const template = await generateTemplateFromPrompt(prompt, modelId, ollamaBaseUrl);
      respond(true, { template }, undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, message));
    }
  },
};
