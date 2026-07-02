"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  ACCEPTED_IMAGE_TYPES,
  SIGNED_URL_TTL,
} from "@/components/canvas/asset-upload";
import {
  removeBrandLogo,
  updateBrandLogo,
} from "@/app/(app)/dashboard/actions";
import { createClient } from "@/lib/supabase/client";
import type { Brand } from "@/types";

/**
 * Upload one brand logo browser-direct to Storage and return its signed URL —
 * the SAME sequence as `uploadAsset` (`components/canvas/asset-upload.ts`):
 * binary straight to the private `product-assets` bucket (server actions cap
 * request bodies at ~4 MB), then a 1-year signed URL. Reuses that bucket and
 * its RLS — objects are keyed `{workspace_id}/…` because the policies scope by
 * FIRST path segment, so logos live under `{workspace_id}/brand-logos/…`
 * (workspace first, unlike a `brand-logos/{workspace_id}` prefix, which the
 * existing policies would reject). No metadata table row here — the brand row
 * itself (`brands.logo_url`) is the record, written by `updateBrandLogo`.
 */
async function uploadBrandLogo(
  file: File,
  workspaceId: string,
  brandId: string,
): Promise<string> {
  const supabase = createClient();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${workspaceId}/brand-logos/${brandId}/${Date.now()}_${safeName}`;

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
  return signed.signedUrl;
}

/**
 * The logo THUMBNAIL a brand row leads with: the current logo on a white
 * ground, or a muted placeholder when unset. Display-only — the actions live
 * in `BrandLogoControl` on the row's other end.
 */
export function BrandLogoThumb({ brand }: { brand: Brand }) {
  if (brand.logo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={brand.logo_url}
        alt={`${brand.name} logo`}
        className="size-10 shrink-0 rounded-md border bg-white object-contain p-1"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md border"
    >
      <ImageIcon className="size-4" />
    </span>
  );
}

/**
 * Per-brand logo actions for the Brands tab: upload/replace and remove. One
 * logo per brand, shown in the row's thumb now and destined for the PDF
 * cover/header later — this is the brand's OWN logo on its tech packs, not
 * platform white-labelling. Mutations follow the standing pattern: server
 * action + `router.refresh()`, with pending state via `useTransition`.
 */
export function BrandLogoControl({
  brand,
  workspaceId,
}: {
  brand: Brand;
  workspaceId: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isRemoving, startRemove] = useTransition();

  async function handleFile(file: File) {
    setIsUploading(true);
    try {
      const logoUrl = await uploadBrandLogo(file, workspaceId, brand.id);
      await updateBrandLogo(brand.id, logoUrl);
      toast.success("Logo updated.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  function handleRemove() {
    startRemove(async () => {
      try {
        await removeBrandLogo(brand.id);
        toast.success("Logo removed.");
        router.refresh();
      } catch {
        toast.error("Could not remove the logo.");
      }
    });
  }

  return (
    <div className="flex items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleFile(file);
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isUploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        {isUploading ? "Uploading…" : brand.logo_url ? "Replace" : "Add logo"}
      </Button>
      {brand.logo_url && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isRemoving}
          aria-label={`Remove ${brand.name} logo`}
          className="text-muted-foreground hover:text-destructive"
          onClick={handleRemove}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}
