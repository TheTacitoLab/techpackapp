"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImageIcon, Loader2, Search, Upload } from "lucide-react";
import { toast } from "sonner";

import {
  ACCEPTED_IMAGE_TYPES,
  uploadAsset,
} from "@/components/canvas/asset-upload";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ProductAsset } from "@/types";

/** Above this many assets, a search box appears to filter by name. */
const SEARCH_THRESHOLD = 6;

/**
 * Reusable asset picker — a centred modal of the product's images plus a
 * dedicated "upload new" area. Pass any `trigger` element (an empty canvas
 * slot's "Add image" button, the framing toolbar's "Change image") and handle
 * the chosen asset in `onSelect`.
 *
 * Dialog (not Popover): a popover anchored to a slot button ends up hugging a
 * viewport edge and CLIPS the asset grid behind a scroll arrow. The shared
 * `Dialog` centres the picker over a dimmed backdrop like every other modal in
 * the app (escape / backdrop-click / × all close it), the grid scrolls
 * INTERNALLY, and the upload area stays visible above it. Presentation only —
 * selection and the browser → Storage upload flow are unchanged.
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
      // TEMP diagnostic: log the full error (message is redacted in prod).
      console.error("[DIAG] uploadAsset (picker) failed:", err);
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setIsUploading(false);
    }
  }

  const showSearch = assets.length > SEARCH_THRESHOLD;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Product images</DialogTitle>
          <DialogDescription>
            Choose an image from this product&rsquo;s assets, or upload a new
            one.
          </DialogDescription>
        </DialogHeader>

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

        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground focus-visible:ring-ring flex w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-5 outline-none transition-colors focus-visible:ring-2 disabled:opacity-60"
        >
          {isUploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Upload className="size-5" />
          )}
          <span className="text-foreground text-sm font-medium">
            {isUploading ? "Uploading…" : "Upload new image"}
          </span>
          <span className="text-xs">PNG, JPG, SVG or WEBP</span>
        </button>

        {showSearch && (
          <div className="relative">
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
          <EmptyState
            icon={ImageIcon}
            title="No assets yet"
            description="Upload an image to place it here."
            className="p-6"
          />
        ) : (
          <div className="grid max-h-[55vh] grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
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
              <p className="text-muted-foreground col-span-3 py-4 text-center text-xs sm:col-span-4">
                No assets match &ldquo;{query}&rdquo;.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
