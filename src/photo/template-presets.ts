import type { FolderTemplate } from "./folder-template.js";

export const PRESET_CLASSIC: FolderTemplate = {
  template_id: "preset:classic",
  name: "Classic",
  description: "Simple RAW/Exports/Delivery structure (matches default behavior)",
  is_preset: true,
  routing_rules: [{ label: "All files", dest_pattern: "RAW" }],
  scaffold_dirs: ["EXPORTS", "DELIVERY"],
  token_defaults: {},
};

export const PRESET_DATE_ORGANIZED: FolderTemplate = {
  template_id: "preset:date-organized",
  name: "Date Organized",
  description: "Files sorted by capture date into year/month-day folders",
  is_preset: true,
  routing_rules: [{ label: "All by date", dest_pattern: "{YYYY}/{MM}-{DD}" }],
  scaffold_dirs: ["EXPORTS", "DELIVERY"],
  token_defaults: {},
};

export const PRESET_MEDIA_SPLIT: FolderTemplate = {
  template_id: "preset:media-split",
  name: "Media Split",
  description: "Separate folders for RAW, photo, and video files",
  is_preset: true,
  routing_rules: [
    { label: "RAW files", match: { media_type: "RAW" }, dest_pattern: "RAW" },
    { label: "Photo files", match: { media_type: "PHOTO" }, dest_pattern: "PHOTO" },
    { label: "Video files", match: { media_type: "VIDEO" }, dest_pattern: "VIDEO" },
    { label: "Other files", dest_pattern: "OTHER" },
  ],
  scaffold_dirs: ["EXPORTS", "DELIVERY"],
  token_defaults: {},
};

export const PRESET_CAMERA_DATE: FolderTemplate = {
  template_id: "preset:camera-date",
  name: "Camera + Date",
  description: "Files organized by camera body and capture date",
  is_preset: true,
  routing_rules: [{ label: "All by camera+date", dest_pattern: "{CAMERA_LABEL}/{YYYY}-{MM}-{DD}" }],
  scaffold_dirs: ["EXPORTS", "DELIVERY"],
  token_defaults: {},
};

export const PRESET_WEDDING: FolderTemplate = {
  template_id: "preset:wedding",
  name: "Wedding Pro",
  description: "Full wedding structure with RAW by camera, video, and delivery folders",
  is_preset: true,
  routing_rules: [
    {
      label: "RAW by camera",
      match: { media_type: "RAW" },
      dest_pattern: "RAW/{CAMERA_LABEL}",
    },
    { label: "Video files", match: { media_type: "VIDEO" }, dest_pattern: "VIDEO" },
    { label: "Other photos", dest_pattern: "PHOTO" },
  ],
  scaffold_dirs: ["EXPORTS/web", "EXPORTS/print", "DELIVERY"],
  token_defaults: {},
};

export const ALL_PRESETS: FolderTemplate[] = [
  PRESET_CLASSIC,
  PRESET_DATE_ORGANIZED,
  PRESET_MEDIA_SPLIT,
  PRESET_CAMERA_DATE,
  PRESET_WEDDING,
];
