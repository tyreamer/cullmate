import type { FolderTemplate, RoutingRule } from "./folder-template.js";

/**
 * JSON schema for FolderTemplate, used to constrain AI output.
 * Sent to the model as part of the prompt so it generates valid JSON.
 */
export const FOLDER_TEMPLATE_JSON_SCHEMA = {
  type: "object",
  required: ["name", "description", "routing_rules", "scaffold_dirs"],
  properties: {
    name: { type: "string", description: "Short name for this layout" },
    description: { type: "string", description: "One-sentence description" },
    routing_rules: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["label", "dest_pattern"],
        properties: {
          label: { type: "string", description: "Human-readable name for this rule" },
          match: {
            type: "object",
            description: "Optional filter. Omit for catch-all.",
            properties: {
              media_type: { type: "string", enum: ["RAW", "PHOTO", "VIDEO"] },
              extensions: { type: "array", items: { type: "string" } },
            },
          },
          dest_pattern: {
            type: "string",
            description:
              "Destination folder pattern. Allowed tokens: {YYYY}, {MM}, {DD}, {CAMERA_LABEL}, {CAMERA_MODEL}, {MEDIA_TYPE}, {EXT}",
          },
        },
      },
    },
    scaffold_dirs: {
      type: "array",
      items: { type: "string" },
      description: "Extra folders always created (no tokens allowed)",
    },
    token_defaults: {
      type: "object",
      additionalProperties: { type: "string" },
      description: "Default values for tokens if not available from EXIF",
    },
  },
} as const;

/**
 * Validate an AI-generated template response.
 * Returns a user-friendly error if invalid (no jargon).
 */
export function validateAITemplateResponse(
  value: unknown,
): { ok: true; template: FolderTemplate } | { ok: false; error: string } {
  if (!value || typeof value !== "object") {
    return { ok: false, error: "The layout could not be understood. Please try again." };
  }

  const obj = value as Record<string, unknown>;

  // Required string fields
  if (typeof obj.name !== "string" || !obj.name.trim()) {
    return { ok: false, error: "The generated layout is missing a name. Please try again." };
  }
  if (typeof obj.description !== "string") {
    return {
      ok: false,
      error: "The generated layout is missing a description. Please try again.",
    };
  }

  // Routing rules
  if (!Array.isArray(obj.routing_rules) || obj.routing_rules.length === 0) {
    return { ok: false, error: "The layout needs at least one folder rule. Please try again." };
  }

  for (let i = 0; i < obj.routing_rules.length; i++) {
    const rule = obj.routing_rules[i] as Record<string, unknown>;
    if (!rule || typeof rule !== "object") {
      return { ok: false, error: "One of the folder rules is not valid. Please try again." };
    }
    if (typeof rule.label !== "string" || !rule.label.trim()) {
      return { ok: false, error: `Folder rule ${i + 1} is missing a name. Please try again.` };
    }
    if (typeof rule.dest_pattern !== "string" || !rule.dest_pattern.trim()) {
      return {
        ok: false,
        error: `Folder rule "${rule.label}" is missing a destination. Please try again.`,
      };
    }

    // Validate match field if present
    if (rule.match !== undefined && rule.match !== null) {
      if (typeof rule.match !== "object") {
        return {
          ok: false,
          error: `Folder rule "${rule.label}" has an invalid filter. Please try again.`,
        };
      }
      const match = rule.match as Record<string, unknown>;
      if ("media_type" in match) {
        const valid = ["RAW", "PHOTO", "VIDEO"];
        if (typeof match.media_type !== "string" || !valid.includes(match.media_type)) {
          return {
            ok: false,
            error: `Folder rule "${rule.label}" has an unrecognized file type. Please try again.`,
          };
        }
      }
      if ("extensions" in match) {
        if (
          !Array.isArray(match.extensions) ||
          match.extensions.some((e) => typeof e !== "string")
        ) {
          return {
            ok: false,
            error: `Folder rule "${rule.label}" has invalid file extensions. Please try again.`,
          };
        }
      }
    }

    // Check for path traversal
    const pattern = rule.dest_pattern;
    if (pattern.includes("..") || pattern.startsWith("/")) {
      return { ok: false, error: "The layout contains unsafe folder paths. Please try again." };
    }
  }

  // Scaffold dirs
  if (!Array.isArray(obj.scaffold_dirs)) {
    obj.scaffold_dirs = [];
  }
  for (const dir of obj.scaffold_dirs as unknown[]) {
    if (typeof dir !== "string") {
      return { ok: false, error: "One of the extra folders is not valid. Please try again." };
    }
    if (dir.includes("..") || dir.startsWith("/")) {
      return { ok: false, error: "The layout contains unsafe folder paths. Please try again." };
    }
  }

  // Token defaults
  if (obj.token_defaults !== undefined && obj.token_defaults !== null) {
    if (typeof obj.token_defaults !== "object" || Array.isArray(obj.token_defaults)) {
      obj.token_defaults = {};
    }
  } else {
    obj.token_defaults = {};
  }

  // Build the validated template
  const template: FolderTemplate = {
    template_id: `custom:${crypto.randomUUID()}`,
    name: obj.name.trim(),
    description: obj.description.trim(),
    is_preset: false,
    routing_rules: (obj.routing_rules as Record<string, unknown>[]).map((r): RoutingRule => {
      const rule: RoutingRule = {
        label: (r.label as string).trim(),
        dest_pattern: (r.dest_pattern as string).trim(),
      };
      if (r.match && typeof r.match === "object") {
        const m = r.match as Record<string, unknown>;
        if ("media_type" in m && typeof m.media_type === "string") {
          rule.match = { media_type: m.media_type as "RAW" | "PHOTO" | "VIDEO" };
        } else if ("extensions" in m && Array.isArray(m.extensions)) {
          rule.match = { extensions: m.extensions as string[] };
        }
      }
      return rule;
    }),
    scaffold_dirs: (obj.scaffold_dirs as string[]).map((d) => d.trim()).filter(Boolean),
    token_defaults: (obj.token_defaults ?? {}) as Record<string, string>,
  };

  if (obj.job_root_pattern && typeof obj.job_root_pattern === "string") {
    template.job_root_pattern = obj.job_root_pattern.trim();
  }

  return { ok: true, template };
}
