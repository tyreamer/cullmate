export type ExifInfo = {
  captureDate: Date | null;
  cameraModel: string | null;
  cameraSerial: string | null;
};

const EXIF_TAGS = [
  "DateTimeOriginal",
  "CreateDate",
  "Model",
  "SerialNumber",
  "BodySerialNumber",
] as const;

/**
 * Extract EXIF metadata from a file. Returns nulls on any error — never fails the ingest.
 * Only reads header bytes for speed.
 */
export async function extractExifInfo(filePath: string): Promise<ExifInfo> {
  try {
    // Dynamic import to avoid loading exifr if not needed
    const exifr = await import("exifr");
    const data = await exifr.parse(filePath, { pick: [...EXIF_TAGS] });
    if (!data) {
      return { captureDate: null, cameraModel: null, cameraSerial: null };
    }

    const captureDate = resolveDate(data.DateTimeOriginal ?? data.CreateDate);
    const cameraModel = typeof data.Model === "string" ? data.Model.trim() : null;
    const cameraSerial =
      typeof data.SerialNumber === "string"
        ? data.SerialNumber.trim()
        : typeof data.BodySerialNumber === "string"
          ? data.BodySerialNumber.trim()
          : null;

    return { captureDate, cameraModel, cameraSerial };
  } catch {
    return { captureDate: null, cameraModel: null, cameraSerial: null };
  }
}

function resolveDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === "string") {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }
  return null;
}
