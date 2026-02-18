export type TriageFlagKind = "unreadable" | "black_frame";

export type TriageFlag = {
  kind: TriageFlagKind;
  reason: string;
  confidence: number;
  metric?: number;
};

export type TriageFileResult = {
  src_rel: string;
  dst_rel: string;
  flags: TriageFlag[];
};

export type TriageResult = {
  version: 1;
  ran_at: string;
  elapsed_ms: number;
  file_count: number;
  unreadable_count: number;
  black_frame_count: number;
  flagged_files: TriageFileResult[];
};

export type TriageParams = {
  files: import("./types.js").FileEntry[];
  projectRoot: string;
};
