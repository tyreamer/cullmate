import { randomUUID } from "node:crypto";
import type { FolderTemplate } from "./folder-template.js";
import { ALLOWED_TOKENS } from "./template-expand.js";
import { validateFolderTemplate } from "./template-validate.js";

export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";
export const SMART_FOLDERS_MODEL = "llama3.2:3b";
const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;

const SYSTEM_PROMPT = `You are a photography folder structure assistant. Given a photographer's description of how they want their files organized, generate a JSON object matching this exact schema:

{
  "template_id": "custom:<uuid>",
  "name": "<short name>",
  "description": "<1-sentence description>",
  "is_preset": false,
  "routing_rules": [
    {
      "label": "<human-readable label>",
      "match": { "media_type": "RAW" | "PHOTO" | "VIDEO" } or { "extensions": [".cr2", ".nef"] } or omit for catch-all,
      "dest_pattern": "<folder path with optional {TOKENS}>"
    }
  ],
  "scaffold_dirs": ["<dirs to always create, no tokens allowed>"],
  "token_defaults": {}
}

Available tokens for dest_pattern: ${[...ALLOWED_TOKENS].join(", ")}

Token descriptions:
- YYYY, MM, DD: Capture date components (from EXIF or import date)
- CLIENT, JOB: User-provided job metadata
- MEDIA_TYPE: "RAW", "PHOTO", or "VIDEO"
- CAMERA_MODEL: Full camera model name (e.g. "Canon EOS R5")
- CAMERA_SERIAL_SHORT: Last 6 chars of camera serial
- CAMERA_LABEL: Camera model + short serial (e.g. "Canon_EOS_R5_ABC123")
- CARD_LABEL: Memory card label
- EXT: File extension (lowercase, no dot)
- ORIGINAL_FILENAME: Original filename without extension

Rules:
- routing_rules must have at least one entry
- The last routing rule should be a catch-all (no "match" field)
- scaffold_dirs must NOT contain tokens — only static folder names
- dest_pattern must not start with "/" or contain ".."
- Maximum 10 levels of folder nesting
- media_type must be exactly "RAW", "PHOTO", or "VIDEO"

Example for "I want RAW files sorted by camera and date, videos separate, and an exports folder":
{
  "template_id": "custom:example",
  "name": "Camera RAW + Video",
  "description": "RAW sorted by camera and date, video separate, with exports",
  "is_preset": false,
  "routing_rules": [
    { "label": "RAW by camera+date", "match": { "media_type": "RAW" }, "dest_pattern": "RAW/{CAMERA_LABEL}/{YYYY}-{MM}-{DD}" },
    { "label": "Video files", "match": { "media_type": "VIDEO" }, "dest_pattern": "VIDEO" },
    { "label": "Other files", "dest_pattern": "OTHER" }
  ],
  "scaffold_dirs": ["EXPORTS"],
  "token_defaults": {}
}

Respond with ONLY the JSON object. No markdown, no explanation, no code fences.`;

function buildUserPrompt(prompt: string): string {
  return `Describe the folder structure: ${prompt}`;
}

function extractJson(text: string): string {
  // Try to extract JSON from code fences if the model wrapped it
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }
  // Try to find a JSON object in the text
  const braceStart = text.indexOf("{");
  const braceEnd = text.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    return text.slice(braceStart, braceEnd + 1);
  }
  return text.trim();
}

export async function generateTemplateFromPrompt(
  prompt: string,
  modelId: string,
  ollamaBaseUrl?: string,
): Promise<FolderTemplate> {
  const baseUrl = ollamaBaseUrl ?? DEFAULT_OLLAMA_BASE_URL;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const userPrompt =
      attempt === 0
        ? buildUserPrompt(prompt)
        : `${buildUserPrompt(prompt)}\n\nYour previous response had validation errors:\n${lastError?.message ?? "unknown error"}\n\nPlease fix these issues and respond with only the corrected JSON.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: modelId,
          system: SYSTEM_PROMPT,
          prompt: userPrompt,
          stream: false,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Ollama returned status ${response.status}`);
      }

      const data = (await response.json()) as { response?: string };
      const raw = data.response ?? "";
      const jsonStr = extractJson(raw);

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        throw new Error(`Failed to parse JSON from Ollama response: ${jsonStr.slice(0, 200)}`);
      }

      const template = parsed as FolderTemplate;

      // Ensure required fields
      template.is_preset = false;
      template.template_id = `custom:${randomUUID()}`;
      if (!template.token_defaults) {
        template.token_defaults = {};
      }
      if (!template.scaffold_dirs) {
        template.scaffold_dirs = [];
      }

      const errors = validateFolderTemplate(template);
      if (errors.length > 0) {
        lastError = new Error(errors.join("; "));
        if (attempt < MAX_RETRIES) {
          continue;
        }
        throw new Error(`Generated template failed validation: ${errors.join("; ")}`);
      }

      return template;
    } catch (err) {
      clearTimeout(timeout);
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new Error("Ollama request timed out after 30 seconds", { cause: err });
      }
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt >= MAX_RETRIES) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("Template generation failed");
}
