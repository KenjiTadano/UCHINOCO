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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      album_analytics_events: {
        Row: {
          album_id: string
          created_at: string
          draft_version_id: string | null
          event_data: Json
          event_key: string | null
          event_type: string
          id: string
          user_id: string
        }
        Insert: {
          album_id: string
          created_at?: string
          draft_version_id?: string | null
          event_data?: Json
          event_key?: string | null
          event_type: string
          id?: string
          user_id: string
        }
        Update: {
          album_id?: string
          created_at?: string
          draft_version_id?: string | null
          event_data?: Json
          event_key?: string | null
          event_type?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_analytics_events_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_analytics_events_draft_version_id_fkey"
            columns: ["draft_version_id"]
            isOneToOne: false
            referencedRelation: "album_draft_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      album_draft_covers: {
        Row: {
          ai_color_id: string
          ai_photo_id: string | null
          ai_subtitle: string
          ai_template_id: string
          ai_title: string
          client_seq: number
          cover_type: string
          created_at: string
          draft_version_id: string
          id: string
          revision: number
          updated_at: string
          user_color_id: string | null
          user_photo_id: string | null
          user_subtitle: string | null
          user_template_id: string | null
          user_title: string | null
        }
        Insert: {
          ai_color_id?: string
          ai_photo_id?: string | null
          ai_subtitle?: string
          ai_template_id?: string
          ai_title?: string
          client_seq?: number
          cover_type?: string
          created_at?: string
          draft_version_id: string
          id?: string
          revision?: number
          updated_at?: string
          user_color_id?: string | null
          user_photo_id?: string | null
          user_subtitle?: string | null
          user_template_id?: string | null
          user_title?: string | null
        }
        Update: {
          ai_color_id?: string
          ai_photo_id?: string | null
          ai_subtitle?: string
          ai_template_id?: string
          ai_title?: string
          client_seq?: number
          cover_type?: string
          created_at?: string
          draft_version_id?: string
          id?: string
          revision?: number
          updated_at?: string
          user_color_id?: string | null
          user_photo_id?: string | null
          user_subtitle?: string | null
          user_template_id?: string | null
          user_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "album_draft_covers_ai_photo_id_fkey"
            columns: ["ai_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_draft_covers_draft_version_id_fkey"
            columns: ["draft_version_id"]
            isOneToOne: true
            referencedRelation: "album_draft_versions"
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
      album_draft_decorations: {
        Row: {
          ai_decoration_id: string | null
          ai_scale_preset: string
          client_seq: number
          created_at: string
          draft_spread_id: string
          id: string
          override_mode: string
          position: number
          revision: number
          slot_id: string
          updated_at: string
          user_decoration_id: string | null
          user_scale_preset: string | null
        }
        Insert: {
          ai_decoration_id?: string | null
          ai_scale_preset?: string
          client_seq?: number
          created_at?: string
          draft_spread_id: string
          id?: string
          override_mode?: string
          position?: number
          revision?: number
          slot_id: string
          updated_at?: string
          user_decoration_id?: string | null
          user_scale_preset?: string | null
        }
        Update: {
          ai_decoration_id?: string | null
          ai_scale_preset?: string
          client_seq?: number
          created_at?: string
          draft_spread_id?: string
          id?: string
          override_mode?: string
          position?: number
          revision?: number
          slot_id?: string
          updated_at?: string
          user_decoration_id?: string | null
          user_scale_preset?: string | null
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
      album_draft_frames: {
        Row: {
          ai_crop_scale: number
          ai_crop_x: number
          ai_crop_y: number
          ai_photo_id: string
          client_seq: number
          created_at: string
          crop_quality: number | null
          draft_spread_id: string
          frame_id: string
          id: string
          match_tier: string | null
          position: number
          revision: number
          role: string
          updated_at: string
          user_crop_scale: number | null
          user_crop_x: number | null
          user_crop_y: number | null
          user_photo_id: string | null
          warnings: Json
        }
        Insert: {
          ai_crop_scale: number
          ai_crop_x: number
          ai_crop_y: number
          ai_photo_id: string
          client_seq?: number
          created_at?: string
          crop_quality?: number | null
          draft_spread_id: string
          frame_id: string
          id?: string
          match_tier?: string | null
          position: number
          revision?: number
          role: string
          updated_at?: string
          user_crop_scale?: number | null
          user_crop_x?: number | null
          user_crop_y?: number | null
          user_photo_id?: string | null
          warnings?: Json
        }
        Update: {
          ai_crop_scale?: number
          ai_crop_x?: number
          ai_crop_y?: number
          ai_photo_id?: string
          client_seq?: number
          created_at?: string
          crop_quality?: number | null
          draft_spread_id?: string
          frame_id?: string
          id?: string
          match_tier?: string | null
          position?: number
          revision?: number
          role?: string
          updated_at?: string
          user_crop_scale?: number | null
          user_crop_x?: number | null
          user_crop_y?: number | null
          user_photo_id?: string | null
          warnings?: Json
        }
        Relationships: [
          {
            foreignKeyName: "album_draft_frames_ai_photo_id_fkey"
            columns: ["ai_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_draft_frames_draft_spread_id_fkey"
            columns: ["draft_spread_id"]
            isOneToOne: false
            referencedRelation: "album_draft_spreads"
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
      album_draft_page_elements: {
        Row: {
          client_seq: number
          created_at: string
          draft_spread_id: string
          element_data: Json
          element_type: string
          id: string
          is_deleted: boolean
          revision: number
          updated_at: string
        }
        Insert: {
          client_seq?: number
          created_at?: string
          draft_spread_id: string
          element_data: Json
          element_type: string
          id: string
          is_deleted?: boolean
          revision?: number
          updated_at?: string
        }
        Update: {
          client_seq?: number
          created_at?: string
          draft_spread_id?: string
          element_data?: Json
          element_type?: string
          id?: string
          is_deleted?: boolean
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_draft_page_elements_draft_spread_id_fkey"
            columns: ["draft_spread_id"]
            isOneToOne: false
            referencedRelation: "album_draft_spreads"
            referencedColumns: ["id"]
          },
        ]
      }
      album_draft_spread_backgrounds: {
        Row: {
          background_id: string | null
          client_seq: number
          created_at: string
          draft_spread_id: string
          id: string
          page_side: string
          revision: number
          updated_at: string
        }
        Insert: {
          background_id?: string | null
          client_seq?: number
          created_at?: string
          draft_spread_id: string
          id?: string
          page_side: string
          revision?: number
          updated_at?: string
        }
        Update: {
          background_id?: string | null
          client_seq?: number
          created_at?: string
          draft_spread_id?: string
          id?: string
          page_side?: string
          revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_draft_spread_backgrounds_draft_spread_id_fkey"
            columns: ["draft_spread_id"]
            isOneToOne: false
            referencedRelation: "album_draft_spreads"
            referencedColumns: ["id"]
          },
        ]
      }
      album_draft_spreads: {
        Row: {
          ai_layout_id: string
          client_seq: number
          coherence: number
          created_at: string
          draft_version_id: string
          id: string
          importance: number
          position: number
          recommended_density: string
          revision: number
          story_spread_id: string
          story_type: string
          updated_at: string
          user_layout_id: string | null
          warnings: Json
        }
        Insert: {
          ai_layout_id: string
          client_seq?: number
          coherence: number
          created_at?: string
          draft_version_id: string
          id?: string
          importance: number
          position: number
          recommended_density: string
          revision?: number
          story_spread_id: string
          story_type: string
          updated_at?: string
          user_layout_id?: string | null
          warnings?: Json
        }
        Update: {
          ai_layout_id?: string
          client_seq?: number
          coherence?: number
          created_at?: string
          draft_version_id?: string
          id?: string
          importance?: number
          position?: number
          recommended_density?: string
          revision?: number
          story_spread_id?: string
          story_type?: string
          updated_at?: string
          user_layout_id?: string | null
          warnings?: Json
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
      album_draft_text_elements: {
        Row: {
          ai_style_id: string
          ai_text: string | null
          client_seq: number
          created_at: string
          draft_spread_id: string
          id: string
          kind: string
          override_mode: string
          position: number
          revision: number
          slot_id: string
          updated_at: string
          user_style_id: string | null
          user_text: string | null
        }
        Insert: {
          ai_style_id?: string
          ai_text?: string | null
          client_seq?: number
          created_at?: string
          draft_spread_id: string
          id?: string
          kind: string
          override_mode?: string
          position?: number
          revision?: number
          slot_id: string
          updated_at?: string
          user_style_id?: string | null
          user_text?: string | null
        }
        Update: {
          ai_style_id?: string
          ai_text?: string | null
          client_seq?: number
          created_at?: string
          draft_spread_id?: string
          id?: string
          kind?: string
          override_mode?: string
          position?: number
          revision?: number
          slot_id?: string
          updated_at?: string
          user_style_id?: string | null
          user_text?: string | null
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
      album_draft_versions: {
        Row: {
          album_id: string
          created_at: string
          generation_metadata: Json
          generation_version: string
          id: string
          is_active: boolean
          revision: number
          status: string
          updated_at: string
        }
        Insert: {
          album_id: string
          created_at?: string
          generation_metadata?: Json
          generation_version: string
          id?: string
          is_active?: boolean
          revision?: number
          status?: string
          updated_at?: string
        }
        Update: {
          album_id?: string
          created_at?: string
          generation_metadata?: Json
          generation_version?: string
          id?: string
          is_active?: boolean
          revision?: number
          status?: string
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
      album_pets: {
        Row: {
          album_id: string
          created_at: string
          pet_id: string
        }
        Insert: {
          album_id: string
          created_at?: string
          pet_id: string
        }
        Update: {
          album_id?: string
          created_at?: string
          pet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "album_pets_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_pets_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      album_photos: {
        Row: {
          album_id: string
          created_at: string
          photo_id: string
          position: number
          selected_by: string
        }
        Insert: {
          album_id: string
          created_at?: string
          photo_id: string
          position?: number
          selected_by?: string
        }
        Update: {
          album_id?: string
          created_at?: string
          photo_id?: string
          position?: number
          selected_by?: string
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
      album_print_snapshots: {
        Row: {
          album_id: string
          content_hash: string | null
          created_at: string
          draft_version_id: string
          finalized_at: string | null
          fingerprint: string
          id: string
          pdf_path: string | null
          revision_digest: string
          schema_version: string
          snapshot: Json
          source_revision: number
        }
        Insert: {
          album_id: string
          content_hash?: string | null
          created_at?: string
          draft_version_id: string
          finalized_at?: string | null
          fingerprint: string
          id?: string
          pdf_path?: string | null
          revision_digest: string
          schema_version: string
          snapshot: Json
          source_revision: number
        }
        Update: {
          album_id?: string
          content_hash?: string | null
          created_at?: string
          draft_version_id?: string
          finalized_at?: string | null
          fingerprint?: string
          id?: string
          pdf_path?: string | null
          revision_digest?: string
          schema_version?: string
          snapshot?: Json
          source_revision?: number
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
      album_text_suggestions: {
        Row: {
          analysis_version: string
          created_at: string
          draft_spread_id: string
          id: string
          input_fingerprint: string
          kind: string
          suggestions: Json
        }
        Insert: {
          analysis_version: string
          created_at?: string
          draft_spread_id: string
          id?: string
          input_fingerprint: string
          kind: string
          suggestions: Json
        }
        Update: {
          analysis_version?: string
          created_at?: string
          draft_spread_id?: string
          id?: string
          input_fingerprint?: string
          kind?: string
          suggestions?: Json
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
      albums: {
        Row: {
          cover_photo_id: string | null
          created_at: string
          id: string
          owner_user_id: string
          period_from: string | null
          period_to: string | null
          pet_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          cover_photo_id?: string | null
          created_at?: string
          id?: string
          owner_user_id: string
          period_from?: string | null
          period_to?: string | null
          pet_id: string
          status?: string
          title?: string
          updated_at?: string
        }
        Update: {
          cover_photo_id?: string | null
          created_at?: string
          id?: string
          owner_user_id?: string
          period_from?: string | null
          period_to?: string | null
          pet_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "albums_cover_photo_id_fkey"
            columns: ["cover_photo_id"]
            isOneToOne: false
            referencedRelation: "photos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "albums_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      order_photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          order_id: string
          original_path: string
          photo_id: string | null
          position: number
          taken_at: string | null
          thumbnail_path: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          order_id: string
          original_path: string
          photo_id?: string | null
          position: number
          taken_at?: string | null
          thumbnail_path?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          order_id?: string
          original_path?: string
          photo_id?: string | null
          position?: number
          taken_at?: string | null
          thumbnail_path?: string | null
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
      orders: {
        Row: {
          album_id: string
          album_title_snapshot: string | null
          cancelled_at: string | null
          cover_original_path_snapshot: string | null
          cover_photo_id_snapshot: string | null
          created_at: string
          draft_version_id: string | null
          id: string
          owner_user_id: string
          pages: number
          paid_at: string | null
          pet_id: string
          print_fingerprint: string | null
          print_snapshot_id: string | null
          product_cover_type: string
          product_cover_type_label: string
          product_id: string
          product_name: string
          product_size: string
          shipping_address1: string
          shipping_address2: string | null
          shipping_city: string
          shipping_fee: number
          shipping_first_name: string
          shipping_last_name: string
          shipping_option_id: string
          shipping_option_name: string
          shipping_phone: string
          shipping_postal_code: string
          shipping_prefecture: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_payment_intent_id: string | null
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          album_id: string
          album_title_snapshot?: string | null
          cancelled_at?: string | null
          cover_original_path_snapshot?: string | null
          cover_photo_id_snapshot?: string | null
          created_at?: string
          draft_version_id?: string | null
          id?: string
          owner_user_id: string
          pages: number
          paid_at?: string | null
          pet_id: string
          print_fingerprint?: string | null
          print_snapshot_id?: string | null
          product_cover_type: string
          product_cover_type_label: string
          product_id: string
          product_name: string
          product_size: string
          shipping_address1: string
          shipping_address2?: string | null
          shipping_city: string
          shipping_fee: number
          shipping_first_name: string
          shipping_last_name: string
          shipping_option_id: string
          shipping_option_name: string
          shipping_phone: string
          shipping_postal_code: string
          shipping_prefecture: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal: number
          total: number
          updated_at?: string
        }
        Update: {
          album_id?: string
          album_title_snapshot?: string | null
          cancelled_at?: string | null
          cover_original_path_snapshot?: string | null
          cover_photo_id_snapshot?: string | null
          created_at?: string
          draft_version_id?: string | null
          id?: string
          owner_user_id?: string
          pages?: number
          paid_at?: string | null
          pet_id?: string
          print_fingerprint?: string | null
          print_snapshot_id?: string | null
          product_cover_type?: string
          product_cover_type_label?: string
          product_id?: string
          product_name?: string
          product_size?: string
          shipping_address1?: string
          shipping_address2?: string | null
          shipping_city?: string
          shipping_fee?: number
          shipping_first_name?: string
          shipping_last_name?: string
          shipping_option_id?: string
          shipping_option_name?: string
          shipping_phone?: string
          shipping_postal_code?: string
          shipping_prefecture?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_payment_intent_id?: string | null
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_draft_version_id_fkey"
            columns: ["draft_version_id"]
            isOneToOne: false
            referencedRelation: "album_draft_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_print_snapshot_id_fkey"
            columns: ["print_snapshot_id"]
            isOneToOne: false
            referencedRelation: "album_print_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_family_activity_reads: {
        Row: {
          last_seen_at: string
          pet_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          pet_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          pet_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_family_activity_reads_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_family_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          expires_at: string
          id: string
          invitee_email: string
          inviter_user_id: string
          pet_id: string
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          expires_at: string
          id?: string
          invitee_email: string
          inviter_user_id: string
          pet_id: string
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          invitee_email?: string
          inviter_user_id?: string
          pet_id?: string
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_family_invites_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
        ]
      }
      pet_family_members: {
        Row: {
          created_at: string
          invited_by: string | null
          pet_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          invited_by?: string | null
          pet_id: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          invited_by?: string | null
          pet_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pet_family_members_pet_id_fkey"
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
          activity: string | null
          analyzed_at: string | null
          attempts: number
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
          activity?: string | null
          analyzed_at?: string | null
          attempts?: number
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
          activity?: string | null
          analyzed_at?: string | null
          attempts?: number
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
      photo_pets: {
        Row: {
          confidence: number | null
          confirmed_by_user: boolean
          created_at: string
          pet_id: string
          photo_id: string
          source: string
          updated_at: string
        }
        Insert: {
          confidence?: number | null
          confirmed_by_user?: boolean
          created_at?: string
          pet_id: string
          photo_id: string
          source: string
          updated_at?: string
        }
        Update: {
          confidence?: number | null
          confirmed_by_user?: boolean
          created_at?: string
          pet_id?: string
          photo_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "photo_pets_pet_id_fkey"
            columns: ["pet_id"]
            isOneToOne: false
            referencedRelation: "pets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "photo_pets_photo_id_fkey"
            columns: ["photo_id"]
            isOneToOne: false
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
          taken_at: string | null
          thumbnail_path: string | null
          timeline_at: string | null
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
          taken_at?: string | null
          thumbnail_path?: string | null
          timeline_at?: string | null
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
          taken_at?: string | null
          thumbnail_path?: string | null
          timeline_at?: string | null
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
      print_jobs: {
        Row: {
          content_file_path: string | null
          cover_file_path: string | null
          created_at: string
          error_code: string | null
          failed_at: string | null
          id: string
          idempotency_key: string
          order_id: string
          preparation_started_at: string | null
          prepared_at: string | null
          provider: string
          provider_order_id: string | null
          shipped_at: string | null
          status: string
          submitted_at: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          content_file_path?: string | null
          cover_file_path?: string | null
          created_at?: string
          error_code?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key: string
          order_id: string
          preparation_started_at?: string | null
          prepared_at?: string | null
          provider: string
          provider_order_id?: string | null
          shipped_at?: string | null
          status?: string
          submitted_at?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          content_file_path?: string | null
          cover_file_path?: string | null
          created_at?: string
          error_code?: string | null
          failed_at?: string | null
          id?: string
          idempotency_key?: string
          order_id?: string
          preparation_started_at?: string | null
          prepared_at?: string | null
          provider?: string
          provider_order_id?: string | null
          shipped_at?: string | null
          status?: string
          submitted_at?: string | null
          tracking_number?: string | null
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
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          last_stripe_event_id: string | null
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_event_created_at: number
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          last_stripe_event_id?: string | null
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_event_created_at?: number
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          last_stripe_event_id?: string | null
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_event_created_at?: number
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_pet_family_invite: {
        Args: { p_token_hash: string }
        Returns: string
      }
      add_photo_pet: {
        Args: { p_pet_id: string; p_photo_id: string }
        Returns: undefined
      }
      add_suggested_album_photos: {
        Args: {
          p_album_id: string
          p_expected_draft_version_id: string
          p_expected_fingerprint: string
          p_route_pet_id: string
          p_selected_photo_ids: string[]
        }
        Returns: Json
      }
      apply_added_photo_placement: {
        Args: {
          p_album_id: string
          p_anchor_spread_id: string
          p_crop_scale: number
          p_crop_x: number
          p_crop_y: number
          p_expected_draft_version_id: string
          p_expected_fingerprint: string
          p_frame_id: string
          p_layout_id: string
          p_mode: string
          p_photo_id: string
          p_route_pet_id: string
        }
        Returns: Json
      }
      apply_draft_cover_override: {
        Args: {
          p_client_seq: number
          p_cover_id: string
          p_expected_revision: number
          p_field: string
          p_photo_id: string
          p_reset: boolean
          p_text: string
        }
        Returns: Json
      }
      apply_draft_decoration_override: {
        Args: {
          p_client_seq: number
          p_expected_revision: number
          p_mode: string
          p_slot_id: string
          p_spread_id: string
          p_user_decoration_id: string
          p_user_scale_preset: string
        }
        Returns: Json
      }
      apply_draft_frame_override: {
        Args: {
          p_clear_crop: boolean
          p_clear_photo: boolean
          p_client_seq: number
          p_crop_scale: number
          p_crop_x: number
          p_crop_y: number
          p_expected_revision: number
          p_frame_id: string
          p_user_photo_id: string
        }
        Returns: Json
      }
      apply_draft_page_element_override: {
        Args: {
          p_client_seq: number
          p_element_data: Json
          p_element_id: string
          p_element_type: string
          p_expected_revision: number
          p_is_deleted?: boolean
          p_spread_id: string
        }
        Returns: Json
      }
      apply_draft_spread_background_override: {
        Args: {
          p_background_id: string
          p_client_seq: number
          p_expected_revision: number
          p_page_side: string
          p_spread_id: string
        }
        Returns: Json
      }
      apply_draft_spread_layout: {
        Args: {
          p_client_seq: number
          p_expected_revision: number
          p_reset: boolean
          p_spread_id: string
          p_user_layout_id: string
        }
        Returns: Json
      }
      apply_draft_text_override: {
        Args: {
          p_client_seq: number
          p_expected_revision: number
          p_kind: string
          p_mode: string
          p_slot_id: string
          p_spread_id: string
          p_user_style_id: string
          p_user_text: string
        }
        Returns: Json
      }
      assert_album_mutable: { Args: { p_album_id: string }; Returns: undefined }
      assert_editable_album_draft_spread: {
        Args: { p_spread_id: string }
        Returns: string
      }
      attach_album_print_pdf: {
        Args: {
          p_content_hash: string
          p_pdf_path: string
          p_snapshot_id: string
        }
        Returns: Json
      }
      can_access_album: { Args: { p_album_id: string }; Returns: boolean }
      can_access_pet: { Args: { p_pet_id: string }; Returns: boolean }
      can_contribute_to_pet: { Args: { p_pet_id: string }; Returns: boolean }
      can_create_pet_for_user: { Args: { p_user_id: string }; Returns: boolean }
      create_pet_family_invite: {
        Args: { p_email: string; p_pet_id: string; p_token_hash: string }
        Returns: {
          expires_at: string
          invite_id: string
        }[]
      }
      dismiss_suggested_album_photos: {
        Args: {
          p_album_id: string
          p_expected_draft_version_id: string
          p_expected_fingerprint: string
          p_photo_count: number
          p_route_pet_id: string
        }
        Returns: boolean
      }
      finalize_album_print_snapshot: {
        Args: { p_snapshot_id: string }
        Returns: Json
      }
      get_album_analytics_summary: { Args: never; Returns: Json }
      get_dashboard_photos: {
        Args: { p_favorite_only?: boolean; p_limit?: number }
        Returns: {
          created_at: string
          favorite: boolean
          id: string
          pet_id: string
          storage_path: string
          taken_at: string
          thumbnail_path: string
          timeline_at: string
        }[]
      }
      get_family_new_photo_activity: {
        Args: { p_pet_ids?: string[] }
        Returns: {
          latest_at: string
          pet_id: string
          photo_count: number
        }[]
      }
      get_pet_memories_page: {
        Args: {
          p_cursor_at?: string
          p_cursor_id?: string
          p_favorite_only?: boolean
          p_limit?: number
          p_pet_id: string
        }
        Returns: {
          caption: string
          created_at: string
          favorite: boolean
          id: string
          pet_id: string
          storage_path: string
          taken_at: string
          thumbnail_path: string
          timeline_at: string
        }[]
      }
      get_pet_photos_page: {
        Args: {
          p_cursor_at?: string
          p_cursor_id?: string
          p_favorite_only?: boolean
          p_limit?: number
          p_pet_id: string
        }
        Returns: {
          caption: string
          created_at: string
          favorite: boolean
          id: string
          pet_id: string
          storage_path: string
          taken_at: string
          thumbnail_path: string
          timeline_at: string
        }[]
      }
      get_photo_pets: {
        Args: { p_photo_id: string }
        Returns: {
          confidence: number
          confirmed_by_user: boolean
          pet_id: string
          pet_name: string
          source: string
        }[]
      }
      get_search_facets: { Args: { p_pet_id?: string }; Returns: Json }
      is_accessible_pet: { Args: { pet_id_text: string }; Returns: boolean }
      is_owned_pet: { Args: { pet_id_text: string }; Returns: boolean }
      is_pet_owner: { Args: { p_pet_id: string }; Returns: boolean }
      mark_order_paid:
        | {
            Args: {
              p_order_id: string
              p_payment_intent_id: string
              p_stripe_session_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_order_id: string
              p_payment_intent_id: string
              p_provider?: string
              p_stripe_session_id: string
            }
            Returns: undefined
          }
      mark_pet_family_activity_seen: {
        Args: { p_pet_id: string }
        Returns: undefined
      }
      materialize_passive_album_candidate: {
        Args: {
          p_album_id: string
          p_candidate_fingerprint: string
          p_candidate_photo_ids: string[]
          p_cover_photo_id: string
          p_cover_subtitle: string
          p_cover_title: string
          p_payload: Json
          p_period_from: string
          p_period_to: string
          p_pet_id: string
          p_selected_photo_ids: string[]
          p_title: string
        }
        Returns: Json
      }
      materialize_passive_annual_candidate: {
        Args: {
          p_album_id: string
          p_candidate_fingerprint: string
          p_cover_photo_id: string
          p_cover_subtitle: string
          p_cover_title: string
          p_payload: Json
          p_period_from: string
          p_period_to: string
          p_pet_id: string
          p_selected_photo_ids: string[]
          p_source_photo_ids: string[]
          p_title: string
          p_year: number
        }
        Returns: Json
      }
      normalize_search_word: {
        Args: { p_kind?: string; p_value: string }
        Returns: string
      }
      pet_owner_has_plus: { Args: { p_pet_id: string }; Returns: boolean }
      photo_search_words: {
        Args: {
          p_activity: string
          p_emotion: string
          p_scene: string
          p_tags: string[]
        }
        Returns: {
          kind: string
          value: string
        }[]
      }
      redo_added_photo_placement: {
        Args: {
          p_album_id: string
          p_parent_version_id: string
          p_placement_version_id: string
          p_route_pet_id: string
        }
        Returns: boolean
      }
      remove_pet_family_member: {
        Args: { p_pet_id: string; p_user_id: string }
        Returns: boolean
      }
      remove_photo_pet: {
        Args: { p_pet_id: string; p_photo_id: string }
        Returns: undefined
      }
      reorder_album_photos: {
        Args: { p_album_id: string; p_positions: Json }
        Returns: undefined
      }
      require_photo_pet_management: {
        Args: { p_pet_id: string; p_photo_id: string }
        Returns: string
      }
      revoke_pet_family_invite: {
        Args: { p_invite_id: string }
        Returns: boolean
      }
      save_album_draft_version: {
        Args: { p_album_id: string; p_payload: Json }
        Returns: string
      }
      save_album_print_snapshot: {
        Args: {
          p_album_id: string
          p_draft_version_id: string
          p_fingerprint: string
          p_revision_digest: string
          p_schema_version: string
          p_snapshot: Json
          p_source_revision: number
        }
        Returns: Json
      }
      save_album_text_suggestion: {
        Args: {
          p_analysis_version: string
          p_input_fingerprint: string
          p_kind: string
          p_spread_id: string
          p_suggestions: Json
        }
        Returns: Json
      }
      save_photo_analysis_result: {
        Args: {
          p_analysis_type: string
          p_analysis_version: string
          p_photo_id: string
          p_result: Json
          p_result_status: string
          p_source_fingerprint: string
        }
        Returns: Json
      }
      search_pet_photos_page: {
        Args: {
          p_cursor_at?: string
          p_cursor_id?: string
          p_favorite_only?: boolean
          p_from?: string
          p_limit?: number
          p_pet_id: string
          p_query?: string
          p_to?: string
        }
        Returns: {
          caption: string
          created_at: string
          description: string
          favorite: boolean
          id: string
          pet_id: string
          storage_path: string
          tags: string[]
          taken_at: string
          thumbnail_path: string
          timeline_at: string
        }[]
      }
      search_photos_page: {
        Args: {
          p_cursor_at?: string
          p_cursor_id?: string
          p_favorite_only?: boolean
          p_from?: string
          p_kind?: string
          p_limit?: number
          p_pet_id?: string
          p_query?: string
          p_to?: string
          p_value?: string
        }
        Returns: Json
      }
      seed_draft_text_ai: {
        Args: {
          p_ai_text: string
          p_kind: string
          p_slot_id: string
          p_spread_id: string
        }
        Returns: Json
      }
      sync_user_subscription_from_stripe: {
        Args: {
          p_cancel_at_period_end: boolean
          p_current_period_end: string
          p_customer_id: string
          p_event_created: number
          p_event_id: string
          p_status: string
          p_subscription_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      undo_added_photo_placement: {
        Args: {
          p_album_id: string
          p_parent_version_id: string
          p_placement_version_id: string
          p_route_pet_id: string
        }
        Returns: boolean
      }
      user_has_plus: { Args: { p_user_id: string }; Returns: boolean }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
