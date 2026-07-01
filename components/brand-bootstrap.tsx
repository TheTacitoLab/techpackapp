"use client";

import { useEffect } from "react";

import { useUiStore } from "@/stores/ui-store";
import type { Brand } from "@/types";

export function BrandBootstrap({ brands }: { brands: Brand[] }) {
  const activeBrandId = useUiStore((s) => s.activeBrandId);
  const setActiveBrandId = useUiStore((s) => s.setActiveBrandId);

  useEffect(() => {
    if (brands.length === 0) return;
    const ids = new Set(brands.map((b) => b.id));
    if (activeBrandId === null || !ids.has(activeBrandId)) {
      // brands are already sorted alphabetically from the server query
      setActiveBrandId(brands[0].id);
    }
  }, [activeBrandId, brands, setActiveBrandId]);

  return null;
}
