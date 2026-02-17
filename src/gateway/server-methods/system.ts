import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { GatewayRequestHandlers } from "./types.js";
import { resolveMainSessionKeyFromConfig } from "../../config/sessions.js";
import { getLastHeartbeatEvent } from "../../infra/heartbeat-events.js";
import { setHeartbeatsEnabled } from "../../infra/heartbeat-runner.js";
import { enqueueSystemEvent, isSystemEventContextChanged } from "../../infra/system-events.js";
import { listSystemPresence, updateSystemPresence } from "../../infra/system-presence.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";

export const systemHandlers: GatewayRequestHandlers = {
  "last-heartbeat": ({ respond }) => {
    respond(true, getLastHeartbeatEvent(), undefined);
  },
  "set-heartbeats": ({ params, respond }) => {
    const enabled = params.enabled;
    if (typeof enabled !== "boolean") {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          "invalid set-heartbeats params: enabled (boolean) required",
        ),
      );
      return;
    }
    setHeartbeatsEnabled(enabled);
    respond(true, { ok: true, enabled }, undefined);
  },
  "system-presence": ({ respond }) => {
    const presence = listSystemPresence();
    respond(true, presence, undefined);
  },
  "system-event": ({ params, respond, context }) => {
    const text = typeof params.text === "string" ? params.text.trim() : "";
    if (!text) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "text required"));
      return;
    }
    const sessionKey = resolveMainSessionKeyFromConfig();
    const deviceId = typeof params.deviceId === "string" ? params.deviceId : undefined;
    const instanceId = typeof params.instanceId === "string" ? params.instanceId : undefined;
    const host = typeof params.host === "string" ? params.host : undefined;
    const ip = typeof params.ip === "string" ? params.ip : undefined;
    const mode = typeof params.mode === "string" ? params.mode : undefined;
    const version = typeof params.version === "string" ? params.version : undefined;
    const platform = typeof params.platform === "string" ? params.platform : undefined;
    const deviceFamily = typeof params.deviceFamily === "string" ? params.deviceFamily : undefined;
    const modelIdentifier =
      typeof params.modelIdentifier === "string" ? params.modelIdentifier : undefined;
    const lastInputSeconds =
      typeof params.lastInputSeconds === "number" && Number.isFinite(params.lastInputSeconds)
        ? params.lastInputSeconds
        : undefined;
    const reason = typeof params.reason === "string" ? params.reason : undefined;
    const roles =
      Array.isArray(params.roles) && params.roles.every((t) => typeof t === "string")
        ? params.roles
        : undefined;
    const scopes =
      Array.isArray(params.scopes) && params.scopes.every((t) => typeof t === "string")
        ? params.scopes
        : undefined;
    const tags =
      Array.isArray(params.tags) && params.tags.every((t) => typeof t === "string")
        ? params.tags
        : undefined;
    const presenceUpdate = updateSystemPresence({
      text,
      deviceId,
      instanceId,
      host,
      ip,
      mode,
      version,
      platform,
      deviceFamily,
      modelIdentifier,
      lastInputSeconds,
      reason,
      roles,
      scopes,
      tags,
    });
    const isNodePresenceLine = text.startsWith("Node:");
    if (isNodePresenceLine) {
      const next = presenceUpdate.next;
      const changed = new Set(presenceUpdate.changedKeys);
      const reasonValue = next.reason ?? reason;
      const normalizedReason = (reasonValue ?? "").toLowerCase();
      const ignoreReason =
        normalizedReason.startsWith("periodic") || normalizedReason === "heartbeat";
      const hostChanged = changed.has("host");
      const ipChanged = changed.has("ip");
      const versionChanged = changed.has("version");
      const modeChanged = changed.has("mode");
      const reasonChanged = changed.has("reason") && !ignoreReason;
      const hasChanges = hostChanged || ipChanged || versionChanged || modeChanged || reasonChanged;
      if (hasChanges) {
        const contextChanged = isSystemEventContextChanged(sessionKey, presenceUpdate.key);
        const parts: string[] = [];
        if (contextChanged || hostChanged || ipChanged) {
          const hostLabel = next.host?.trim() || "Unknown";
          const ipLabel = next.ip?.trim();
          parts.push(`Node: ${hostLabel}${ipLabel ? ` (${ipLabel})` : ""}`);
        }
        if (versionChanged) {
          parts.push(`app ${next.version?.trim() || "unknown"}`);
        }
        if (modeChanged) {
          parts.push(`mode ${next.mode?.trim() || "unknown"}`);
        }
        if (reasonChanged) {
          parts.push(`reason ${reasonValue?.trim() || "event"}`);
        }
        const deltaText = parts.join(" · ");
        if (deltaText) {
          enqueueSystemEvent(deltaText, {
            sessionKey,
            contextKey: presenceUpdate.key,
          });
        }
      }
    } else {
      enqueueSystemEvent(text, { sessionKey });
    }
    const nextPresenceVersion = context.incrementPresenceVersion();
    context.broadcast(
      "presence",
      { presence: listSystemPresence() },
      {
        dropIfSlow: true,
        stateVersion: {
          presence: nextPresenceVersion,
          health: context.getHealthVersion(),
        },
      },
    );
    respond(true, { ok: true }, undefined);
  },
  "system.open_path": ({ params, respond }) => {
    const filePath = typeof params.path === "string" ? params.path.trim() : "";
    if (!filePath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "system.open_path requires params.path"),
      );
      return;
    }
    // Only allow on macOS
    if (process.platform !== "darwin") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "open_path only supported on macOS"),
      );
      return;
    }
    // Validate path is within allowed_root to prevent traversal
    const allowedRoot = typeof params.allowed_root === "string" ? params.allowed_root.trim() : "";
    if (!allowedRoot) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "system.open_path requires params.allowed_root"),
      );
      return;
    }
    const resolvedPath = path.resolve(filePath);
    const resolvedRoot = path.resolve(allowedRoot);
    if (!resolvedPath.startsWith(resolvedRoot + path.sep) && resolvedPath !== resolvedRoot) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, "path is outside allowed root"),
      );
      return;
    }
    const reveal = typeof params.reveal === "boolean" ? params.reveal : false;
    const args = reveal ? ["-R", resolvedPath] : [resolvedPath];
    execFile("/usr/bin/open", args, (err) => {
      if (err) {
        respond(
          false,
          undefined,
          errorShape(ErrorCodes.UNAVAILABLE, `open failed: ${err.message}`),
        );
      } else {
        respond(true, { ok: true }, undefined);
      }
    });
  },
  "system.pick_folder": ({ params, respond }) => {
    if (process.platform !== "darwin") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "pick_folder only supported on macOS"),
      );
      return;
    }
    const prompt = typeof params.prompt === "string" ? params.prompt.trim() : "Choose a folder";
    const defaultLocation =
      typeof params.default_location === "string" ? params.default_location.trim() : "";
    // Use osascript to show a native folder picker dialog
    const scriptParts = ["choose folder with prompt " + JSON.stringify(prompt)];
    if (defaultLocation) {
      scriptParts.push("default location POSIX file " + JSON.stringify(defaultLocation));
    }
    const script = scriptParts.join(" ");
    execFile("/usr/bin/osascript", ["-e", script], (err, stdout) => {
      if (err) {
        // osascript returns exit code 1 when user cancels the dialog
        const msg = err.message ?? "";
        if (msg.includes("User canceled") || msg.includes("(-128)")) {
          respond(true, { ok: false, cancelled: true }, undefined);
          return;
        }
        respond(false, undefined, errorShape(ErrorCodes.UNAVAILABLE, `pick_folder failed: ${msg}`));
        return;
      }
      // osascript returns an HFS path like "Macintosh HD:Volumes:SD_CARD:DCIM:"
      // Convert to POSIX using osascript
      const hfsPath = stdout.trim();
      if (!hfsPath) {
        respond(true, { ok: false, cancelled: true }, undefined);
        return;
      }
      const posixScript = `POSIX path of (${JSON.stringify(hfsPath)} as alias)`;
      execFile("/usr/bin/osascript", ["-e", posixScript], (posixErr, posixStdout) => {
        if (posixErr) {
          respond(
            false,
            undefined,
            errorShape(ErrorCodes.UNAVAILABLE, `path conversion failed: ${posixErr.message}`),
          );
          return;
        }
        const posixPath = posixStdout.trim();
        // Remove trailing slash for consistency (unless it's the root "/")
        const normalized =
          posixPath.length > 1 && posixPath.endsWith("/") ? posixPath.slice(0, -1) : posixPath;
        respond(true, { ok: true, path: normalized }, undefined);
      });
    });
  },
  "system.list_volumes": ({ respond }) => {
    if (process.platform !== "darwin") {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.UNAVAILABLE, "list_volumes only supported on macOS"),
      );
      return;
    }
    const volumesDir = "/Volumes";
    let entries: string[];
    try {
      entries = fs.readdirSync(volumesDir);
    } catch {
      respond(true, { volumes: [], suggestedSources: [] }, undefined);
      return;
    }
    const volumes: Array<{ name: string; path: string }> = [];
    const suggestedSources: Array<{ label: string; path: string }> = [];
    for (const name of entries) {
      const volPath = path.join(volumesDir, name);
      try {
        const stat = fs.statSync(volPath);
        if (!stat.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }
      volumes.push({ name, path: volPath });
      // Detect camera card patterns
      const dcimPath = path.join(volPath, "DCIM");
      try {
        if (fs.statSync(dcimPath).isDirectory()) {
          suggestedSources.push({ label: `${name} (DCIM)`, path: dcimPath });
        }
      } catch {
        // No DCIM — check for PRIVATE/MISC pattern (Sony, Panasonic, etc.)
        try {
          const hasPrivate = fs.statSync(path.join(volPath, "PRIVATE")).isDirectory();
          if (hasPrivate) {
            suggestedSources.push({ label: name, path: volPath });
          }
        } catch {
          // Not a camera card
        }
      }
    }
    respond(true, { volumes, suggestedSources }, undefined);
  },
};
