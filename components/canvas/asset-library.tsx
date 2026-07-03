"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ImageIcon,
  Loader2,
  MoreHorizontal,
  Pencil,
  TriangleAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

import {
  ACCEPTED_IMAGE_TYPES,
  uploadAsset,
} from "@/components/canvas/asset-upload";
import { EmptyState } from "@/components/empty-state";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  deleteAsset,
  renameAsset,
} from "@/app/(app)/products/[id]/canvas-actions";
import type { ProductAsset } from "@/types";

// ---- Rename form ------------------------------------------------------------

const renameSchema = z.object({
  name: z.string().trim().min(1, "A name is required.").max(80, "Max 80 characters."),
});
type RenameValues = z.infer<typeof renameSchema>;

/** In-flight (or failed) upload placeholder shown in the grid ahead of refresh. */
type PendingUpload = {
  tempId: string;
  filename: string;
  error?: string;
};

// ---- Asset tile -------------------------------------------------------------

function AssetTile({
  asset,
  inUse,
  onPreview,
  onRename,
  onDelete,
}: {
  asset: ProductAsset;
  inUse: boolean;
  onPreview: (asset: ProductAsset) => void;
  onRename: (asset: ProductAsset) => void;
  onDelete: (asset: ProductAsset) => void;
}) {
  return (
    <div className="group">
      <div className="bg-muted border-border relative aspect-[3/4] overflow-hidden rounded-lg border">
        {/* The image itself is the preview trigger. The three-dot menu is a
            SIBLING layered above it, so a menu click can never fall through to
            the preview — the lightbox opens only from the picture. */}
        <button
          type="button"
          onClick={() => onPreview(asset)}
          aria-label={`Preview ${asset.name}`}
          className="focus-visible:ring-ring block size-full cursor-zoom-in outline-none focus-visible:ring-2"
        >
          {/* Plain <img>: the file_url is a signed URL for the private bucket, so
              next/image (which would need remotePatterns) buys us nothing here. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={asset.file_url}
            alt={asset.name}
            className="size-full object-cover"
          />
        </button>

        {inUse && (
          <Badge
            variant="secondary"
            className="pointer-events-none absolute top-1.5 left-1.5 shadow-sm"
          >
            In use
          </Badge>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-1.5 right-1.5 size-7 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
              aria-label={`Actions for ${asset.name}`}
              // Belt-and-braces: even if this trigger is ever nested inside the
              // preview target, its clicks stay in the menu.
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onRename(asset)}>
              <Pencil className="size-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(asset)}
            >
              <Trash2 className="size-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-muted-foreground mt-1 truncate text-xs" title={asset.name}>
        {asset.name}
      </p>
    </div>
  );
}

// ---- Preview lightbox ---------------------------------------------------------

/**
 * Click-to-preview: the full image at its natural aspect ratio (object-contain
 * — never cropped, unlike the deliberately-cropped grid thumbnail), centered in
 * a large image-first Dialog. Closes on backdrop click, the X, or Escape — all
 * standard Dialog behaviour. Identification only: no zoom/pan/edit tools.
 */
function AssetPreviewDialog({
  asset,
  onOpenChange,
}: {
  asset: ProductAsset | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={asset !== null} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="w-fit max-w-[92vw] gap-3 p-3 sm:max-w-[92vw]"
      >
        <DialogHeader className="pr-8">
          <DialogTitle className="truncate text-sm font-medium">
            {asset?.name}
          </DialogTitle>
        </DialogHeader>
        {asset && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={asset.file_url}
            alt={asset.name}
            className="max-h-[82vh] max-w-[88vw] rounded-md object-contain"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Grey placeholder shown while a file uploads (or an inline error if it failed). */
function PendingTile({
  upload,
  onDismiss,
}: {
  upload: PendingUpload;
  onDismiss: (tempId: string) => void;
}) {
  return (
    <div>
      <div className="bg-muted border-border relative flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-lg border p-2 text-center">
        {upload.error ? (
          <>
            <TriangleAlert className="text-destructive size-5" />
            <p className="text-destructive text-[11px] leading-tight">
              {upload.error}
            </p>
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-1 right-1 size-6"
              aria-label="Dismiss failed upload"
              onClick={() => onDismiss(upload.tempId)}
            >
              <X className="size-3.5" />
            </Button>
          </>
        ) : (
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        )}
      </div>
      <p className="text-muted-foreground mt-1 truncate text-xs" title={upload.filename}>
        {upload.filename}
      </p>
    </div>
  );
}

// ---- Rename dialog ----------------------------------------------------------

function RenameDialog({
  asset,
  onOpenChange,
}: {
  asset: ProductAsset | null;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const form = useForm<RenameValues>({
    resolver: zodResolver(renameSchema),
    values: { name: asset?.name ?? "" },
  });

  function onSubmit(values: RenameValues) {
    if (!asset) return;
    startTransition(async () => {
      try {
        await renameAsset(asset.id, values.name);
        toast.success("Asset renamed.");
        onOpenChange(false);
        router.refresh();
      } catch {
        toast.error("Could not rename the asset.");
      }
    });
  }

  return (
    <Dialog open={asset !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename asset</DialogTitle>
          <DialogDescription>
            Give this image a clear name — it&apos;s how you&apos;ll find it when
            filling canvas slots.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoFocus placeholder="e.g. Front Flat" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// ---- Delete dialog ----------------------------------------------------------

function DeleteDialog({
  asset,
  inUse,
  onOpenChange,
}: {
  asset: ProductAsset | null;
  inUse: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onConfirm() {
    if (!asset) return;
    startTransition(async () => {
      try {
        const { warning } = await deleteAsset(asset.id);
        if (warning) toast.warning(warning);
        else toast.success("Asset deleted.");
        onOpenChange(false);
        router.refresh();
      } catch {
        toast.error("Could not delete the asset.");
      }
    });
  }

  return (
    <AlertDialog open={asset !== null} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {asset?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. If this image is used in any locked canvas
            slot, removing it may affect your canvas pages.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {inUse && (
          <div className="bg-muted text-muted-foreground flex items-start gap-2 rounded-lg p-3 text-sm">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              This asset is currently placed on at least one canvas page.
              Deleting it will empty those slots.
            </span>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending}
            onClick={(e) => {
              // Keep the dialog open until the async delete resolves.
              e.preventDefault();
              onConfirm();
            }}
          >
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ---- Main component ---------------------------------------------------------

export function AssetLibrary({
  productId,
  workspaceId,
  assets,
  usedAssetIds,
}: {
  productId: string;
  workspaceId: string;
  assets: ProductAsset[];
  usedAssetIds: Set<string>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [previewTarget, setPreviewTarget] = useState<ProductAsset | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProductAsset | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProductAsset | null>(null);

  async function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);

    // Register a placeholder per file up front so all uploads show progress
    // simultaneously (not one shared spinner).
    const items: PendingUpload[] = files.map((file) => ({
      tempId: crypto.randomUUID(),
      filename: file.name,
    }));
    setPending((prev) => [...prev, ...items]);

    await Promise.all(
      files.map(async (file, i) => {
        const { tempId } = items[i];
        try {
          await uploadAsset(file, productId, workspaceId);
          // Success: drop the placeholder — the refresh will surface the real tile.
          setPending((prev) => prev.filter((u) => u.tempId !== tempId));
        } catch (err) {
          // TEMP diagnostic: log the full error (message is redacted in prod).
          console.error("[DIAG] uploadAsset (library) failed:", err);
          const message =
            err instanceof Error ? err.message : "Upload failed.";
          setPending((prev) =>
            prev.map((u) => (u.tempId === tempId ? { ...u, error: message } : u)),
          );
        }
      }),
    );

    // Re-fetch so successfully uploaded assets appear; failed ones linger as
    // error tiles until dismissed.
    router.refresh();
  }

  function dismissPending(tempId: string) {
    setPending((prev) => prev.filter((u) => u.tempId !== tempId));
  }

  const hasContent = assets.length > 0 || pending.length > 0;

  return (
    <div className="bg-card shadow-card rounded-xl p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Asset Library</h3>
          <Badge variant="secondary">{assets.length}</Badge>
        </div>
        <Button
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="shrink-0"
        >
          <Upload className="size-4" />
          Upload Image
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES}
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            // Reset so re-selecting the same file fires onChange again.
            e.target.value = "";
          }}
        />
      </div>

      <div className="mt-4">
        {hasContent ? (
          // auto-fill keeps every tile the SAME fixed shape (aspect-[3/4] —
          // garment flats are mostly portrait) while the column count adapts to
          // the card width: compact, dense and uniform instead of three huge
          // columns on wide screens.
          <div className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
            {pending.map((upload) => (
              <PendingTile
                key={upload.tempId}
                upload={upload}
                onDismiss={dismissPending}
              />
            ))}
            {assets.map((asset) => (
              <AssetTile
                key={asset.id}
                asset={asset}
                inUse={usedAssetIds.has(asset.id)}
                onPreview={setPreviewTarget}
                onRename={setRenameTarget}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ImageIcon}
            title="No assets yet"
            description="Upload your garment sketches, references and close-up photos — they'll be available across all canvas pages."
            action={
              <Button onClick={() => inputRef.current?.click()}>
                <Upload className="size-4" />
                Upload Image
              </Button>
            }
          />
        )}
      </div>

      <AssetPreviewDialog
        asset={previewTarget}
        onOpenChange={(open) => !open && setPreviewTarget(null)}
      />
      <RenameDialog
        asset={renameTarget}
        onOpenChange={(open) => !open && setRenameTarget(null)}
      />
      <DeleteDialog
        asset={deleteTarget}
        inUse={deleteTarget ? usedAssetIds.has(deleteTarget.id) : false}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      />
    </div>
  );
}
