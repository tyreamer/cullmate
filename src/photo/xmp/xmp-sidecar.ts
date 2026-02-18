import fs from "node:fs/promises";
import path from "node:path";

export type XmpPatch = {
  creator?: string; // dc:creator
  rights?: string; // dc:rights
  webStatement?: string; // xmpRights:WebStatement
  credit?: string; // photoshop:Credit
};

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildXmpXml(patch: XmpPatch): string {
  const descAttrs: string[] = [];
  const descElements: string[] = [];

  if (patch.webStatement) {
    descAttrs.push(`   xmpRights:WebStatement="${escapeXml(patch.webStatement)}"`);
  }

  if (patch.credit) {
    descAttrs.push(`   photoshop:Credit="${escapeXml(patch.credit)}"`);
  }

  if (patch.rights) {
    descElements.push(
      `      <dc:rights>
       <rdf:Alt>
        <rdf:li xml:lang="x-default">${escapeXml(patch.rights)}</rdf:li>
       </rdf:Alt>
      </dc:rights>`,
    );
  }

  if (patch.creator) {
    descElements.push(
      `      <dc:creator>
       <rdf:Seq>
        <rdf:li>${escapeXml(patch.creator)}</rdf:li>
       </rdf:Seq>
      </dc:creator>`,
    );
  }

  const attrBlock = descAttrs.length > 0 ? `\n${descAttrs.join("\n")}` : "";
  const elemBlock = descElements.length > 0 ? `\n${descElements.join("\n")}\n   ` : "";

  return `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmlns:xmpRights="http://ns.adobe.com/xap/1.0/rights/"
   xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"${attrBlock}>${elemBlock}</rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>
`;
}

/**
 * Read an existing XMP sidecar and extract known fields.
 * Returns null if the file doesn't exist or can't be parsed.
 */
export async function readXmpSidecar(sidecarPath: string): Promise<XmpPatch | null> {
  try {
    const content = await fs.readFile(sidecarPath, "utf-8");
    const patch: XmpPatch = {};

    // Extract dc:creator from rdf:Seq/rdf:li
    const creatorMatch = content.match(/<dc:creator>\s*<rdf:Seq>\s*<rdf:li>([^<]*)<\/rdf:li>/s);
    if (creatorMatch?.[1]) {
      patch.creator = unescapeXml(creatorMatch[1]);
    }

    // Extract dc:rights from rdf:Alt/rdf:li
    const rightsMatch = content.match(/<dc:rights>\s*<rdf:Alt>\s*<rdf:li[^>]*>([^<]*)<\/rdf:li>/s);
    if (rightsMatch?.[1]) {
      patch.rights = unescapeXml(rightsMatch[1]);
    }

    // Extract xmpRights:WebStatement attribute
    const webMatch = content.match(/xmpRights:WebStatement="([^"]*)"/);
    if (webMatch?.[1]) {
      patch.webStatement = unescapeXml(webMatch[1]);
    }

    // Extract photoshop:Credit attribute
    const creditMatch = content.match(/photoshop:Credit="([^"]*)"/);
    if (creditMatch?.[1]) {
      patch.credit = unescapeXml(creditMatch[1]);
    }

    return patch;
  } catch {
    return null;
  }
}

function unescapeXml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

/**
 * Merge a patch into an existing sidecar file.
 * New patch fields override existing; empty strings clear fields.
 */
export async function applyXmpPatches(
  existingPath: string,
  patch: XmpPatch,
): Promise<{ written: boolean; error?: string }> {
  try {
    const existing = await readXmpSidecar(existingPath);
    const merged: XmpPatch = { ...existing, ...patch };

    // Empty strings clear the field
    for (const key of Object.keys(merged) as (keyof XmpPatch)[]) {
      if (merged[key] === "") {
        merged[key] = undefined;
      }
    }

    const xml = buildXmpXml(merged);
    await fs.writeFile(existingPath, xml, { mode: 0o644 });
    return { written: true };
  } catch (err) {
    return {
      written: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Write an XMP sidecar next to a media file.
 * If a sidecar already exists, merges the patch into it.
 * Never throws — returns { written: false, error } on failure.
 */
export async function writeXmpSidecar(
  mediaPath: string,
  patch: XmpPatch,
): Promise<{ written: boolean; sidecarPath: string; error?: string }> {
  const ext = path.extname(mediaPath);
  const sidecarPath = mediaPath.slice(0, -ext.length) + ".xmp";

  try {
    // Check if sidecar already exists
    let exists = false;
    try {
      await fs.access(sidecarPath);
      exists = true;
    } catch {
      // does not exist
    }

    if (exists) {
      const result = await applyXmpPatches(sidecarPath, patch);
      return { ...result, sidecarPath };
    }

    const xml = buildXmpXml(patch);
    await fs.writeFile(sidecarPath, xml, { mode: 0o644 });
    return { written: true, sidecarPath };
  } catch (err) {
    return {
      written: false,
      sidecarPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
