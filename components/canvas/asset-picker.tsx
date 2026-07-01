"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import {
  ACCEPTED_IMAGE_TYPES,
  uploadAsset,
} from "@/components/canvas/asset-upload";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ProductAsset } from "@/types";

/** Above this many assets, a search box appears to filter by name. */
const SEARCH_THRESHOLD = 6;

/**
 * Reusable asset picker — a Popover of the product's images plus an inline
 * "upload new" tile. Designed for Phase 4c to drop onto an empty canvas slot:
 * pass any `trigger` element and handle the chosen asset in `onSelect`.
 *
 * Popover (not Sheet) throughout: a slot picker anchors naturally to the slot it
 * opens from, and one presentation keeps the component simple to reuse.
 */
export function AssetPicker({
  assets,
  onSelect,
  onUploadComplete,
  productId,
  workspaceId,
  trigger,
}: {
  assets: ProductAsset[];
  onSelect: (asset: ProductAsset) => void;
  onUploadComplete?: () => void;
  productId: string;
  workspaceId: string;
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return assets;
    return assets.filter((a) => a.name.toLowerCase().includes(q));
  }, [assets, query]);

  function choose(asset: ProductAsset) {
    onSelect(asset);
    setOpen(false);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    setIsUploading(true);
    try {
      // Upload sequentially so the first file is the one we auto-select.
      let firstUploaded: ProductAsset | null = null;
      for (const file of files) {
        const asset = await uploadAsset(file, productId, workspaceId);
        firstUploaded = firstUploaded ?? asset;
      }
      onUploadComplete?.();
      router.refresh();
      if (firstUploaded) choose(firstUploaded);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  const showSearch = assets.length > SEARCH_THRESHOLD;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />

        {showSearch && (
          <div className="relative mb-3">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search assets…"
              className="pl-8"
            />
          </div>
        )}

        {assets.length === 0 ? (
          <div className="space-y-3">
            <EmptyState
              icon={ImageIcon}
              title="No assets yet"
              description="Upload an image to place it here."
              className="p-6"
            />
            <UploadTile
              uploading={isUploading}
              onClick={() => inputRef.current?.click()}
            />
          </div>
        ) : (
          <div className="grid max-h-72 grid-cols-3 gap-2 overflow-y-auto">
            <UploadTile
              uploading={isUploading}
              onClick={() => inputRef.current?.click()}
            />
            {filtered.map((asset) => (
              <button
                key={asset.id}
                type="button"
                onClick={() => choose(asset)}
                className="group focus-visible:ring-ring rounded-lg text-left outline-none focus-visible:ring-2"
              >
                <div className="bg-muted border-border relative aspect-[3/4] overflow-hidden rounded-lg border transition-colors group-hover:border-foreground/30">
                  {/* Signed-URL image from the private bucket — see asset-upload.ts. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={asset.file_url}
                    alt={asset.name}
                    className="size-full object-cover"
                  />
                </div>
                <p
                  className="text-muted-foreground mt-1 truncate text-xs"
                  title={asset.name}
                >
                  {asset.name}
                </p>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="text-muted-foreground col-span-3 py-4 text-center text-xs">
                No assets match “{query}”.
              </p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** The "Upload new" tile — styled like an asset tile with a + affordance. */
function UploadTile({
  uploading,
  onClick,
}: {
  uploading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={uploading}
      className="focus-visible:ring-ring rounded-lg text-left outline-none focus-visible:ring-2 disabled:opacity-60"
    >
      <div className="bg-muted border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground flex aspect-[3/4] flex-col items-center justify-center gap-1.5 rounded-lg border transition-colors">
        {uploading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (
          <Plus className="size-5" />
        )}
        <span className="text-[11px] font-medium">
          {uploading ? "Uploading…" : "Upload new"}
        </span>
      </div>
    </button>
  );
}
