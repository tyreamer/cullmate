import fs from "node:fs/promises";
import path from "node:path";
import type { TriageResult } from "./triage-types.js";

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function escapeCsvField(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function writeTriageJson(cullmateDir: string, result: TriageResult): Promise<string> {
  const dir = path.join(cullmateDir, "manifests");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const filename = `${timestamp()}_triage.json`;
  const filePath = path.join(dir, filename);
  await fs.writeFile(filePath, JSON.stringify(result, null, 2), {
    mode: 0o600,
  });
  return filePath;
}

export async function writeTriageCsv(cullmateDir: string, result: TriageResult): Promise<string> {
  const dir = path.join(cullmateDir, "reports");
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const filename = `${timestamp()}_triage.csv`;
  const filePath = path.join(dir, filename);

  const header = "file,flag,confidence,reason,metric";
  const rows = result.flagged_files.flatMap((f) =>
    f.flags.map(
      (flag) =>
        `${escapeCsvField(f.src_rel)},${flag.kind},${flag.confidence},${escapeCsvField(flag.reason)},${flag.metric ?? ""}`,
    ),
  );

  await fs.writeFile(filePath, [header, ...rows].join("\n") + "\n", {
    mode: 0o600,
  });
  return filePath;
}
