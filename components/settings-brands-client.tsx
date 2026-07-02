"use client";

import {
  CreateBrandDialog,
  CreateSeasonDialog,
  DeleteBrandButton,
  RenameBrandDialog,
} from "@/components/hierarchy-dialogs";
import {
  BrandLogoControl,
  BrandLogoThumb,
} from "@/components/settings/brand-logo-control";
import type { Brand, Season } from "@/types";

type BrandWithCount = Brand & { productCount: number };

export function SettingsBrandsClient({
  brands,
  seasons,
  workspaceId,
}: {
  brands: BrandWithCount[];
  seasons: Season[];
  workspaceId: string;
}) {
  return (
    <div className="space-y-4">
      {brands.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No brands yet. Create one to start organising your products.
        </p>
      ) : (
        <ul className="divide-y">
          {brands.map((brand) => (
            <li
              key={brand.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <BrandLogoThumb brand={brand} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{brand.name}</p>
                <p className="text-muted-foreground text-xs">
                  {brand.productCount === 1
                    ? "1 product"
                    : `${brand.productCount} products`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <BrandLogoControl brand={brand} workspaceId={workspaceId} />
                <RenameBrandDialog id={brand.id} name={brand.name} />
                <DeleteBrandButton id={brand.id} name={brand.name} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <CreateBrandDialog />
        <CreateSeasonDialog
          trigger={
            <button className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded px-2 py-1 text-sm transition-colors">
              + Add season
            </button>
          }
        />
      </div>

      {seasons.length > 0 && (
        <div className="mt-2">
          <p className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wider">
            Seasons
          </p>
          <ul className="flex flex-wrap gap-2">
            {seasons.map((s) => (
              <li
                key={s.id}
                className="bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs"
              >
                {s.name} {s.year}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
