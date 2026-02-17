export type VerifyMode = "none" | "sentinel" | "full";

export type IngestParams = {
  source_path: string;
  dest_project_path: string;
  project_name: string;
  verify_mode: VerifyMode;
  overwrite: boolean;
  hash_algo: string; // "blake3" | "sha256" | "sha512"
  dedupe?: boolean;
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
    };

export type OnProgress = (event: IngestProgressEvent) => void;
