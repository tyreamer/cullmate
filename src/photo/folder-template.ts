export type MediaType = "RAW" | "PHOTO" | "VIDEO";

export type RoutingMatch = { media_type: MediaType } | { extensions: string[] };

export type RoutingRule = {
  label: string;
  match?: RoutingMatch; // omitted = catch-all
  dest_pattern: string; // e.g. "RAW/{CAMERA_LABEL}"
};

export type FolderTemplate = {
  template_id: string; // "preset:classic" or "custom:abc123"
  name: string;
  description: string;
  is_preset: boolean;
  job_root_pattern?: string; // e.g. "{CLIENT}_{JOB}_{YYYY}{MM}{DD}"
  routing_rules: RoutingRule[];
  scaffold_dirs: string[]; // always created, no files routed here
  token_defaults: Record<string, string>;
};
