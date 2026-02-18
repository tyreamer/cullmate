import { html } from "lit";
import type { FolderTemplate } from "../../../../src/photo/folder-template.js";

/**
 * Render a visual monospace folder tree preview from a FolderTemplate.
 * Expands tokens using sample values and shows simulated files in muted color.
 */
export function renderFolderTreePreview(template: FolderTemplate, projectName = "MyProject") {
  const lines: Array<{ text: string; muted?: boolean }> = [];
  lines.push({ text: `${projectName}/` });

  // Collect routing destination folders
  const routingDirs = new Set<string>();
  for (const rule of template.routing_rules) {
    // Replace tokens with sample values for preview
    const expanded = expandPreview(rule.dest_pattern);
    routingDirs.add(expanded);
  }

  // Scaffold dirs
  const scaffoldDirs = new Set(template.scaffold_dirs);

  // Combine all dirs and sort
  const allDirs = [...new Set([...routingDirs, ...scaffoldDirs])].toSorted();

  for (let i = 0; i < allDirs.length; i++) {
    const dir = allDirs[i];
    const isLast = i === allDirs.length - 1 && !scaffoldDirs.has(dir); // .cullmate always comes after
    const prefix = isLast ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";

    if (routingDirs.has(dir)) {
      lines.push({ text: `  ${prefix}${dir}/` });
      // Show sample files inside routing dirs
      const rule = template.routing_rules.find((r) => expandPreview(r.dest_pattern) === dir);
      if (rule) {
        const sampleFiles = getSampleFiles(rule.label);
        for (let j = 0; j < sampleFiles.length; j++) {
          const filePrefix =
            j === sampleFiles.length - 1 ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 ";
          const indent = isLast ? "      " : "  \u2502   ";
          lines.push({ text: `${indent}${filePrefix}${sampleFiles[j]}`, muted: true });
        }
      }
    } else {
      lines.push({ text: `  ${prefix}${dir}/` });
    }
  }

  // Always show .cullmate/
  lines.push({ text: "  \u2514\u2500\u2500 .cullmate/" });

  return html`
    <div
      style="font-family: 'SF Mono', Monaco, Consolas, monospace; font-size: 0.75rem; line-height: 1.6; background: var(--secondary); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px 16px; overflow-x: auto; white-space: pre;"
    >
      ${lines.map(
        (line) =>
          html`<div style="color: ${line.muted ? "var(--muted)" : "var(--text)"};">${line.text}</div>`,
      )}
    </div>
  `;
}

const SAMPLE_TOKEN_VALUES: Record<string, string> = {
  YYYY: "2026",
  MM: "02",
  DD: "17",
  CLIENT: "Client",
  JOB: "Job",
  MEDIA_TYPE: "RAW",
  CAMERA_MODEL: "Canon_EOS_R5",
  CAMERA_SERIAL_SHORT: "ABC123",
  CAMERA_LABEL: "Canon_EOS_R5",
  CARD_LABEL: "SD_CARD",
  EXT: "cr2",
  ORIGINAL_FILENAME: "IMG_001",
};

function expandPreview(pattern: string): string {
  return pattern.replace(/\{([A-Z_]+)\}/g, (_m, token: string) => {
    return SAMPLE_TOKEN_VALUES[token] ?? token;
  });
}

function getSampleFiles(ruleLabel: string): string[] {
  const lower = ruleLabel.toLowerCase();
  if (lower.includes("raw")) {
    return ["IMG_001.cr2", "IMG_002.nef"];
  }
  if (lower.includes("video")) {
    return ["MOV_001.mp4", "MOV_002.mov"];
  }
  if (lower.includes("photo")) {
    return ["DSC_001.jpg", "DSC_002.png"];
  }
  return ["IMG_001.cr2", "DSC_002.jpg"];
}
