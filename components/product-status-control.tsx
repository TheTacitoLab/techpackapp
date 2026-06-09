"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { updateProductStatus } from "@/app/(app)/dashboard/actions";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProductStatus } from "@/types";

const STATUSES: { value: ProductStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "sent_to_factory", label: "Sent to Factory" },
  { value: "sample_received", label: "Sample Received" },
  { value: "approved", label: "Approved" },
  { value: "in_production", label: "In Production" },
];

const BADGE_VARIANT: Record<
  ProductStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  draft: "secondary",
  in_review: "outline",
  sent_to_factory: "outline",
  sample_received: "outline",
  approved: "default",
  in_production: "default",
};

export function ProductStatusControl({
  productId,
  currentStatus,
}: {
  productId: string;
  currentStatus: ProductStatus;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(status: ProductStatus) {
    if (status === currentStatus) return;
    startTransition(async () => {
      try {
        await updateProductStatus(productId, status);
        toast.success("Status updated.");
        router.refresh();
      } catch {
        toast.error("Could not update status.");
      }
    });
  }

  const current = STATUSES.find((s) => s.value === currentStatus);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className="flex items-center gap-1.5 outline-none"
        aria-label="Change product status"
      >
        <Badge variant={BADGE_VARIANT[currentStatus]} className="text-sm">
          {current?.label}
        </Badge>
        <ChevronDown className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {STATUSES.map((s) => (
          <DropdownMenuItem
            key={s.value}
            onClick={() => onChange(s.value)}
            className={s.value === currentStatus ? "text-primary" : ""}
          >
            {s.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
