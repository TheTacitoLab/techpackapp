import Link from "next/link";
import { ArrowLeft, FileOutput } from "lucide-react";

import { getCurrentUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

/**
 * Export Hub — PLACEHOLDER. The Quick Export pop-up's "More options" link
 * lands here. TODO (Session 2): the real Export Hub — page thumbnails,
 * per-page selection, rename, PDF + Excel export. Until then this page just
 * confirms where the link goes and routes back.
 */
export default async function ExportHubPage({ params }: PageProps) {
  const { id } = await params;
  const ctx = await getCurrentUser();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data: product } = await supabase
    .from("products")
    .select("id, name")
    .eq("id", id)
    .eq("workspace_id", ctx.profile.workspace_id)
    .single();
  if (!product) notFound();

  return (
    <div className="flex flex-col items-center gap-4 py-24 text-center">
      <span className="bg-muted text-muted-foreground flex size-14 items-center justify-center rounded-full">
        <FileOutput className="size-7" />
      </span>
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Export Hub — coming soon</h1>
        <p className="text-muted-foreground max-w-md text-sm">
          Per-page selection, page thumbnails, renaming and Excel export for{" "}
          <span className="text-foreground font-medium">{product.name}</span>{" "}
          arrive in a later phase. Quick Export on the product page already
          builds the full tech pack PDF.
        </p>
      </div>
      <Link
        href={`/products/${product.id}`}
        className="text-foreground flex items-center gap-1.5 text-sm font-medium underline underline-offset-2"
      >
        <ArrowLeft className="size-4" />
        Back to the product
      </Link>
    </div>
  );
}
