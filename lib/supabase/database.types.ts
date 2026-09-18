export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      albums: {
        Row: {
          id: string
          owner_user_id: string
          pet_id: string
          title: string
          status: string
          period_from: string | null
          period_to: string | null
          cover_photo_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          owner_user_id: string
          pet_id: string
          title?: string
          status?: string
          period_from?: string | null
          period_to?: string | null
          cover_photo_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          owner_user_id?: string
          pet_id?: string
          title?: string
          status?: string
          period_from?: string | null
          period_to?: string | null
          cover_photo_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "albums_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "albums_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "albums_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      album_photos: {
        Row: {
          album_id: string
          photo_id: string
          position: number
          selected_by: string
          created_at: string
        }
        Insert: {
          album_id: string
          photo_id: string
          position?: number
          selected_by?: string
          created_at?: string
        }
        Update: {
          album_id?: string
          photo_id?: string
          position?: number
          selected_by?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_photos_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_photos_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_pets: {
        Row: {
          photo_id: string
          pet_id: string
          source: string
          confidence: number | null
          confirmed_by_user: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          photo_id: string
          pet_id: string
          source: string
          confidence?: number | null
          confirmed_by_user?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          photo_id?: string
          pet_id?: string
          source?: string
          confidence?: number | null
          confirmed_by_user?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_pets_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_pets_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pets: {
        Row: {
          adoption_date: string | null
          avatar_url: string | null
          birthday: string
          breed: string | null
          created_at: string
          gender: string | null
          id: string
          name: string
          owner_user_id: string
          species: string
          updated_at: string
        }
        Insert: {
          adoption_date?: string | null
          avatar_url?: string | null
          birthday: string
          breed?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          name: string
          owner_user_id: string
          species: string
          updated_at?: string
        }
        Update: {
          adoption_date?: string | null
          avatar_url?: string | null
          birthday?: string
          breed?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          name?: string
          owner_user_id?: string
          species?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pets_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      photo_ai_analyses: {
        Row: {
          attempts: number
          activity: string | null
          analyzed_at: string | null
          contains_pet: boolean | null
          created_at: string
          description: string | null
          emotion: string | null
          error_code: string | null
          id: string
          model: string | null
          photo_id: string
          prompt_version: string | null
          scene: string | null
          status: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          attempts?: number
          activity?: string | null
          analyzed_at?: string | null
          contains_pet?: boolean | null
          created_at?: string
          description?: string | null
          emotion?: string | null
          error_code?: string | null
          id?: string
          model?: string | null
          photo_id: string
          prompt_version?: string | null
          scene?: string | null
          status: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          attempts?: number
          activity?: string | null
          analyzed_at?: string | null
          contains_pet?: boolean | null
          created_at?: string
          description?: string | null
          emotion?: string | null
          error_code?: string | null
          id?: string
          model?: string | null
          photo_id?: string
          prompt_version?: string | null
          scene?: string | null
          status?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_ai_analyses_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: true
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          caption: string | null
          content_hash: string | null
          content_hash_backfilled_at: string | null
          created_at: string
          favorite: boolean
          id: string
          pet_id: string
          storage_path: string
          thumbnail_path: string | null
          timeline_at: string
          taken_at: string | null
          updated_at: string
          uploader_user_id: string
        }
        Insert: {
          caption?: string | null
          content_hash?: string | null
          content_hash_backfilled_at?: string | null
          created_at?: string
          favorite?: boolean
          id?: string
          pet_id: string
          storage_path: string
          thumbnail_path?: string | null
          timeline_at?: never
          taken_at?: string | null
          updated_at?: string
          uploader_user_id: string
        }
        Update: {
          caption?: string | null
          content_hash?: string | null
          content_hash_backfilled_at?: string | null
          created_at?: string
          favorite?: boolean
          id?: string
          pet_id?: string
          storage_path?: string
          thumbnail_path?: string | null
          timeline_at?: never
          taken_at?: string | null
          updated_at?: string
          uploader_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "photos_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photos_uploader_user_id_fkey"
            columns: ["uploader_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_pet_memories_page: {
        Args: { p_pet_id: string; p_limit?: number; p_cursor_at?: string; p_cursor_id?: string; p_favorite_only?: boolean }
        Returns: {
          id: string; pet_id: string; storage_path: string; thumbnail_path: string | null;
          taken_at: string | null; created_at: string; caption: string | null;
          favorite: boolean; timeline_at: string
        }[]
      }
      get_photo_pets: {
        Args: { p_photo_id: string }
        Returns: { pet_id: string; pet_name: string; source: string; confidence: number | null; confirmed_by_user: boolean }[]
      }
      add_photo_pet: { Args: { p_photo_id: string; p_pet_id: string }; Returns: undefined }
      remove_photo_pet: { Args: { p_photo_id: string; p_pet_id: string }; Returns: undefined }
      require_photo_pet_management: { Args: { p_photo_id: string; p_pet_id: string }; Returns: string }
      normalize_search_word: { Args: { p_value: string; p_kind?: string }; Returns: string }
      photo_search_words: { Args: { p_tags: string[]; p_activity: string; p_scene: string; p_emotion: string }; Returns: { kind: string; value: string }[] }
      get_search_facets: { Args: { p_pet_id?: string }; Returns: Json }
      search_photos_page: {
        Args: { p_pet_id?: string; p_query?: string; p_kind?: string; p_value?: string; p_favorite_only?: boolean; p_from?: string; p_to?: string; p_limit?: number; p_cursor_at?: string; p_cursor_id?: string }
        Returns: Json
      }
      is_owned_pet: { Args: { pet_id_text: string }; Returns: boolean }
      reorder_album_photos: {
        Args: { p_album_id: string; p_positions: Json }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
