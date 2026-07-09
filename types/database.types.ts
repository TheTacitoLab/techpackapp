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
          layer_colours: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id: string;
          layer_colours?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          owner_id?: string;
          layer_colours?: Json;
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
          preferences: Json;
          created_at: string;
        };
        Insert: {
          id: string;
          workspace_id: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          preferences?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          preferences?: Json;
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
          parent_id: string | null;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          brand_id: string;
          season_id?: string | null;
          parent_id?: string | null;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          brand_id?: string;
          season_id?: string | null;
          parent_id?: string | null;
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
          season_id: string | null;
          designer_name: string | null;
          designer_email: string | null;
          factory_name: string | null;
          factory_country: string | null;
          sample_due_date: string | null;
          delivery_date: string | null;
          wholesale_price: number | null;
          retail_price: number | null;
          status: Database["public"]["Enums"]["product_status"];
          share_token: string;
          hero_asset_id: string | null;
          version_major: number;
          version_minor: number;
          is_template: boolean;
          created_at: string;
          updated_at: string;
          archived_at: string | null;
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
          season_id?: string | null;
          designer_name?: string | null;
          designer_email?: string | null;
          factory_name?: string | null;
          factory_country?: string | null;
          sample_due_date?: string | null;
          delivery_date?: string | null;
          wholesale_price?: number | null;
          retail_price?: number | null;
          status?: Database["public"]["Enums"]["product_status"];
          share_token?: string;
          hero_asset_id?: string | null;
          version_major?: number;
          version_minor?: number;
          is_template?: boolean;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
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
          season_id?: string | null;
          designer_name?: string | null;
          designer_email?: string | null;
          factory_name?: string | null;
          factory_country?: string | null;
          sample_due_date?: string | null;
          delivery_date?: string | null;
          wholesale_price?: number | null;
          retail_price?: number | null;
          status?: Database["public"]["Enums"]["product_status"];
          share_token?: string;
          hero_asset_id?: string | null;
          version_major?: number;
          version_minor?: number;
          is_template?: boolean;
          created_at?: string;
          updated_at?: string;
          archived_at?: string | null;
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
          export_to_pdf: boolean;
        };
        Insert: {
          id?: string;
          key: string;
          label: string;
          icon: string;
          default_sort_order?: number;
          is_default?: boolean;
          export_to_pdf?: boolean;
        };
        Update: {
          id?: string;
          key?: string;
          label?: string;
          icon?: string;
          default_sort_order?: number;
          is_default?: boolean;
          export_to_pdf?: boolean;
        };
        Relationships: [];
      };
      product_sections: {
        Row: {
          id: string;
          product_id: string;
          section_key: string;
          status: Database["public"]["Enums"]["section_status"];
          completed_manually: boolean;
          sort_order: number;
          is_enabled: boolean;
          data: Json;
        };
        Insert: {
          id?: string;
          product_id: string;
          section_key: string;
          status?: Database["public"]["Enums"]["section_status"];
          completed_manually?: boolean;
          sort_order?: number;
          is_enabled?: boolean;
          data?: Json;
        };
        Update: {
          id?: string;
          product_id?: string;
          section_key?: string;
          status?: Database["public"]["Enums"]["section_status"];
          completed_manually?: boolean;
          sort_order?: number;
          is_enabled?: boolean;
          data?: Json;
        };
        Relationships: [];
      };
      labels: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          color: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          color: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          color?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      product_labels: {
        Row: {
          id: string;
          product_id: string;
          label_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          label_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          label_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      collection_labels: {
        Row: {
          id: string;
          collection_id: string;
          label_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          collection_id: string;
          label_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          collection_id?: string;
          label_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      platform_admins: {
        Row: {
          user_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          created_at?: string;
        };
        Update: {
          user_id?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      library_items: {
        Row: {
          id: string;
          category: Database["public"]["Enums"]["library_category"];
          source: Database["public"]["Enums"]["library_source"];
          workspace_id: string | null;
          name: string;
          description: string | null;
          properties: Json;
          image_url: string | null;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category: Database["public"]["Enums"]["library_category"];
          source: Database["public"]["Enums"]["library_source"];
          workspace_id?: string | null;
          name: string;
          description?: string | null;
          properties?: Json;
          image_url?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category?: Database["public"]["Enums"]["library_category"];
          source?: Database["public"]["Enums"]["library_source"];
          workspace_id?: string | null;
          name?: string;
          description?: string | null;
          properties?: Json;
          image_url?: string | null;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      workspace_library_toggles: {
        Row: {
          id: string;
          workspace_id: string;
          library_item_id: string;
          hidden: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          library_item_id: string;
          hidden?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          library_item_id?: string;
          hidden?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      product_assets: {
        Row: {
          id: string;
          product_id: string;
          workspace_id: string;
          name: string;
          file_path: string;
          file_url: string;
          width: number | null;
          height: number | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          workspace_id: string;
          name: string;
          file_path: string;
          file_url: string;
          width?: number | null;
          height?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          workspace_id?: string;
          name?: string;
          file_path?: string;
          file_url?: string;
          width?: number | null;
          height?: number | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      canvas_pages: {
        Row: {
          id: string;
          product_id: string;
          workspace_id: string;
          template: Database["public"]["Enums"]["canvas_template"];
          label: string | null;
          notes: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          workspace_id: string;
          template: Database["public"]["Enums"]["canvas_template"];
          label?: string | null;
          notes?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          workspace_id?: string;
          template?: Database["public"]["Enums"]["canvas_template"];
          label?: string | null;
          notes?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      canvas_slots: {
        Row: {
          id: string;
          page_id: string;
          slot_index: number;
          asset_id: string | null;
          name: string | null;
          crop_x: number;
          crop_y: number;
          zoom: number;
          fit_mode: string;
          lock_width: number | null;
          lock_height: number | null;
          is_locked: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          page_id: string;
          slot_index: number;
          asset_id?: string | null;
          name?: string | null;
          crop_x?: number;
          crop_y?: number;
          zoom?: number;
          fit_mode?: string;
          lock_width?: number | null;
          lock_height?: number | null;
          is_locked?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          page_id?: string;
          slot_index?: number;
          asset_id?: string | null;
          name?: string | null;
          crop_x?: number;
          crop_y?: number;
          zoom?: number;
          fit_mode?: string;
          lock_width?: number | null;
          lock_height?: number | null;
          is_locked?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      canvas_colourways: {
        Row: {
          id: string;
          product_id: string;
          workspace_id: string;
          name: string;
          sequence_number: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          workspace_id: string;
          name: string;
          sequence_number: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          workspace_id?: string;
          name?: string;
          sequence_number?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      canvas_annotations: {
        Row: {
          id: string;
          slot_id: string;
          workspace_id: string;
          layer_type: Database["public"]["Enums"]["canvas_layer_type"];
          reference_code: string;
          x: number;
          y: number;
          pin_type: string;
          end_x: number | null;
          end_y: number | null;
          label_offset_x: number | null;
          label_offset_y: number | null;
          colourway_id: string | null;
          data: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slot_id: string;
          workspace_id: string;
          layer_type: Database["public"]["Enums"]["canvas_layer_type"];
          reference_code: string;
          x: number;
          y: number;
          pin_type?: string;
          end_x?: number | null;
          end_y?: number | null;
          label_offset_x?: number | null;
          label_offset_y?: number | null;
          colourway_id?: string | null;
          data?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slot_id?: string;
          workspace_id?: string;
          layer_type?: Database["public"]["Enums"]["canvas_layer_type"];
          reference_code?: string;
          x?: number;
          y?: number;
          pin_type?: string;
          end_x?: number | null;
          end_y?: number | null;
          label_offset_x?: number | null;
          label_offset_y?: number | null;
          colourway_id?: string | null;
          data?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      spec_templates: {
        Row: {
          id: string;
          source: Database["public"]["Enums"]["library_source"];
          workspace_id: string | null;
          name: string;
          category: Database["public"]["Enums"]["spec_template_category"];
          description: string | null;
          is_active: boolean;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source: Database["public"]["Enums"]["library_source"];
          workspace_id?: string | null;
          name: string;
          category: Database["public"]["Enums"]["spec_template_category"];
          description?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source?: Database["public"]["Enums"]["library_source"];
          workspace_id?: string | null;
          name?: string;
          category?: Database["public"]["Enums"]["spec_template_category"];
          description?: string | null;
          is_active?: boolean;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      spec_template_poms: {
        Row: {
          id: string;
          template_id: string;
          code: string;
          name: string;
          how_to_measure: string | null;
          grade_category: Database["public"]["Enums"]["spec_grade_category"];
          sub_kind: Database["public"]["Enums"]["spec_pom_sub_kind"] | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          template_id: string;
          code: string;
          name: string;
          how_to_measure?: string | null;
          grade_category: Database["public"]["Enums"]["spec_grade_category"];
          sub_kind?: Database["public"]["Enums"]["spec_pom_sub_kind"] | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          template_id?: string;
          code?: string;
          name?: string;
          how_to_measure?: string | null;
          grade_category?: Database["public"]["Enums"]["spec_grade_category"];
          sub_kind?: Database["public"]["Enums"]["spec_pom_sub_kind"] | null;
          sort_order?: number;
          created_at?: string;
        };
        Relationships: [];
      };
      grading_profiles: {
        Row: {
          id: string;
          source: Database["public"]["Enums"]["library_source"];
          workspace_id: string | null;
          name: string;
          description: string | null;
          size_run_labels: string[];
          break_size_label: string | null;
          base_increments: Json;
          extended_increments: Json | null;
          tolerances_knit: Json;
          tolerances_woven: Json;
          is_active: boolean;
          sort_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          source: Database["public"]["Enums"]["library_source"];
          workspace_id?: string | null;
          name: string;
          description?: string | null;
          size_run_labels?: string[];
          break_size_label?: string | null;
          base_increments?: Json;
          extended_increments?: Json | null;
          tolerances_knit?: Json;
          tolerances_woven?: Json;
          is_active?: boolean;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          source?: Database["public"]["Enums"]["library_source"];
          workspace_id?: string | null;
          name?: string;
          description?: string | null;
          size_run_labels?: string[];
          break_size_label?: string | null;
          base_increments?: Json;
          extended_increments?: Json | null;
          tolerances_knit?: Json;
          tolerances_woven?: Json;
          is_active?: boolean;
          sort_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_spec_sheets: {
        Row: {
          id: string;
          product_id: string;
          workspace_id: string;
          template_id: string | null;
          template_name: string | null;
          name: string | null;
          mode: Database["public"]["Enums"]["spec_sheet_mode"];
          demographic: Database["public"]["Enums"]["spec_demographic"];
          sizing_system: Database["public"]["Enums"]["spec_sizing_system"];
          size_run: string[];
          sample_size_label: string | null;
          sample_sizes: string[];
          grading_profile_id: string | null;
          fabric_type: Database["public"]["Enums"]["spec_fabric_type"];
          unit: string;
          is_complete: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          workspace_id: string;
          template_id?: string | null;
          template_name?: string | null;
          name?: string | null;
          mode?: Database["public"]["Enums"]["spec_sheet_mode"];
          demographic?: Database["public"]["Enums"]["spec_demographic"];
          sizing_system?: Database["public"]["Enums"]["spec_sizing_system"];
          size_run?: string[];
          sample_size_label?: string | null;
          sample_sizes?: string[];
          grading_profile_id?: string | null;
          fabric_type?: Database["public"]["Enums"]["spec_fabric_type"];
          unit?: string;
          is_complete?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          workspace_id?: string;
          template_id?: string | null;
          template_name?: string | null;
          name?: string | null;
          mode?: Database["public"]["Enums"]["spec_sheet_mode"];
          demographic?: Database["public"]["Enums"]["spec_demographic"];
          sizing_system?: Database["public"]["Enums"]["spec_sizing_system"];
          size_run?: string[];
          sample_size_label?: string | null;
          sample_sizes?: string[];
          grading_profile_id?: string | null;
          fabric_type?: Database["public"]["Enums"]["spec_fabric_type"];
          unit?: string;
          is_complete?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_spec_rows: {
        Row: {
          id: string;
          sheet_id: string;
          workspace_id: string;
          code: string;
          name: string;
          how_to_measure: string | null;
          grade_category: Database["public"]["Enums"]["spec_grade_category"];
          sub_kind: Database["public"]["Enums"]["spec_pom_sub_kind"] | null;
          tolerance_override: number | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sheet_id: string;
          workspace_id: string;
          code: string;
          name: string;
          how_to_measure?: string | null;
          grade_category: Database["public"]["Enums"]["spec_grade_category"];
          sub_kind?: Database["public"]["Enums"]["spec_pom_sub_kind"] | null;
          tolerance_override?: number | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sheet_id?: string;
          workspace_id?: string;
          code?: string;
          name?: string;
          how_to_measure?: string | null;
          grade_category?: Database["public"]["Enums"]["spec_grade_category"];
          sub_kind?: Database["public"]["Enums"]["spec_pom_sub_kind"] | null;
          tolerance_override?: number | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_spec_values: {
        Row: {
          id: string;
          sheet_id: string;
          row_id: string;
          workspace_id: string;
          size_label: string;
          value: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sheet_id: string;
          row_id: string;
          workspace_id: string;
          size_label: string;
          value: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sheet_id?: string;
          row_id?: string;
          workspace_id?: string;
          size_label?: string;
          value?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      product_change_log: {
        Row: {
          id: string;
          product_id: string;
          workspace_id: string;
          version: string;
          area: string;
          description: string;
          data: Json;
          actor_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          workspace_id: string;
          version: string;
          area: string;
          description: string;
          data?: Json;
          actor_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          workspace_id?: string;
          version?: string;
          area?: string;
          description?: string;
          data?: Json;
          actor_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      workspace_colours: {
        Row: {
          id: string;
          workspace_id: string;
          name: string;
          hex: string;
          pantone: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          workspace_id: string;
          name: string;
          hex: string;
          pantone?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          workspace_id?: string;
          name?: string;
          hex?: string;
          pantone?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
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
      is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      update_layer_colours: {
        Args: { colours: Json };
        Returns: undefined;
      };
    };
    Enums: {
      user_role: "admin" | "designer" | "approver" | "viewer" | "factory";
      product_status:
        | "draft"
        | "in_review"
        | "sent_to_factory"
        | "sample_received"
        | "approved"
        | "in_production";
      section_status: "not_started" | "in_progress" | "complete";
      library_category:
        | "fabric"
        | "trim"
        | "fastener"
        | "elastic"
        | "stitch_type"
        | "thread"
        | "label_type"
        | "print_type"
        | "packaging"
        | "interlining";
      library_source: "global" | "workspace";
      canvas_template: "single" | "split" | "triple" | "quad";
      canvas_layer_type:
        | "fabric"
        | "trim"
        | "hardware"
        | "elastic"
        | "label_component"
        | "print"
        | "stitch"
        | "thread"
        | "packaging"
        | "measurement"
        | "construction_note"
        | "detail_callout"
        | "colourway"
        | "branding"
        | "label";
      spec_template_category:
        | "tops"
        | "bottoms"
        | "outerwear"
        | "performance"
        | "womenswear"
        | "accessories";
      spec_grade_category:
        | "primary_girth"
        | "secondary_girth"
        | "body_length"
        | "limb_length"
        | "small"
        | "fixed";
      spec_pom_sub_kind:
        | "shoulder"
        | "neck"
        | "cuff_opening"
        | "rise"
        | "strap"
        | "inseam";
      spec_sheet_mode: "auto" | "manual";
      spec_fabric_type: "knit" | "woven";
      spec_demographic: "youth" | "mens" | "womens" | "custom";
      spec_sizing_system: "alpha" | "numeric";
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
