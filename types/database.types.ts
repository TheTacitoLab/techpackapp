/**
 * Hand-written to match the SQL migrations in `supabase/migrations/`. Shaped
 * exactly like the output of `supabase gen types typescript` so it can be
 * regenerated and dropped in once a live/local project is connected:
 *
 *   supabase gen types typescript --project-id <id> --schema public \
 *     > types/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          workspace_id: string;
          full_name: string | null;
          role: Database["public"]["Enums"]["user_role"];
          created_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          created_at?: string;
        };
        Relationships: [];
      };
      brands: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          logo_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          logo_url?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          logo_url?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      seasons: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          year: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          year: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          year?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      collections: {
        Row: {
          id: string;
          workspace_id: string;
          brand_id: string;
          season_id: string | null;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          brand_id: string;
          season_id?: string | null;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          brand_id?: string;
          season_id?: string | null;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          workspace_id: string;
          brand_id: string | null;
          collection_id: string | null;
          name: string;
          style_number: string | null;
          category: string | null;
          gender: string | null;
          size_range: string | null;
          status: Database["public"]["Enums"]["product_status"];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          brand_id?: string | null;
          collection_id?: string | null;
          name: string;
          style_number?: string | null;
          category?: string | null;
          gender?: string | null;
          size_range?: string | null;
          status?: Database["public"]["Enums"]["product_status"];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          brand_id?: string | null;
          collection_id?: string | null;
          name?: string;
          style_number?: string | null;
          category?: string | null;
          gender?: string | null;
          size_range?: string | null;
          status?: Database["public"]["Enums"]["product_status"];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      section_templates: {
        Row: {
          id: string;
          key: string;
          label: string;
          icon: string;
          default_sort_order: number;
          is_default: boolean;
        };
        Insert: {
          id?: string;
          key: string;
          label: string;
          icon: string;
          default_sort_order?: number;
          is_default?: boolean;
        };
        Update: {
          id?: string;
          key?: string;
          label?: string;
          icon?: string;
          default_sort_order?: number;
          is_default?: boolean;
        };
        Relationships: [];
      };
      product_sections: {
        Row: {
          id: string;
          product_id: string;
          section_key: string;
          status: Database["public"]["Enums"]["section_status"];
          sort_order: number;
          is_enabled: boolean;
          data: Json;
        };
        Insert: {
          id?: string;
          product_id: string;
          section_key: string;
          status?: Database["public"]["Enums"]["section_status"];
          sort_order?: number;
          is_enabled?: boolean;
          data?: Json;
        };
        Update: {
          id?: string;
          product_id?: string;
          section_key?: string;
          status?: Database["public"]["Enums"]["section_status"];
          sort_order?: number;
          is_enabled?: boolean;
          data?: Json;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      auth_workspace_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
    };
    Enums: {
      user_role: "owner" | "editor" | "viewer" | "factory";
      product_status:
        | "draft"
        | "in_review"
        | "sent_to_factory"
        | "sample_received"
        | "approved"
        | "in_production";
      section_status: "not_started" | "in_progress" | "complete";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
