import type { FolderTemplate, MediaType } from "./folder-template.js";
import type { XmpPatch } from "./xmp/xmp-sidecar.js";

export type VerifyMode = "none" | "sentinel" | "full";

export type IngestParams = {
  source_path: string;
  dest_project_path: string;
  project_name: string;
  verify_mode: VerifyMode;
  overwrite: boolean;
  hash_algo: string; // "blake3" | "sha256" | "sha512"
  dedupe?: boolean;
  backup_dest?: string; // backup destination parent directory
  folder_template?: FolderTemplate;
  template_context?: Record<string, string>; // user-provided: CLIENT, JOB, etc.
  xmp_patch?: XmpPatch;
};

export type FileStatus = "copied" | "skipped_exists" | "skipped_duplicate" | "error";

export type FileEntry = {
  src_rel: string; // relative to source root
  dst_rel: string; // relative to project root
  bytes: number;
  hash: string; // hex digest from copy pass
  hash_dest?: string; // hex digest from verification pass
  status: FileStatus;
  duplicate_of?: string; // dst_rel of the first copy (when status=skipped_duplicate)
  error?: string;
  verified?: boolean; // true=match, false=mismatch, undefined=not checked
  media_type?: MediaType;
  routed_by?: string; // label of matching routing rule
  // XMP sidecar fields
  sidecar_written?: boolean; // true if .xmp was written successfully
  sidecar_path?: string; // relative path of the .xmp sidecar
  sidecar_error?: string; // error message if sidecar write failed
  // Backup copy fields (only present when backup_dest is set)
  backup_status?: FileStatus;
  backup_hash?: string; // hex digest from backup copy pass
  backup_hash_dest?: string; // hex digest from backup verification pass
  backup_verified?: boolean;
  backup_error?: string;
};

export type IngestManifest = {
  tool_version: 1;
  app_version: string;
  source_path: string;
  dest_root: string; // 01_RAW/ absolute path
  project_root: string; // project dir absolute path
  project_name: string;
  hash_algo: string;
  verify_mode: VerifyMode;
  started_at: string; // ISO 8601
  finished_at: string;
  manifest_path?: string;
  report_path?: string;
  backup_dest?: string; // backup parent directory
  backup_root?: string; // backup 01_RAW/ absolute path
  template_id?: string;
  safe_to_format: boolean;
  totals: {
    file_count: number;
    success_count: number;
    fail_count: number;
    skip_count: number;
    duplicate_count: number;
    bytes_saved: number;
    total_bytes: number;
    verified_count: number;
    verified_ok: number;
    verified_mismatch: number;
    backup_success_count: number;
    backup_fail_count: number;
    backup_verified_count: number;
    backup_verified_ok: number;
    backup_verified_mismatch: number;
    xmp_written_count: number;
    xmp_failed_count: number;
  };
  files: FileEntry[];
};

// Progress events emitted via onUpdate callback
export type IngestProgressEvent =
  | { type: "ingest.start"; source_path: string; project_root: string }
  | { type: "ingest.scan.progress"; discovered_count: number }
  | {
      type: "ingest.copy.progress";
      index: number;
      total: number;
      rel_path: string;
      bytes_copied: number;
      total_bytes_copied: number;
    }
  | {
      type: "ingest.dedupe.hit";
      rel_path: string;
      duplicate_of: string;
      bytes_saved_total: number;
      duplicate_count_total: number;
    }
  | {
      type: "ingest.verify.progress";
      mode: VerifyMode;
      verified_count: number;
      verified_total: number;
    }
  | { type: "ingest.backup.start"; backup_root: string }
  | {
      type: "ingest.backup.copy.progress";
      index: number;
      total: number;
      rel_path: string;
      bytes_copied: number;
      total_bytes_copied: number;
    }
  | {
      type: "ingest.backup.verify.progress";
      mode: VerifyMode;
      verified_count: number;
      verified_total: number;
    }
  | {
      type: "ingest.xmp.progress";
      written_count: number;
      failed_count: number;
      total: number;
    }
  | {
      type: "ingest.report.generated";
      manifest_path: string;
      report_path: string;
    }
  | {
      type: "ingest.done";
      success_count: number;
      fail_count: number;
      elapsed_ms: number;
      safe_to_format: boolean;
    };

export type OnProgress = (event: IngestProgressEvent) => void;
