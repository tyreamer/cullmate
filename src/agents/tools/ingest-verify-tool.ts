import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import type { FolderTemplate } from "../../photo/folder-template.js";
import type { IngestProgressEvent, OnProgress, VerifyMode } from "../../photo/types.js";
import type { AnyAgentTool } from "./common.js";
import { runIngest } from "../../photo/ingest.js";
import { optionalStringEnum } from "../schema/typebox.js";
import { jsonResult, readStringParam, ToolInputError } from "./common.js";

const IngestVerifySchema = Type.Object({
  source_path: Type.String({
    description: "Source directory containing photos/videos (e.g. SD card mount point)",
  }),
  dest_project_path: Type.String({
    description: "Parent directory for project output",
  }),
  project_name: Type.String({
    description: "Project folder name (e.g. 'WeddingShoot_2026')",
  }),
  verify_mode: optionalStringEnum(["none", "sentinel", "full"] as const, {
    default: "none",
    description: "Post-copy verification: none, sentinel (sample), or full (all files)",
  }),
  overwrite: Type.Optional(
    Type.Boolean({
      default: false,
      description: "If true, overwrite existing files at destination",
    }),
  ),
  hash_algo: optionalStringEnum(["blake3", "sha256", "sha512"] as const, {
    default: "sha256",
    description: "Hash algorithm for integrity verification",
  }),
  dedupe: Type.Optional(
    Type.Boolean({
      default: false,
      description: "If true, skip duplicate files based on content hash",
    }),
  ),
  backup_dest: Type.Optional(
    Type.String({
      description:
        "Backup destination parent directory. When set, files are copied to both primary and backup with safe_to_format verification.",
    }),
  ),
  folder_template: Type.Optional(
    Type.Unsafe<FolderTemplate>({
      description:
        "Folder template JSON object for routing files into subfolders. When omitted, uses the classic 01_RAW/ structure.",
    }),
  ),
  template_context: Type.Optional(
    Type.Record(Type.String(), Type.String(), {
      description: "User-provided token values for template expansion (e.g. CLIENT, JOB).",
    }),
  ),
});

export function createIngestVerifyTool(): AnyAgentTool {
  return {
    label: "Photo Ingest & Verify",
    name: "photo.ingest_verify",
    description:
      "Copy photos/videos from a source directory to a project folder while computing cryptographic hashes. Writes a JSON manifest and HTML proof report.",
    parameters: IngestVerifySchema,
    execute: async (
      _toolCallId: string,
      args: Record<string, unknown>,
      _signal?: AbortSignal,
      onUpdate?: (partialResult: AgentToolResult<unknown>) => void,
    ) => {
      const sourcePath = readStringParam(args, "source_path", { required: true });
      const destProjectPath = readStringParam(args, "dest_project_path", { required: true });
      const projectName = readStringParam(args, "project_name", { required: true });

      if (!projectName || projectName.includes("/") || projectName.includes("\\")) {
        throw new ToolInputError("project_name must not contain path separators");
      }

      const verifyMode = (
        typeof args.verify_mode === "string" ? args.verify_mode : "none"
      ) as VerifyMode;
      const overwrite = typeof args.overwrite === "boolean" ? args.overwrite : false;
      const hashAlgo = typeof args.hash_algo === "string" ? args.hash_algo : "sha256";
      const dedupe = typeof args.dedupe === "boolean" ? args.dedupe : false;
      const backupDest =
        typeof args.backup_dest === "string" ? args.backup_dest.trim() || undefined : undefined;
      const folderTemplate =
        args.folder_template && typeof args.folder_template === "object"
          ? (args.folder_template as FolderTemplate)
          : undefined;
      const templateContext =
        args.template_context && typeof args.template_context === "object"
          ? (args.template_context as Record<string, string>)
          : undefined;

      const progressCallback: OnProgress | undefined = onUpdate
        ? (event: IngestProgressEvent) => {
            onUpdate(jsonResult(event));
          }
        : undefined;

      const manifest = await runIngest(
        {
          source_path: sourcePath,
          dest_project_path: destProjectPath,
          project_name: projectName,
          verify_mode: verifyMode,
          overwrite,
          hash_algo: hashAlgo,
          dedupe,
          backup_dest: backupDest,
          folder_template: folderTemplate,
          template_context: templateContext,
        },
        progressCallback,
      );

      return jsonResult({
        ok: true,
        project_root: manifest.project_root,
        manifest_path: manifest.manifest_path,
        report_path: manifest.report_path,
        safe_to_format: manifest.safe_to_format,
        totals: manifest.totals,
      });
    },
  };
}
