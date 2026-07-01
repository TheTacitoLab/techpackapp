"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { updateProductStatus } from "@/app/(app)/dashboard/actions";
import { StatusPill } from "@/components/status-pill";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProductStatus } from "@/types";

const STATUS_ORDER: ProductStatus[] = [
  "draft",
  "in_review",
  "sent_to_factory",
  "sample_received",
  "approved",
  "in_production",
];

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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={isPending}
        className="flex cursor-pointer items-center gap-1.5 outline-none"
        aria-label="Change product status"
      >
        <StatusPill status={currentStatus} />
        <ChevronDown className="text-muted-foreground size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {STATUS_ORDER.map((value) => (
          <DropdownMenuItem
            key={value}
            onClick={() => onChange(value)}
            className={value === currentStatus ? "font-medium" : ""}
          >
            <StatusPill status={value} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
