"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/types";

/**
 * Client-side products fetch. In Phase 1 the dashboard loads data in a Server
 * Component; this hook is the pattern stub for future interactive client reads.
 */
export function useProducts(workspaceId: string) {
  return useQuery<Product[]>({
    queryKey: ["products", workspaceId],
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}
