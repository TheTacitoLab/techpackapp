"use client";

/**
 * Shared client-side asset upload flow, used by both `AssetLibrary` and
 * `AssetPicker` so the Storage → signed-URL → metadata sequence lives in one
 * place.
 *
 * Why the browser (not a server action) does the binary upload: server actions
 * have a ~4 MB request-body limit that breaks real image uploads, so the file
 * goes straight from the browser to Supabase Storage (see the note at the top of
 * `canvas-actions.ts`). Only the small metadata row is written via the action.
 *
 * SIGNED URLS — the `product-assets` bucket is PRIVATE (migration 0015), so a
 * public URL can't render the image. The simplest V1 approach (chosen here): at
 * upload time mint a long-lived (1-year) signed URL and persist it in
 * `file_url`. We keep `file_path` too, so a later phase can add
 * refresh-on-expiry by re-signing the path — no schema change needed.
 */

import { uploadAssetMetadata } from "@/app/(app)/products/[id]/canvas-actions";
import { createClient } from "@/lib/supabase/client";
import type { ProductAsset } from "@/types";

/**
 * 1 year, in seconds — the signed-URL lifetime (see file header). Exported so
 * the brand-logo upload (which reuses this exact Storage pattern) signs for
 * the same duration.
 */
export const SIGNED_URL_TTL = 60 * 60 * 24 * 365;

/**
 * Turn a filename into a friendly default asset name: drop the extension,
 * swap underscores/hyphens for spaces, collapse whitespace, and Title-Case it.
 * e.g. `front_flat-v2.png` → `Front Flat V2`.
 */
export function defaultAssetName(filename: string): string {
  return filename
    .replace(/\.[^./\\]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Read an image's natural dimensions in the browser before upload. SVGs (and
 * any file the browser can't decode) resolve to `null`/`null` rather than a
 * bogus `0×0`, so the DB records "unknown" honestly.
 */
function readImageDimensions(
  file: File,
): Promise<{ width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth || null,
        height: img.naturalHeight || null,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: null, height: null });
    };
    img.src = url;
  });
}

/**
 * Upload one file end-to-end and return the created asset. The returned object
 * is a fully-formed `ProductAsset` (the action gives us the new `id`; the rest
 * we already know), so callers like the picker can optimistically select the
 * new asset without waiting for a refetch.
 */
export async function uploadAsset(
  file: File,
  productId: string,
  workspaceId: string,
): Promise<ProductAsset> {
  const supabase = createClient();
  const { width, height } = await readImageDimensions(file);

  // Storage keys must be URL-safe; keep the original name only for display.
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${workspaceId}/${productId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("product-assets")
    .upload(path, file, { contentType: file.type || undefined });
  if (uploadError) throw new Error(uploadError.message);

  const { data: signed, error: signError } = await supabase.storage
    .from("product-assets")
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signError || !signed) {
    throw new Error(signError?.message ?? "Could not create a signed URL.");
  }

  const name = defaultAssetName(file.name);
  const { id } = await uploadAssetMetadata(
    productId,
    path,
    signed.signedUrl,
    name,
    width,
    height,
  );

  return {
    id,
    product_id: productId,
    workspace_id: workspaceId,
    name,
    file_path: path,
    file_url: signed.signedUrl,
    width,
    height,
    created_by: null,
    created_at: new Date().toISOString(),
  };
}

/** MIME types accepted by both upload entry points. */
export const ACCEPTED_IMAGE_TYPES =
  "image/png,image/jpeg,image/svg+xml,image/webp";
