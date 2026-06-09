"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Archive,
  ChevronRight,
  FolderOpen,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { Brand, Collection } from "@/types";

function NavItem({
  href,
  label,
  icon: Icon,
  exact = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <li>
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          active
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <Icon className="size-4" />
        {label}
      </Link>
    </li>
  );
}

function BrandNode({
  brand,
  collections,
}: {
  brand: Brand;
  collections: Collection[];
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentBrand = searchParams.get("brand");
  const isActive = currentBrand === brand.id;

  return (
    <li>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "flex flex-1 items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm transition-colors",
            isActive
              ? "text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          <ChevronRight
            className={cn(
              "size-3.5 shrink-0 transition-transform",
              open && "rotate-90",
            )}
          />
          <span className="flex-1 truncate">{brand.name}</span>
          <span className="text-muted-foreground/60 text-xs">
            {collections.length}
          </span>
        </button>
        <Link
          href={`/dashboard?brand=${brand.id}`}
          className={cn(
            "text-muted-foreground/60 hover:text-muted-foreground shrink-0 rounded p-1 text-xs transition-colors",
            currentBrand === brand.id && pathname === "/dashboard"
              ? "text-primary"
              : "",
          )}
          title={`Filter by ${brand.name}`}
        >
          <LayoutDashboard className="size-3" />
        </Link>
      </div>

      {open && collections.length > 0 && (
        <ul className="ml-4 mt-0.5 space-y-0.5 border-l pl-2">
          {collections.map((col) => {
            const currentCol = searchParams.get("collection");
            const colActive = currentCol === col.id;
            return (
              <li key={col.id}>
                <Link
                  href={`/dashboard?brand=${brand.id}&collection=${col.id}`}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
                    colActive
                      ? "text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <FolderOpen className="size-3 shrink-0" />
                  <span className="truncate">{col.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function AppNav({
  brands = [],
  collections = [],
}: {
  brands?: Brand[];
  collections?: Collection[];
}) {
  const collectionsByBrand = new Map<string, Collection[]>();
  for (const c of collections) {
    const arr = collectionsByBrand.get(c.brand_id) ?? [];
    arr.push(c);
    collectionsByBrand.set(c.brand_id, arr);
  }

  return (
    <div className="flex flex-col gap-1">
      <ul className="flex flex-col gap-1">
        <NavItem
          href="/dashboard"
          label="All Products"
          icon={LayoutDashboard}
          exact
        />
        <NavItem
          href="/dashboard?archived=1"
          label="Archived"
          icon={Archive}
          exact
        />
      </ul>

      {brands.length > 0 && (
        <>
          <div className="mt-4 mb-1 px-3">
            <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
              Brands
            </p>
          </div>
          <ul className="flex flex-col gap-0.5">
            {brands.map((brand) => (
              <BrandNode
                key={brand.id}
                brand={brand}
                collections={collectionsByBrand.get(brand.id) ?? []}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
