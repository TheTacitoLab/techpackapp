"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/stores/ui-store";
import type { Brand } from "@/types";

type BrandWithCount = Brand & { productCount: number };

export function SettingsBrandSwitcher({
  brands,
}: {
  brands: BrandWithCount[];
}) {
  const router = useRouter();
  const { activeBrandId, setActiveBrandId } = useUiStore();
  const [pendingId, setPendingId] = useState<string | null>(null);

  if (brands.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No brands yet. Create one in the &ldquo;Your Brands&rdquo; section above.
      </p>
    );
  }

  const selectedId = pendingId ?? activeBrandId;
  const isDifferent = pendingId !== null && pendingId !== activeBrandId;
  const selectedBrand = brands.find((b) => b.id === selectedId);

  function handleSwitch() {
    if (!pendingId || !isDifferent) return;
    setActiveBrandId(pendingId);
    const name = brands.find((b) => b.id === pendingId)?.name ?? "brand";
    toast.success(`Switched to ${name}`);
    setPendingId(null);
    router.push("/dashboard");
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {brands.map((brand) => {
          const isActive = brand.id === selectedId;
          return (
            <button
              key={brand.id}
              onClick={() => setPendingId(brand.id)}
              className={cn(
                "bg-card shadow-card relative flex flex-col gap-1 rounded-xl p-4 text-left transition-shadow",
                isActive
                  ? "ring-primary ring-1"
                  : "hover:shadow-card-hover",
              )}
            >
              {isActive && (
                <span className="absolute top-3 right-3">
                  <Check className="text-primary size-4" />
                </span>
              )}
              <span className="text-sm font-medium">{brand.name}</span>
              <span className="text-muted-foreground text-xs">
                {brand.productCount === 1
                  ? "1 product"
                  : `${brand.productCount} products`}
              </span>
            </button>
          );
        })}
      </div>

      <Button
        onClick={handleSwitch}
        disabled={!isDifferent}
        className="w-full sm:w-auto"
      >
        {isDifferent && selectedBrand
          ? `Switch to ${selectedBrand.name}`
          : "Switch brand"}
      </Button>
    </div>
  );
}
