import type { FolderTemplate } from "../../../../src/photo/folder-template.js";
import type { GatewayBrowserClient } from "../gateway.ts";

export type IngestStage = "idle" | "prompting" | "running" | "done" | "error";

export type IngestProgress = {
  type: string;
  index?: number;
  total?: number;
  rel_path?: string;
  discovered_count?: number;
  verified_count?: number;
  verified_total?: number;
  success_count?: number;
  fail_count?: number;
  elapsed_ms?: number;
  manifest_path?: string;
  report_path?: string;
  total_bytes_copied?: number;
  bytes_copied?: number;
};

export type RecentProject = {
  projectName: string;
  projectRoot: string;
  reportPath?: string;
  destPath: string;
  sourcePath: string;
  timestamp: number;
};

const RECENT_KEY = "cullmate.ingest.recent";

export function loadRecentProjects(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.slice(0, 5);
  } catch {
    return [];
  }
}

export function saveRecentProject(p: RecentProject): void {
  const existing = loadRecentProjects();
  const deduped = existing.filter((r) => r.projectRoot !== p.projectRoot);
  const next = [p, ...deduped].slice(0, 5);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export type IngestResult = {
  ok: boolean;
  project_root?: string;
  manifest_path?: string;
  report_path?: string;
  safe_to_format?: boolean;
  totals?: {
    file_count: number;
    success_count: number;
    fail_count: number;
    skip_count: number;
    total_bytes: number;
    verified_count: number;
    verified_ok: number;
    verified_mismatch: number;
    backup_success_count: number;
    backup_fail_count: number;
    backup_verified_count: number;
    backup_verified_ok: number;
    backup_verified_mismatch: number;
  };
};

export async function runIngestVerify(
  client: GatewayBrowserClient,
  args: {
    source_path: string;
    dest_project_path: string;
    project_name: string;
    verify_mode: string;
    hash_algo: string;
    overwrite: boolean;
    dedupe?: boolean;
    backup_dest?: string;
    folder_template?: FolderTemplate;
    template_context?: Record<string, string>;
  },
): Promise<IngestResult> {
  const response = await client.request<{
    tool: string;
    result: { content: Array<{ type: string; text: string }>; details: IngestResult };
  }>("tools.invoke", {
    name: "photo.ingest_verify",
    args,
  });
  return response.result.details;
}

export async function openPath(
  client: GatewayBrowserClient,
  filePath: string,
  allowedRoot: string,
  reveal = false,
): Promise<void> {
  await client.request("system.open_path", { path: filePath, allowed_root: allowedRoot, reveal });
}

export type PickFolderResult = { ok: true; path: string } | { ok: false; cancelled: true };

export async function pickFolder(
  client: GatewayBrowserClient,
  opts?: { prompt?: string; default_location?: string },
): Promise<PickFolderResult> {
  const response = await client.request<PickFolderResult>("system.pick_folder", {
    prompt: opts?.prompt,
    default_location: opts?.default_location,
  });
  return response;
}

export type VolumeEntry = { name: string; path: string };
export type SuggestedSource = { label: string; path: string };
export type ListVolumesResult = {
  volumes: VolumeEntry[];
  suggestedSources: SuggestedSource[];
};

export async function listVolumes(client: GatewayBrowserClient): Promise<ListVolumesResult> {
  return await client.request<ListVolumesResult>("system.list_volumes", {});
}
