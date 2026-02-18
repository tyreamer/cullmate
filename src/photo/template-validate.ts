import type { FolderTemplate } from "./folder-template.js";
import { validatePattern } from "./template-expand.js";

const MAX_FOLDER_DEPTH = 10;

/**
 * Validate a FolderTemplate. Returns an array of error messages (empty = valid).
 */
export function validateFolderTemplate(t: FolderTemplate): string[] {
  const errors: string[] = [];

  if (!t.template_id) {
    errors.push("template_id is required");
  }
  if (!t.name) {
    errors.push("name is required");
  }

  // Validate routing rules
  if (!t.routing_rules || t.routing_rules.length === 0) {
    errors.push("At least one routing rule is required");
  } else {
    for (let i = 0; i < t.routing_rules.length; i++) {
      const rule = t.routing_rules[i];
      if (!rule.label) {
        errors.push(`routing_rules[${i}]: label is required`);
      }
      if (!rule.dest_pattern) {
        errors.push(`routing_rules[${i}]: dest_pattern is required`);
      } else {
        const patternErrors = validatePattern(rule.dest_pattern);
        for (const err of patternErrors) {
          errors.push(`routing_rules[${i}].dest_pattern: ${err}`);
        }
        // Check folder depth
        const depth = rule.dest_pattern.split("/").length;
        if (depth > MAX_FOLDER_DEPTH) {
          errors.push(
            `routing_rules[${i}].dest_pattern: exceeds max folder depth of ${MAX_FOLDER_DEPTH}`,
          );
        }
      }
    }

    // Warn if last rule is not a catch-all (has a match condition)
    const lastRule = t.routing_rules[t.routing_rules.length - 1];
    if (lastRule.match) {
      errors.push("Last routing rule should be a catch-all (no match condition)");
    }
  }

  // Validate job_root_pattern if present
  if (t.job_root_pattern) {
    const patternErrors = validatePattern(t.job_root_pattern);
    for (const err of patternErrors) {
      errors.push(`job_root_pattern: ${err}`);
    }
    const depth = t.job_root_pattern.split("/").length;
    if (depth > MAX_FOLDER_DEPTH) {
      errors.push(`job_root_pattern: exceeds max folder depth of ${MAX_FOLDER_DEPTH}`);
    }
  }

  // Validate scaffold_dirs: must not contain tokens
  if (t.scaffold_dirs) {
    const tokenRe = /\{[A-Z_]+\}/;
    for (let i = 0; i < t.scaffold_dirs.length; i++) {
      const dir = t.scaffold_dirs[i];
      if (tokenRe.test(dir)) {
        errors.push(`scaffold_dirs[${i}]: must not contain tokens`);
      }
      if (dir.startsWith("/")) {
        errors.push(`scaffold_dirs[${i}]: must not be an absolute path`);
      }
      if (dir.includes("..")) {
        errors.push(`scaffold_dirs[${i}]: must not contain path traversal`);
      }
      const depth = dir.split("/").length;
      if (depth > MAX_FOLDER_DEPTH) {
        errors.push(`scaffold_dirs[${i}]: exceeds max folder depth of ${MAX_FOLDER_DEPTH}`);
      }
    }
  }

  return errors;
}
