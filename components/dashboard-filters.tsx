"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Brand, Collection, Season } from "@/types";

const PRODUCT_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "sent_to_factory", label: "Sent to Factory" },
  { value: "sample_received", label: "Sample Received" },
  { value: "approved", label: "Approved" },
  { value: "in_production", label: "In Production" },
] as const;

export function DashboardFilters({
  brands,
  collections,
  seasons,
}: {
  brands: Brand[];
  collections: Collection[];
  seasons: Season[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const setParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value && value !== "all") {
        params.set(key, value);
      } else {
        params.delete(key);
      }
      // reset page when filtering
      router.push(`${pathname}?${params.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const selectedBrand = searchParams.get("brand") ?? "all";
  const selectedCollection = searchParams.get("collection") ?? "all";
  const selectedSeason = searchParams.get("season") ?? "all";
  const selectedStatus = searchParams.get("status") ?? "all";
  const search = searchParams.get("q") ?? "";

  const filteredCollections =
    selectedBrand !== "all"
      ? collections.filter((c) => c.brand_id === selectedBrand)
      : collections;

  function onSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const params = new URLSearchParams(searchParams.toString());
    if (e.target.value) {
      params.set("q", e.target.value);
    } else {
      params.delete("q");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-[200px] flex-1">
        <Search className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          placeholder="Search products…"
          className="pl-9"
          defaultValue={search}
          onChange={onSearchChange}
        />
      </div>

      {brands.length > 0 && (
        <Select
          value={selectedBrand}
          onValueChange={(v) => {
            setParam("brand", v);
            setParam("collection", "all");
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All brands" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All brands</SelectItem>
            {brands.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {filteredCollections.length > 0 && (
        <Select
          value={selectedCollection}
          onValueChange={(v) => setParam("collection", v)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All collections" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All collections</SelectItem>
            {filteredCollections.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {seasons.length > 0 && (
        <Select
          value={selectedSeason}
          onValueChange={(v) => setParam("season", v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="All seasons" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All seasons</SelectItem>
            {seasons.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} {s.year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={selectedStatus}
        onValueChange={(v) => setParam("status", v)}
      >
        <SelectTrigger className="w-[160px]">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All statuses</SelectItem>
          {PRODUCT_STATUSES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
