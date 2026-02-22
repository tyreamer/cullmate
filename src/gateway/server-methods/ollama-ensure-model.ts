import type { GatewayRequestHandlers } from "./types.js";
import { DEFAULT_OLLAMA_BASE_URL, SMART_FOLDERS_MODEL } from "../../photo/template-from-prompt.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

/** Throttle broadcast to max 5 per second. */
const BROADCAST_INTERVAL_MS = 200;

export const ollamaEnsureModelHandlers: GatewayRequestHandlers = {
  "ollama.ensure_model": async ({ params, respond, context }) => {
    const modelId =
      typeof params.model_id === "string" && params.model_id.trim()
        ? params.model_id.trim()
        : SMART_FOLDERS_MODEL;
    const baseUrl =
      typeof params.ollama_base_url === "string" && params.ollama_base_url.trim()
        ? params.ollama_base_url.trim()
        : DEFAULT_OLLAMA_BASE_URL;

    // 1. Check if model already exists
    try {
      const showRes = await fetch(`${baseUrl}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelId }),
      });
      if (showRes.ok) {
        respond(true, { status: "ready", model_id: modelId }, undefined);
        return;
      }
    } catch {
      // Ollama not reachable
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          "Cannot reach Ollama. Make sure the Ollama app is running.",
        ),
      );
      return;
    }

    // 2. Model not found — pull it with streaming progress
    try {
      const pullRes = await fetch(`${baseUrl}/api/pull`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: modelId, stream: true }),
      });

      if (!pullRes.ok) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `Ollama pull failed: HTTP ${pullRes.status}`),
        );
        return;
      }

      const reader = pullRes.body?.getReader();
      if (!reader) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, "No response body from Ollama pull"),
        );
        return;
      }

      const decoder = new TextDecoder();
      let lastBroadcastAt = 0;
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep incomplete last line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) {
            continue;
          }
          let parsed: {
            status?: string;
            completed?: number;
            total?: number;
            error?: string;
          };
          try {
            parsed = JSON.parse(trimmed);
          } catch {
            continue;
          }

          if (parsed.error) {
            respond(
              false,
              undefined,
              errorShape(ErrorCodes.UNAVAILABLE, `Ollama pull error: ${parsed.error}`),
            );
            return;
          }

          // Throttle progress broadcasts
          const now = Date.now();
          if (now - lastBroadcastAt >= BROADCAST_INTERVAL_MS) {
            lastBroadcastAt = now;
            const completedMb =
              parsed.completed != null ? Math.round(parsed.completed / (1024 * 1024)) : 0;
            const totalMb = parsed.total != null ? Math.round(parsed.total / (1024 * 1024)) : 0;
            const percent =
              parsed.total && parsed.total > 0
                ? Math.round(((parsed.completed ?? 0) / parsed.total) * 100)
                : 0;

            context.broadcast("chat", {
              type: "model_download",
              model_id: modelId,
              status: parsed.status ?? "downloading",
              percent,
              completedMb,
              totalMb,
            });
          }
        }
      }

      // Final broadcast — 100%
      context.broadcast("chat", {
        type: "model_download",
        model_id: modelId,
        status: "ready",
        percent: 100,
        completedMb: 0,
        totalMb: 0,
      });

      respond(true, { status: "ready", model_id: modelId }, undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, message));
    }
  },
};
