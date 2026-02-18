export const ALLOWED_TOKENS = new Set([
  "YYYY",
  "MM",
  "DD",
  "CLIENT",
  "JOB",
  "MEDIA_TYPE",
  "CAMERA_MODEL",
  "CAMERA_SERIAL_SHORT",
  "CAMERA_LABEL",
  "CARD_LABEL",
  "EXT",
  "ORIGINAL_FILENAME",
]);

export type TokenContext = Record<string, string>;

const TOKEN_RE = /\{([A-Z_]+)\}/g;

/**
 * Validate a pattern string. Returns an array of error messages (empty = valid).
 */
export function validatePattern(pattern: string): string[] {
  const errors: string[] = [];
  if (!pattern) {
    errors.push("Pattern must not be empty");
    return errors;
  }

  // Check for unknown tokens
  let match: RegExpExecArray | null;
  const re = new RegExp(TOKEN_RE.source, "g");
  while ((match = re.exec(pattern)) !== null) {
    const token = match[1];
    if (!ALLOWED_TOKENS.has(token)) {
      errors.push(`Unknown token: {${token}}`);
    }
  }

  return errors;
}

/**
 * Sanitize a token value: strip path separators, control chars, null bytes,
 * and collapse sequences of unsafe characters.
 */
function sanitizeTokenValue(value: string): string {
  // Remove null bytes and control characters (C0 range + DEL)
  // eslint-disable-next-line no-control-regex
  let clean = value.replace(/[\x00-\x1f\x7f]/g, "");
  // Remove path separators
  clean = clean.replace(/[/\\]/g, "_");
  // Collapse runs of underscores
  clean = clean.replace(/_+/g, "_");
  return clean.trim();
}

/**
 * Expand a template pattern using the provided token context.
 * Unknown tokens are left as-is. Missing tokens use an empty string.
 */
export function expandTemplate(pattern: string, ctx: TokenContext): string {
  const expanded = pattern.replace(TOKEN_RE, (_match, token: string) => {
    const value = ctx[token] ?? "";
    return sanitizeTokenValue(value);
  });

  // Safety checks on the expanded result
  assertSafePath(expanded);

  return expanded;
}

/**
 * Assert the expanded path is safe: no path traversal, no absolute paths,
 * no null bytes, no control characters.
 */
function assertSafePath(expanded: string): void {
  if (expanded.includes("\x00")) {
    throw new Error("Expanded path contains null byte");
  }
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(expanded)) {
    throw new Error("Expanded path contains control characters");
  }
  if (expanded.startsWith("/")) {
    throw new Error("Expanded path must not be absolute");
  }
  // Check for path traversal in each segment
  const segments = expanded.split("/");
  for (const seg of segments) {
    if (seg === ".." || seg === ".") {
      throw new Error("Expanded path contains path traversal");
    }
  }
}
