import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "./common.js";
import { VERSION } from "../../version.js";
import { jsonResult } from "./common.js";

const PingToolSchema = Type.Object({});

export function createPingTool(): AnyAgentTool {
  return {
    label: "Ping",
    name: "demo_tool.ping",
    description: "Returns a simple health check with current time and app version.",
    parameters: PingToolSchema,
    execute: async () => {
      return jsonResult({
        ok: true,
        time: new Date().toISOString(),
        version: VERSION,
      });
    },
  };
}
