"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";

import { SaveAsTemplateDialog } from "@/components/templates/save-as-template-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The product header's overflow menu. Currently one action — "Save as
 * template" — kept as a menu so future product-level actions have a home.
 * Not rendered on templates themselves (a template of a template is just
 * Settings → duplicate territory, out of scope).
 */
export function ProductHeaderMenu({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Product actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setTemplateDialogOpen(true)}>
            Save as template
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SaveAsTemplateDialog
        productId={productId}
        productName={productName}
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
      />
    </>
  );
}
