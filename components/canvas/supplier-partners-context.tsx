"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { PartnerOption } from "@/types";

/**
 * The workspace's supplier/factory partners, made available to the Fabrics &
 * Trim pin editor's supplier picker without prop-drilling through the ~14
 * intermediate canvas components `libraryItems` passes through. Same rationale
 * as the app's other canvas contexts (pins, user-preferences): a leaf editor
 * needs workspace-wide data the tree above it doesn't care about.
 *
 * Read-only in P1 — new partners are created in Settings → Partners, not
 * inline from a pin — so this is a plain value provider with no mutation
 * surface (unlike the colour library, which supports inline "save to library").
 */
const SupplierPartnersContext = createContext<PartnerOption[]>([]);

export function SupplierPartnersProvider({
  partners,
  children,
}: {
  partners: PartnerOption[];
  children: ReactNode;
}) {
  return (
    <SupplierPartnersContext.Provider value={partners}>
      {children}
    </SupplierPartnersContext.Provider>
  );
}

/** The supplier/factory partners in scope; `[]` when no provider is mounted. */
export function useSupplierPartners(): PartnerOption[] {
  return useContext(SupplierPartnersContext);
}
