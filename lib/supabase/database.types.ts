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
      orders: {
        Row: {
          id: string
          owner_user_id: string
          album_id: string
          pet_id: string
          status: "pending" | "paid" | "cancelled" | "failed"
          product_id: string
          product_name: string
          product_size: string
          product_cover_type: string
          product_cover_type_label: string
          pages: number
          subtotal: number
          shipping_fee: number
          total: number
          shipping_option_id: string
          shipping_option_name: string
          shipping_last_name: string
          shipping_first_name: string
          shipping_postal_code: string
          shipping_prefecture: string
          shipping_city: string
          shipping_address1: string
          shipping_address2: string | null
          shipping_phone: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          created_at: string
          updated_at: string
          paid_at: string | null
          cancelled_at: string | null
          album_title_snapshot: string | null
          cover_photo_id_snapshot: string | null
          cover_original_path_snapshot: string | null
          draft_version_id: string | null
          print_snapshot_id: string | null
          print_fingerprint: string | null
        }
        Insert: {
          id?: string
          owner_user_id: string
          album_id: string
          pet_id: string
          status?: "pending" | "paid" | "cancelled" | "failed"
          product_id: string
          product_name: string
          product_size: string
          product_cover_type: string
          product_cover_type_label: string
          pages: number
          subtotal: number
          shipping_fee: number
          total: number
          shipping_option_id: string
          shipping_option_name: string
          shipping_last_name: string
          shipping_first_name: string
          shipping_postal_code: string
          shipping_prefecture: string
          shipping_city: string
          shipping_address1: string
          shipping_address2?: string | null
          shipping_phone: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          created_at?: string
          updated_at?: string
          paid_at?: string | null
          cancelled_at?: string | null
          album_title_snapshot?: string | null
          cover_photo_id_snapshot?: string | null
          cover_original_path_snapshot?: string | null
          draft_version_id?: string | null
          print_snapshot_id?: string | null
          print_fingerprint?: string | null
        }
        Update: {
          id?: string
          owner_user_id?: string
          album_id?: string
          pet_id?: string
          status?: "pending" | "paid" | "cancelled" | "failed"
          product_id?: string
          product_name?: string
          product_size?: string
          product_cover_type?: string
          product_cover_type_label?: string
          pages?: number
          subtotal?: number
          shipping_fee?: number
          total?: number
          shipping_option_id?: string
          shipping_option_name?: string
          shipping_last_name?: string
          shipping_first_name?: string
          shipping_postal_code?: string
          shipping_prefecture?: string
          shipping_city?: string
          shipping_address1?: string
          shipping_address2?: string | null
          shipping_phone?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          created_at?: string
          updated_at?: string
          paid_at?: string | null
          cancelled_at?: string | null
          album_title_snapshot?: string | null
          cover_photo_id_snapshot?: string | null
          cover_original_path_snapshot?: string | null
          draft_version_id?: string | null
          print_snapshot_id?: string | null
          print_fingerprint?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_owner_user_id_fkey"
            columns: ["owner_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      order_photos: {
        Row: {
          id: string
          order_id: string
          photo_id: string | null
          position: number
          original_path: string
          thumbnail_path: string | null
          taken_at: string | null
          caption: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          photo_id?: string | null
          position: number
          original_path: string
          thumbnail_path?: string | null
          taken_at?: string | null
          caption?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          photo_id?: string | null
          position?: number
          original_path?: string
          thumbnail_path?: string | null
          taken_at?: string | null
          caption?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_photos_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_photos_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      print_jobs: {
        Row: {
          id: string
          order_id: string
          provider: string
          idempotency_key: string
          provider_order_id: string | null
          status: "queued" | "submitted" | "processing" | "shipped" | "failed" | "cancelled"
          submitted_at: string | null
          shipped_at: string | null
          failed_at: string | null
          error_code: string | null
          tracking_number: string | null
          cover_file_path: string | null
          content_file_path: string | null
          prepared_at: string | null
          preparation_started_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          order_id: string
          provider: string
          idempotency_key: string
          provider_order_id?: string | null
          status?: "queued" | "submitted" | "processing" | "shipped" | "failed" | "cancelled"
          submitted_at?: string | null
          shipped_at?: string | null
          failed_at?: string | null
          error_code?: string | null
          tracking_number?: string | null
          cover_file_path?: string | null
          content_file_path?: string | null
          prepared_at?: string | null
          preparation_started_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          order_id?: string
          provider?: string
          idempotency_key?: string
          provider_order_id?: string | null
          status?: "queued" | "submitted" | "processing" | "shipped" | "failed" | "cancelled"
          submitted_at?: string | null
          shipped_at?: string | null
          failed_at?: string | null
          error_code?: string | null
          tracking_number?: string | null
          cover_file_path?: string | null
          content_file_path?: string | null
          prepared_at?: string | null
          preparation_started_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
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
      album_draft_versions: {
        Row: {
          id: string
          album_id: string
          generation_version: string
          status: string
          is_active: boolean
          revision: number
          generation_metadata: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          album_id: string
          generation_version: string
          status?: string
          is_active?: boolean
          revision?: number
          generation_metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          album_id?: string
          generation_version?: string
          status?: string
          is_active?: boolean
          revision?: number
          generation_metadata?: Json
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_draft_versions_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
        ]
      }
      album_draft_spreads: {
        Row: {
          id: string
          draft_version_id: string
          story_spread_id: string
          position: number
          story_type: string
          recommended_density: string
          importance: number
          coherence: number
          ai_layout_id: string
          user_layout_id: string | null
          warnings: Json
          revision: number
          client_seq: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          draft_version_id: string
          story_spread_id: string
          position: number
          story_type: string
          recommended_density: string
          importance: number
          coherence: number
          ai_layout_id: string
          user_layout_id?: string | null
          warnings?: Json
          revision?: number
          client_seq?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          draft_version_id?: string
          story_spread_id?: string
          position?: number
          story_type?: string
          recommended_density?: string
          importance?: number
          coherence?: number
          ai_layout_id?: string
          user_layout_id?: string | null
          warnings?: Json
          revision?: number
          client_seq?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_draft_spreads_draft_version_id_fkey"
            columns: ["draft_version_id"]
            isOneToOne: false
            referencedRelation: "album_draft_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      album_draft_frames: {
        Row: {
          id: string
          draft_spread_id: string
          frame_id: string
          role: string
          position: number
          ai_photo_id: string
          ai_crop_x: number
          ai_crop_y: number
          ai_crop_scale: number
          user_photo_id: string | null
          user_crop_x: number | null
          user_crop_y: number | null
          user_crop_scale: number | null
          match_tier: string | null
          crop_quality: number | null
          warnings: Json
          revision: number
          client_seq: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          draft_spread_id: string
          frame_id: string
          role: string
          position: number
          ai_photo_id: string
          ai_crop_x: number
          ai_crop_y: number
          ai_crop_scale: number
          user_photo_id?: string | null
          user_crop_x?: number | null
          user_crop_y?: number | null
          user_crop_scale?: number | null
          match_tier?: string | null
          crop_quality?: number | null
          warnings?: Json
          revision?: number
          client_seq?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          draft_spread_id?: string
          frame_id?: string
          role?: string
          position?: number
          ai_photo_id?: string
          ai_crop_x?: number
          ai_crop_y?: number
          ai_crop_scale?: number
          user_photo_id?: string | null
          user_crop_x?: number | null
          user_crop_y?: number | null
          user_crop_scale?: number | null
          match_tier?: string | null
          crop_quality?: number | null
          warnings?: Json
          revision?: number
          client_seq?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_draft_frames_draft_spread_id_fkey"
            columns: ["draft_spread_id"]
            isOneToOne: false
            referencedRelation: "album_draft_spreads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_draft_frames_ai_photo_id_fkey"
            columns: ["ai_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_draft_frames_user_photo_id_fkey"
            columns: ["user_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      album_draft_covers: {
        Row: {
          id: string
          draft_version_id: string
          cover_type: string
          ai_photo_id: string | null
          user_photo_id: string | null
          ai_title: string
          user_title: string | null
          ai_subtitle: string
          user_subtitle: string | null
          ai_template_id: string
          user_template_id: string | null
          ai_color_id: string
          user_color_id: string | null
          revision: number
          client_seq: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          draft_version_id: string
          cover_type?: string
          ai_photo_id?: string | null
          user_photo_id?: string | null
          ai_title?: string
          user_title?: string | null
          ai_subtitle?: string
          user_subtitle?: string | null
          ai_template_id?: string
          user_template_id?: string | null
          ai_color_id?: string
          user_color_id?: string | null
          revision?: number
          client_seq?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          draft_version_id?: string
          cover_type?: string
          ai_photo_id?: string | null
          user_photo_id?: string | null
          ai_title?: string
          user_title?: string | null
          ai_subtitle?: string
          user_subtitle?: string | null
          ai_template_id?: string
          user_template_id?: string | null
          ai_color_id?: string
          user_color_id?: string | null
          revision?: number
          client_seq?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_draft_covers_draft_version_id_fkey"
            columns: ["draft_version_id"]
            isOneToOne: true
            referencedRelation: "album_draft_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_draft_covers_ai_photo_id_fkey"
            columns: ["ai_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_draft_covers_user_photo_id_fkey"
            columns: ["user_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
        ]
      }
      album_draft_text_elements: {
        Row: {
          id: string
          draft_spread_id: string
          slot_id: string
          kind: string
          ai_text: string | null
          user_text: string | null
          ai_style_id: string
          user_style_id: string | null
          override_mode: string
          position: number
          revision: number
          client_seq: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          draft_spread_id: string
          slot_id: string
          kind: string
          ai_text?: string | null
          user_text?: string | null
          ai_style_id?: string
          user_style_id?: string | null
          override_mode?: string
          position?: number
          revision?: number
          client_seq?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          draft_spread_id?: string
          slot_id?: string
          kind?: string
          ai_text?: string | null
          user_text?: string | null
          ai_style_id?: string
          user_style_id?: string | null
          override_mode?: string
          position?: number
          revision?: number
          client_seq?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_draft_text_elements_draft_spread_id_fkey"
            columns: ["draft_spread_id"]
            isOneToOne: false
            referencedRelation: "album_draft_spreads"
            referencedColumns: ["id"]
          },
        ]
      }
      album_draft_decorations: {
        Row: {
          id: string
          draft_spread_id: string
          slot_id: string
          ai_decoration_id: string | null
          user_decoration_id: string | null
          ai_scale_preset: string
          user_scale_preset: string | null
          override_mode: string
          position: number
          revision: number
          client_seq: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          draft_spread_id: string
          slot_id: string
          ai_decoration_id?: string | null
          user_decoration_id?: string | null
          ai_scale_preset?: string
          user_scale_preset?: string | null
          override_mode?: string
          position?: number
          revision?: number
          client_seq?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          draft_spread_id?: string
          slot_id?: string
          ai_decoration_id?: string | null
          user_decoration_id?: string | null
          ai_scale_preset?: string
          user_scale_preset?: string | null
          override_mode?: string
          position?: number
          revision?: number
          client_seq?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_draft_decorations_draft_spread_id_fkey"
            columns: ["draft_spread_id"]
            isOneToOne: false
            referencedRelation: "album_draft_spreads"
            referencedColumns: ["id"]
          },
        ]
      }
      album_text_suggestions: {
        Row: {
          id: string
          draft_spread_id: string
          kind: string
          analysis_version: string
          input_fingerprint: string
          suggestions: Json
          created_at: string
        }
        Insert: {
          id?: string
          draft_spread_id: string
          kind: string
          analysis_version: string
          input_fingerprint: string
          suggestions: Json
          created_at?: string
        }
        Update: {
          id?: string
          draft_spread_id?: string
          kind?: string
          analysis_version?: string
          input_fingerprint?: string
          suggestions?: Json
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_text_suggestions_draft_spread_id_fkey"
            columns: ["draft_spread_id"]
            isOneToOne: false
            referencedRelation: "album_draft_spreads"
            referencedColumns: ["id"]
          },
        ]
      }
      album_print_snapshots: {
        Row: {
          id: string
          album_id: string
          draft_version_id: string
          schema_version: string
          source_revision: number
          fingerprint: string
          revision_digest: string
          snapshot: Json
          pdf_path: string | null
          content_hash: string | null
          finalized_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          album_id: string
          draft_version_id: string
          schema_version: string
          source_revision: number
          fingerprint: string
          revision_digest: string
          snapshot: Json
          pdf_path?: string | null
          content_hash?: string | null
          finalized_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          album_id?: string
          draft_version_id?: string
          schema_version?: string
          source_revision?: number
          fingerprint?: string
          revision_digest?: string
          snapshot?: Json
          pdf_path?: string | null
          content_hash?: string | null
          finalized_at?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_print_snapshots_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_print_snapshots_draft_version_id_fkey"
            columns: ["draft_version_id"]
            isOneToOne: false
            referencedRelation: "album_draft_versions"
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
      photo_analysis_results: {
        Row: {
          analysis_type: string
          analysis_version: string
          created_at: string
          id: string
          photo_id: string
          result: Json
          result_status: string
          source_fingerprint: string
          updated_at: string
        }
        Insert: {
          analysis_type: string
          analysis_version: string
          created_at?: string
          id?: string
          photo_id: string
          result: Json
          result_status: string
          source_fingerprint: string
          updated_at?: string
        }
        Update: {
          analysis_type?: string
          analysis_version?: string
          created_at?: string
          id?: string
          photo_id?: string
          result?: Json
          result_status?: string
          source_fingerprint?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_analysis_results_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
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
      mark_order_paid: {
        Args: {
          p_order_id: string
          p_stripe_session_id: string
          p_payment_intent_id: string | null
          p_provider?: string
        }
        Returns: undefined
      }
      save_album_draft_version: {
        Args: { p_album_id: string; p_payload: Json }
        Returns: string
      }
      apply_draft_spread_layout: {
        Args: {
          p_spread_id: string
          p_expected_revision: number
          p_client_seq: number
          p_user_layout_id: string | null
          p_reset: boolean
        }
        Returns: Json
      }
      apply_draft_cover_override: {
        Args: {
          p_cover_id: string
          p_expected_revision: number
          p_client_seq: number
          p_field: string
          p_reset: boolean
          p_text: string | null
          p_photo_id: string | null
        }
        Returns: Json
      }
      apply_draft_text_override: {
        Args: {
          p_spread_id: string
          p_slot_id: string
          p_kind: string
          p_expected_revision: number
          p_client_seq: number
          p_mode: string
          p_user_text: string | null
          p_user_style_id: string | null
        }
        Returns: Json
      }
      apply_draft_decoration_override: {
        Args: {
          p_spread_id: string
          p_slot_id: string
          p_expected_revision: number
          p_client_seq: number
          p_mode: string
          p_user_decoration_id: string | null
          p_user_scale_preset: string | null
        }
        Returns: Json
      }
      save_album_text_suggestion: {
        Args: {
          p_spread_id: string
          p_kind: string
          p_analysis_version: string
          p_input_fingerprint: string
          p_suggestions: Json
        }
        Returns: Json
      }
      seed_draft_text_ai: {
        Args: {
          p_spread_id: string
          p_slot_id: string
          p_kind: string
          p_ai_text: string
        }
        Returns: Json
      }
      save_album_print_snapshot: {
        Args: {
          p_album_id: string
          p_draft_version_id: string
          p_schema_version: string
          p_source_revision: number
          p_fingerprint: string
          p_revision_digest: string
          p_snapshot: Json
        }
        Returns: Json
      }
      finalize_album_print_snapshot: {
        Args: { p_snapshot_id: string }
        Returns: Json
      }
      attach_album_print_pdf: {
        Args: {
          p_snapshot_id: string
          p_pdf_path: string
          p_content_hash: string
        }
        Returns: Json
      }
      apply_draft_frame_override: {
        Args: {
          p_frame_id: string
          p_expected_revision: number
          p_client_seq: number
          p_user_photo_id: string | null
          p_clear_photo: boolean
          p_crop_x: number | null
          p_crop_y: number | null
          p_crop_scale: number | null
          p_clear_crop: boolean
        }
        Returns: Json
      }
      save_photo_analysis_result: {
        Args: {
          p_photo_id: string
          p_analysis_type: string
          p_analysis_version: string
          p_source_fingerprint: string
          p_result_status: string
          p_result: Json
        }
        Returns: Json
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
