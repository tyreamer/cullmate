import type { GatewayRequestHandlers } from "./types.js";
import { createOpenClawTools } from "../../agents/openclaw-tools.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const toolsInvokeHandlers: GatewayRequestHandlers = {
  "tools.invoke": async ({ params, respond, context }) => {
    const name = typeof params.name === "string" ? params.name.trim() : "";
    if (!name) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "tools.invoke requires params.name"),
      );
      return;
    }

    const args =
      params.args && typeof params.args === "object" && !Array.isArray(params.args)
        ? (params.args as Record<string, unknown>)
        : {};

    const cfg = loadConfig();
    const allTools = createOpenClawTools({ config: cfg });
    const tool = allTools.find((t) => t.name === name);

    if (!tool) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, `Tool not found: ${name}`));
      return;
    }

    context.broadcast("chat", {
      type: "tool_status",
      tool: name,
      status: "running",
    });

    try {
      // oxlint-disable-next-line typescript/no-explicit-any
      const result = await (tool as any).execute?.(`rpc-${Date.now()}`, args);

      context.broadcast("chat", {
        type: "tool_status",
        tool: name,
        status: "done",
      });

      respond(true, { tool: name, result }, undefined);
    } catch (err) {
      context.broadcast("chat", {
        type: "tool_status",
        tool: name,
        status: "error",
      });

      const message = err instanceof Error ? err.message : String(err);
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, `Tool execution failed: ${message}`),
      );
    }
  },
};
