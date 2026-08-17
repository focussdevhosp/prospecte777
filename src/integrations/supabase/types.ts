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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ab_assignments: {
        Row: {
          ab_test_id: string
          converted_at: string | null
          created_at: string
          id: string
          lead_id: string
          replied_at: string | null
          revenue_cents: number
          sent_at: string
          user_id: string
          variant: string
        }
        Insert: {
          ab_test_id: string
          converted_at?: string | null
          created_at?: string
          id?: string
          lead_id: string
          replied_at?: string | null
          revenue_cents?: number
          sent_at?: string
          user_id: string
          variant: string
        }
        Update: {
          ab_test_id?: string
          converted_at?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          replied_at?: string | null
          revenue_cents?: number
          sent_at?: string
          user_id?: string
          variant?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_assignments_ab_test_id_fkey"
            columns: ["ab_test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      ab_tests: {
        Row: {
          completed_at: string | null
          confidence: number | null
          created_at: string
          decision_metric: string | null
          decision_reason: string | null
          id: string
          min_sample_size: number
          name: string
          niche: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
          variant_a_content: string
          variant_a_conversions: number
          variant_a_name: string
          variant_a_responses: number
          variant_a_sent: number
          variant_a_template_id: string | null
          variant_b_content: string
          variant_b_conversions: number
          variant_b_name: string
          variant_b_responses: number
          variant_b_sent: number
          variant_b_template_id: string | null
          winner: string | null
        }
        Insert: {
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          decision_metric?: string | null
          decision_reason?: string | null
          id?: string
          min_sample_size?: number
          name: string
          niche?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
          variant_a_content: string
          variant_a_conversions?: number
          variant_a_name: string
          variant_a_responses?: number
          variant_a_sent?: number
          variant_a_template_id?: string | null
          variant_b_content: string
          variant_b_conversions?: number
          variant_b_name: string
          variant_b_responses?: number
          variant_b_sent?: number
          variant_b_template_id?: string | null
          winner?: string | null
        }
        Update: {
          completed_at?: string | null
          confidence?: number | null
          created_at?: string
          decision_metric?: string | null
          decision_reason?: string | null
          id?: string
          min_sample_size?: number
          name?: string
          niche?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          variant_a_content?: string
          variant_a_conversions?: number
          variant_a_name?: string
          variant_a_responses?: number
          variant_a_sent?: number
          variant_a_template_id?: string | null
          variant_b_content?: string
          variant_b_conversions?: number
          variant_b_name?: string
          variant_b_responses?: number
          variant_b_sent?: number
          variant_b_template_id?: string | null
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_tests_variant_a_template_id_fkey"
            columns: ["variant_a_template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ab_tests_variant_b_template_id_fkey"
            columns: ["variant_b_template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          activity_type: string
          created_at: string
          description: string
          id: string
          lead_id: string | null
          metadata: Json | null
          user_id: string
        }
        Insert: {
          activity_type: string
          created_at?: string
          description: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          user_id: string
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          user_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          user_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      agent_escalations: {
        Row: {
          context: string | null
          created_at: string
          escalation_reason: string
          id: string
          lead_id: string
          priority: string | null
          recommended_action: string | null
          resolution_notes: string | null
          resolved_at: string | null
          status: string | null
          user_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          escalation_reason: string
          id?: string
          lead_id: string
          priority?: string | null
          recommended_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string | null
          user_id: string
        }
        Update: {
          context?: string | null
          created_at?: string
          escalation_reason?: string
          id?: string
          lead_id?: string
          priority?: string | null
          recommended_action?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_escalations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_events: {
        Row: {
          agent: string
          created_at: string
          detail: Json | null
          event: string
          id: number
          lead_id: string | null
          level: string
          mission_id: string | null
          summary: string
          user_id: string
        }
        Insert: {
          agent: string
          created_at?: string
          detail?: Json | null
          event: string
          id?: number
          lead_id?: string | null
          level?: string
          mission_id?: string | null
          summary: string
          user_id: string
        }
        Update: {
          agent?: string
          created_at?: string
          detail?: Json | null
          event?: string
          id?: number
          lead_id?: string | null
          level?: string
          mission_id?: string | null
          summary?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_events_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          agent: string | null
          completion_tokens: number
          cost_usd: number
          created_at: string
          id: string
          latency_ms: number
          lead_id: string | null
          mission_id: string | null
          model: string
          prompt_tokens: number
          provider: string
          purpose: string
          user_id: string
        }
        Insert: {
          agent?: string | null
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          latency_ms?: number
          lead_id?: string | null
          mission_id?: string | null
          model: string
          prompt_tokens?: number
          provider: string
          purpose: string
          user_id: string
        }
        Update: {
          agent?: string | null
          completion_tokens?: number
          cost_usd?: number
          created_at?: string
          id?: string
          latency_ms?: number
          lead_id?: string | null
          mission_id?: string | null
          model?: string
          prompt_tokens?: number
          provider?: string
          purpose?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      antiban_config: {
        Row: {
          blacklist_keywords: string[] | null
          chip_health: string | null
          created_at: string
          daily_limit: number | null
          hourly_limit: number | null
          id: string
          last_health_check_at: string | null
          last_message_sent_at: string | null
          last_rest_at: string | null
          max_delay_seconds: number | null
          max_typing_seconds: number | null
          messages_before_rest: number | null
          messages_sent_hour: number | null
          messages_sent_today: number | null
          min_delay_seconds: number | null
          min_typing_seconds: number | null
          rest_duration_minutes: number | null
          rest_pause_enabled: boolean | null
          typing_enabled: boolean | null
          updated_at: string
          user_id: string
          warmup_daily_limit: number | null
          warmup_day: number | null
          warmup_enabled: boolean | null
          warmup_increment_percent: number | null
          warmup_start_date: string | null
        }
        Insert: {
          blacklist_keywords?: string[] | null
          chip_health?: string | null
          created_at?: string
          daily_limit?: number | null
          hourly_limit?: number | null
          id?: string
          last_health_check_at?: string | null
          last_message_sent_at?: string | null
          last_rest_at?: string | null
          max_delay_seconds?: number | null
          max_typing_seconds?: number | null
          messages_before_rest?: number | null
          messages_sent_hour?: number | null
          messages_sent_today?: number | null
          min_delay_seconds?: number | null
          min_typing_seconds?: number | null
          rest_duration_minutes?: number | null
          rest_pause_enabled?: boolean | null
          typing_enabled?: boolean | null
          updated_at?: string
          user_id: string
          warmup_daily_limit?: number | null
          warmup_day?: number | null
          warmup_enabled?: boolean | null
          warmup_increment_percent?: number | null
          warmup_start_date?: string | null
        }
        Update: {
          blacklist_keywords?: string[] | null
          chip_health?: string | null
          created_at?: string
          daily_limit?: number | null
          hourly_limit?: number | null
          id?: string
          last_health_check_at?: string | null
          last_message_sent_at?: string | null
          last_rest_at?: string | null
          max_delay_seconds?: number | null
          max_typing_seconds?: number | null
          messages_before_rest?: number | null
          messages_sent_hour?: number | null
          messages_sent_today?: number | null
          min_delay_seconds?: number | null
          min_typing_seconds?: number | null
          rest_duration_minutes?: number | null
          rest_pause_enabled?: boolean | null
          typing_enabled?: boolean | null
          updated_at?: string
          user_id?: string
          warmup_daily_limit?: number | null
          warmup_day?: number | null
          warmup_enabled?: boolean | null
          warmup_increment_percent?: number | null
          warmup_start_date?: string | null
        }
        Relationships: []
      }
      background_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          current_index: number | null
          error_message: string | null
          failed_items: number | null
          id: string
          job_type: string
          last_error_at: string | null
          last_heartbeat_at: string | null
          max_retries: number | null
          payload: Json
          priority: number
          processed_items: number | null
          result: Json | null
          retry_count: number | null
          scheduled_at: string | null
          sent_items: number
          skipped_items: number
          started_at: string | null
          status: string
          total_items: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_index?: number | null
          error_message?: string | null
          failed_items?: number | null
          id?: string
          job_type: string
          last_error_at?: string | null
          last_heartbeat_at?: string | null
          max_retries?: number | null
          payload?: Json
          priority?: number
          processed_items?: number | null
          result?: Json | null
          retry_count?: number | null
          scheduled_at?: string | null
          sent_items?: number
          skipped_items?: number
          started_at?: string | null
          status?: string
          total_items?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_index?: number | null
          error_message?: string | null
          failed_items?: number | null
          id?: string
          job_type?: string
          last_error_at?: string | null
          last_heartbeat_at?: string | null
          max_retries?: number | null
          payload?: Json
          priority?: number
          processed_items?: number | null
          result?: Json | null
          retry_count?: number | null
          scheduled_at?: string | null
          sent_items?: number
          skipped_items?: number
          started_at?: string | null
          status?: string
          total_items?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_by: string
          created_at: string
          id: string
          reason: string | null
          user_id: string
        }
        Insert: {
          blocked_by: string
          created_at?: string
          id?: string
          reason?: string | null
          user_id: string
        }
        Update: {
          blocked_by?: string
          created_at?: string
          id?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      brazil_cep_ranges: {
        Row: {
          cep_end: string
          cep_start: string
          city_name: string | null
          id: number
          region_name: string | null
          state_code: string
        }
        Insert: {
          cep_end: string
          cep_start: string
          city_name?: string | null
          id?: number
          region_name?: string | null
          state_code: string
        }
        Update: {
          cep_end?: string
          cep_start?: string
          city_name?: string | null
          id?: number
          region_name?: string | null
          state_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "brazil_cep_ranges_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "brazil_states"
            referencedColumns: ["code"]
          },
        ]
      }
      brazil_cities: {
        Row: {
          ibge_code: number | null
          id: number
          name: string
          state_code: string
        }
        Insert: {
          ibge_code?: number | null
          id?: number
          name: string
          state_code: string
        }
        Update: {
          ibge_code?: number | null
          id?: number
          name?: string
          state_code?: string
        }
        Relationships: [
          {
            foreignKeyName: "brazil_cities_state_code_fkey"
            columns: ["state_code"]
            isOneToOne: false
            referencedRelation: "brazil_states"
            referencedColumns: ["code"]
          },
        ]
      }
      brazil_states: {
        Row: {
          code: string
          id: number
          name: string
          region: string
        }
        Insert: {
          code: string
          id?: number
          name: string
          region: string
        }
        Update: {
          code?: string
          id?: number
          name?: string
          region?: string
        }
        Relationships: []
      }
      buying_signals: {
        Row: {
          context: string | null
          created_at: string
          id: string
          lead_id: string
          signal_strength: number | null
          signal_text: string | null
          signal_type: string
          user_id: string
        }
        Insert: {
          context?: string | null
          created_at?: string
          id?: string
          lead_id: string
          signal_strength?: number | null
          signal_text?: string | null
          signal_type: string
          user_id: string
        }
        Update: {
          context?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          signal_strength?: number | null
          signal_text?: string | null
          signal_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "buying_signals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          campaign_type: string
          completed_at: string | null
          created_at: string
          id: string
          leads_contacted: number | null
          leads_found: number | null
          leads_responded: number | null
          locations: string[] | null
          message_template: string | null
          name: string
          niches: string[] | null
          scheduled_at: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_type?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          leads_contacted?: number | null
          leads_found?: number | null
          leads_responded?: number | null
          locations?: string[] | null
          message_template?: string | null
          name: string
          niches?: string[] | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_type?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          leads_contacted?: number | null
          leads_found?: number | null
          leads_responded?: number | null
          locations?: string[] | null
          message_template?: string | null
          name?: string
          niches?: string[] | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          external_id: string | null
          id: string
          lead_id: string
          sender_type: string
          sent_at: string
          status: string | null
          whatsapp_message_id: string | null
        }
        Insert: {
          content: string
          created_at?: string
          external_id?: string | null
          id?: string
          lead_id: string
          sender_type: string
          sent_at?: string
          status?: string | null
          whatsapp_message_id?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          external_id?: string | null
          id?: string
          lead_id?: string
          sender_type?: string
          sent_at?: string
          status?: string | null
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      chip_health_logs: {
        Row: {
          connection_status: string | null
          created_at: string
          failed_messages_hour: number | null
          health_status: string
          id: string
          messages_sent_day: number | null
          messages_sent_hour: number | null
          recommendations: string[] | null
          risk_factors: Json | null
          user_id: string
        }
        Insert: {
          connection_status?: string | null
          created_at?: string
          failed_messages_hour?: number | null
          health_status: string
          id?: string
          messages_sent_day?: number | null
          messages_sent_hour?: number | null
          recommendations?: string[] | null
          risk_factors?: Json | null
          user_id: string
        }
        Update: {
          connection_status?: string | null
          created_at?: string
          failed_messages_hour?: number | null
          health_status?: string
          id?: string
          messages_sent_day?: number | null
          messages_sent_hour?: number | null
          recommendations?: string[] | null
          risk_factors?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      chip_usage: {
        Row: {
          failed_count: number
          instance_id: string
          last_sent_at: string | null
          sent_count: number
          usage_date: string
          user_id: string
        }
        Insert: {
          failed_count?: number
          instance_id: string
          last_sent_at?: string | null
          sent_count?: number
          usage_date?: string
          user_id: string
        }
        Update: {
          failed_count?: number
          instance_id?: string
          last_sent_at?: string | null
          sent_count?: number
          usage_date?: string
          user_id?: string
        }
        Relationships: []
      }
      cnpj_cache: {
        Row: {
          cnpj: string
          data: Json
          expires_at: string
          fetched_at: string
        }
        Insert: {
          cnpj: string
          data: Json
          expires_at?: string
          fetched_at?: string
        }
        Update: {
          cnpj?: string
          data?: Json
          expires_at?: string
          fetched_at?: string
        }
        Relationships: []
      }
      community_leads: {
        Row: {
          address: string | null
          business_name: string
          contributed_by: string | null
          created_at: string | null
          email: string | null
          google_maps_url: string | null
          id: string
          location: string
          location_normalized: string
          niche: string
          niche_normalized: string
          phone: string
          rating: number | null
          reviews_count: number | null
          source: string | null
          updated_at: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          business_name: string
          contributed_by?: string | null
          created_at?: string | null
          email?: string | null
          google_maps_url?: string | null
          id?: string
          location: string
          location_normalized: string
          niche: string
          niche_normalized: string
          phone: string
          rating?: number | null
          reviews_count?: number | null
          source?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          business_name?: string
          contributed_by?: string | null
          created_at?: string | null
          email?: string | null
          google_maps_url?: string | null
          id?: string
          location?: string
          location_normalized?: string
          niche?: string
          niche_normalized?: string
          phone?: string
          rating?: number | null
          reviews_count?: number | null
          source?: string | null
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      crm_integrations: {
        Row: {
          active: boolean
          config: Json
          created_at: string
          credential: string
          id: string
          last_error: string | null
          last_error_at: string | null
          last_ok_at: string | null
          provider: string
          pushed_count: number
          user_id: string
        }
        Insert: {
          active?: boolean
          config?: Json
          created_at?: string
          credential: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_ok_at?: string | null
          provider: string
          pushed_count?: number
          user_id: string
        }
        Update: {
          active?: boolean
          config?: Json
          created_at?: string
          credential?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_ok_at?: string | null
          provider?: string
          pushed_count?: number
          user_id?: string
        }
        Relationships: []
      }
      crm_push_log: {
        Row: {
          already_existed: boolean
          created_at: string
          external_id: string | null
          id: string
          lead_id: string
          message: string
          ok: boolean
          provider: string
          user_id: string
        }
        Insert: {
          already_existed?: boolean
          created_at?: string
          external_id?: string | null
          id?: string
          lead_id: string
          message: string
          ok: boolean
          provider: string
          user_id: string
        }
        Update: {
          already_existed?: boolean
          created_at?: string
          external_id?: string | null
          id?: string
          lead_id?: string
          message?: string
          ok?: boolean
          provider?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_push_log_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      data_requests: {
        Row: {
          created_at: string
          due_at: string
          id: string
          kind: string
          lead_id: string | null
          note: string | null
          requester: string
          resolved_at: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          due_at?: string
          id?: string
          kind: string
          lead_id?: string | null
          note?: string | null
          requester: string
          resolved_at?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          due_at?: string
          id?: string
          kind?: string
          lead_id?: string | null
          note?: string | null
          requester?: string
          resolved_at?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_requests_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_leads: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      follow_up_sequences: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          message_templates: Json | null
          name: string
          trigger_after_days: number[] | null
          trigger_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          message_templates?: Json | null
          name: string
          trigger_after_days?: number[] | null
          trigger_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          message_templates?: Json | null
          name?: string
          trigger_after_days?: number[] | null
          trigger_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      generated_proposals: {
        Row: {
          created_at: string
          deliverables: Json | null
          executive_summary: string | null
          id: string
          identified_needs: Json | null
          lead_id: string
          pricing_breakdown: Json | null
          proposal_title: string
          proposed_solution: string | null
          response_at: string | null
          sent_at: string | null
          service_id: string | null
          status: string | null
          terms_conditions: string | null
          timeline: string | null
          updated_at: string
          user_id: string
          viewed_at: string | null
        }
        Insert: {
          created_at?: string
          deliverables?: Json | null
          executive_summary?: string | null
          id?: string
          identified_needs?: Json | null
          lead_id: string
          pricing_breakdown?: Json | null
          proposal_title: string
          proposed_solution?: string | null
          response_at?: string | null
          sent_at?: string | null
          service_id?: string | null
          status?: string | null
          terms_conditions?: string | null
          timeline?: string | null
          updated_at?: string
          user_id: string
          viewed_at?: string | null
        }
        Update: {
          created_at?: string
          deliverables?: Json | null
          executive_summary?: string | null
          id?: string
          identified_needs?: Json | null
          lead_id?: string
          pricing_breakdown?: Json | null
          proposal_title?: string
          proposed_solution?: string | null
          response_at?: string | null
          sent_at?: string | null
          service_id?: string | null
          status?: string | null
          terms_conditions?: string | null
          timeline?: string | null
          updated_at?: string
          user_id?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_proposals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_proposals_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "service_intelligence"
            referencedColumns: ["id"]
          },
        ]
      }
      icp_profiles: {
        Row: {
          created_at: string
          description: string | null
          exclusions: string[]
          id: string
          is_default: boolean
          locations: string[]
          max_rating: number | null
          min_rating: number | null
          min_reviews: number | null
          name: string
          niches: string[]
          signals: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          exclusions?: string[]
          id?: string
          is_default?: boolean
          locations?: string[]
          max_rating?: number | null
          min_rating?: number | null
          min_reviews?: number | null
          name: string
          niches?: string[]
          signals?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          exclusions?: string[]
          id?: string
          is_default?: boolean
          locations?: string[]
          max_rating?: number | null
          min_rating?: number | null
          min_reviews?: number | null
          name?: string
          niches?: string[]
          signals?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      intelligent_followups: {
        Row: {
          created_at: string
          id: string
          lead_id: string
          message_sent: string | null
          message_template: string | null
          result: string | null
          scheduled_at: string
          sent_at: string | null
          status: string | null
          trigger_reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lead_id: string
          message_sent?: string | null
          message_template?: string | null
          result?: string | null
          scheduled_at: string
          sent_at?: string | null
          status?: string | null
          trigger_reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lead_id?: string
          message_sent?: string | null
          message_template?: string | null
          result?: string | null
          scheduled_at?: string
          sent_at?: string | null
          status?: string | null
          trigger_reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "intelligent_followups_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      job_logs: {
        Row: {
          created_at: string
          id: string
          job_id: string
          level: string
          message: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          level?: string
          message: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          level?: string
          message?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_logs_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "background_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignments: {
        Row: {
          assigned_by: string | null
          created_at: string
          id: string
          lead_id: string
          reason: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          lead_id: string
          reason: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_memory: {
        Row: {
          confidence: number | null
          created_at: string
          expires_at: string | null
          id: string
          key: string
          lead_id: string
          memory_type: string
          source: string | null
          updated_at: string
          user_id: string
          value: string
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          key: string
          lead_id: string
          memory_type?: string
          source?: string | null
          updated_at?: string
          user_id: string
          value: string
        }
        Update: {
          confidence?: number | null
          created_at?: string
          expires_at?: string | null
          id?: string
          key?: string
          lead_id?: string
          memory_type?: string
          source?: string | null
          updated_at?: string
          user_id?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_memory_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_notes: {
        Row: {
          content: string
          created_at: string
          id: string
          lead_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          lead_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          lead_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_qualification: {
        Row: {
          authority_confidence: number | null
          authority_details: string | null
          authority_status: string | null
          budget_confidence: number | null
          budget_details: string | null
          budget_status: string | null
          close_probability: number | null
          created_at: string
          deal_value_estimate: number | null
          id: string
          lead_id: string
          need_confidence: number | null
          need_details: string | null
          need_status: string | null
          predicted_close_date: string | null
          qualification_score: number | null
          timeline_confidence: number | null
          timeline_details: string | null
          timeline_status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          authority_confidence?: number | null
          authority_details?: string | null
          authority_status?: string | null
          budget_confidence?: number | null
          budget_details?: string | null
          budget_status?: string | null
          close_probability?: number | null
          created_at?: string
          deal_value_estimate?: number | null
          id?: string
          lead_id: string
          need_confidence?: number | null
          need_details?: string | null
          need_status?: string | null
          predicted_close_date?: string | null
          qualification_score?: number | null
          timeline_confidence?: number | null
          timeline_details?: string | null
          timeline_status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          authority_confidence?: number | null
          authority_details?: string | null
          authority_status?: string | null
          budget_confidence?: number | null
          budget_details?: string | null
          budget_status?: string | null
          close_probability?: number | null
          created_at?: string
          deal_value_estimate?: number | null
          id?: string
          lead_id?: string
          need_confidence?: number | null
          need_details?: string | null
          need_status?: string | null
          predicted_close_date?: string | null
          qualification_score?: number | null
          timeline_confidence?: number | null
          timeline_details?: string | null
          timeline_status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_qualification_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_signals: {
        Row: {
          created_at: string
          detected_at: string
          evidence: Json
          expires_at: string
          id: string
          lead_id: string
          strength: number
          summary: string
          type: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          detected_at?: string
          evidence?: Json
          expires_at: string
          id?: string
          lead_id: string
          strength?: number
          summary: string
          type: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          detected_at?: string
          evidence?: Json
          expires_at?: string
          id?: string
          lead_id?: string
          strength?: number
          summary?: string
          type?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_signals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          address: string | null
          agent_paused_at: string | null
          agent_paused_reason: string | null
          agent_replies_date: string | null
          agent_replies_today: number
          agent_status: string
          ai_memory_summary: string | null
          analyzed_needs: Json | null
          assigned_to: string | null
          best_contact_hour: number | null
          business_name: string
          company_description: string | null
          conversation_summary: string | null
          created_at: string
          data_collected_at: string | null
          data_origin: string | null
          deal_value: number | null
          email: string | null
          email_source: string | null
          employee_count: string | null
          enriched_at: string | null
          facebook_url: string | null
          first_contact_at: string | null
          follow_up_count: number | null
          founded_year: number | null
          google_maps_url: string | null
          hunter_email: string | null
          hunter_email_confidence: number | null
          id: string
          industry: string | null
          instagram_bio: string | null
          instagram_fetched_at: string | null
          instagram_url: string | null
          last_contact_at: string | null
          last_response_at: string | null
          last_scored_at: string | null
          lat: number | null
          lead_group: string | null
          lead_score: number | null
          legal_basis: string
          linkedin_url: string | null
          lng: number | null
          location: string | null
          message_sent: boolean | null
          next_follow_up_at: string | null
          niche: string | null
          notes: string | null
          pain_points: string[] | null
          phone: string
          photo_url: string | null
          quality_score: number | null
          rating: number | null
          reviews_count: number | null
          score_factors: Json | null
          service_opportunities: string[] | null
          signal_checked_at: string | null
          signal_snapshot: Json | null
          site_audit: Json | null
          site_audited_at: string | null
          source: string | null
          stage: string
          tags: string[] | null
          tasks: Json | null
          team_id: string | null
          temperature: string | null
          total_messages_exchanged: number | null
          twitter_url: string | null
          updated_at: string
          user_id: string
          website: string | null
        }
        Insert: {
          address?: string | null
          agent_paused_at?: string | null
          agent_paused_reason?: string | null
          agent_replies_date?: string | null
          agent_replies_today?: number
          agent_status?: string
          ai_memory_summary?: string | null
          analyzed_needs?: Json | null
          assigned_to?: string | null
          best_contact_hour?: number | null
          business_name: string
          company_description?: string | null
          conversation_summary?: string | null
          created_at?: string
          data_collected_at?: string | null
          data_origin?: string | null
          deal_value?: number | null
          email?: string | null
          email_source?: string | null
          employee_count?: string | null
          enriched_at?: string | null
          facebook_url?: string | null
          first_contact_at?: string | null
          follow_up_count?: number | null
          founded_year?: number | null
          google_maps_url?: string | null
          hunter_email?: string | null
          hunter_email_confidence?: number | null
          id?: string
          industry?: string | null
          instagram_bio?: string | null
          instagram_fetched_at?: string | null
          instagram_url?: string | null
          last_contact_at?: string | null
          last_response_at?: string | null
          last_scored_at?: string | null
          lat?: number | null
          lead_group?: string | null
          lead_score?: number | null
          legal_basis?: string
          linkedin_url?: string | null
          lng?: number | null
          location?: string | null
          message_sent?: boolean | null
          next_follow_up_at?: string | null
          niche?: string | null
          notes?: string | null
          pain_points?: string[] | null
          phone: string
          photo_url?: string | null
          quality_score?: number | null
          rating?: number | null
          reviews_count?: number | null
          score_factors?: Json | null
          service_opportunities?: string[] | null
          signal_checked_at?: string | null
          signal_snapshot?: Json | null
          site_audit?: Json | null
          site_audited_at?: string | null
          source?: string | null
          stage?: string
          tags?: string[] | null
          tasks?: Json | null
          team_id?: string | null
          temperature?: string | null
          total_messages_exchanged?: number | null
          twitter_url?: string | null
          updated_at?: string
          user_id: string
          website?: string | null
        }
        Update: {
          address?: string | null
          agent_paused_at?: string | null
          agent_paused_reason?: string | null
          agent_replies_date?: string | null
          agent_replies_today?: number
          agent_status?: string
          ai_memory_summary?: string | null
          analyzed_needs?: Json | null
          assigned_to?: string | null
          best_contact_hour?: number | null
          business_name?: string
          company_description?: string | null
          conversation_summary?: string | null
          created_at?: string
          data_collected_at?: string | null
          data_origin?: string | null
          deal_value?: number | null
          email?: string | null
          email_source?: string | null
          employee_count?: string | null
          enriched_at?: string | null
          facebook_url?: string | null
          first_contact_at?: string | null
          follow_up_count?: number | null
          founded_year?: number | null
          google_maps_url?: string | null
          hunter_email?: string | null
          hunter_email_confidence?: number | null
          id?: string
          industry?: string | null
          instagram_bio?: string | null
          instagram_fetched_at?: string | null
          instagram_url?: string | null
          last_contact_at?: string | null
          last_response_at?: string | null
          last_scored_at?: string | null
          lat?: number | null
          lead_group?: string | null
          lead_score?: number | null
          legal_basis?: string
          linkedin_url?: string | null
          lng?: number | null
          location?: string | null
          message_sent?: boolean | null
          next_follow_up_at?: string | null
          niche?: string | null
          notes?: string | null
          pain_points?: string[] | null
          phone?: string
          photo_url?: string | null
          quality_score?: number | null
          rating?: number | null
          reviews_count?: number | null
          score_factors?: Json | null
          service_opportunities?: string[] | null
          signal_checked_at?: string | null
          signal_snapshot?: Json | null
          site_audit?: Json | null
          site_audited_at?: string | null
          source?: string | null
          stage?: string
          tags?: string[] | null
          tasks?: Json | null
          team_id?: string | null
          temperature?: string | null
          total_messages_exchanged?: number | null
          twitter_url?: string | null
          updated_at?: string
          user_id?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      meetings: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          lead_id: string
          meeting_link: string | null
          notes: string | null
          scheduled_at: string
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id: string
          meeting_link?: string | null
          notes?: string | null
          scheduled_at: string
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          lead_id?: string
          meeting_link?: string | null
          notes?: string | null
          scheduled_at?: string
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          content: string
          created_at: string
          id: string
          is_default: boolean | null
          name: string
          niche: string
          response_rate: number | null
          updated_at: string
          usage_count: number | null
          user_id: string
          variables: string[] | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          name: string
          niche: string
          response_rate?: number | null
          updated_at?: string
          usage_count?: number | null
          user_id: string
          variables?: string[] | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_default?: boolean | null
          name?: string
          niche?: string
          response_rate?: number | null
          updated_at?: string
          usage_count?: number | null
          user_id?: string
          variables?: string[] | null
        }
        Relationships: []
      }
      message_variations: {
        Row: {
          category: string
          created_at: string
          id: string
          is_active: boolean | null
          updated_at: string
          user_id: string
          variations: string[]
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id: string
          variations: string[]
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          updated_at?: string
          user_id?: string
          variations?: string[]
        }
        Relationships: []
      }
      meta_ads_tokens: {
        Row: {
          access_token: string
          ad_account_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          is_valid: boolean
          last_validated_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          ad_account_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_valid?: boolean
          last_validated_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          ad_account_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          is_valid?: boolean
          last_validated_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      mission_leads: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          dossier: Json | null
          draft_message: string | null
          error_message: string | null
          id: string
          lead_id: string
          mission_id: string
          offer_match: Json | null
          qualification: Json | null
          quality: Json | null
          rejected_reason: string | null
          replied_at: string | null
          rewrite_count: number
          score: number | null
          send_attempts: number
          sent_at: string | null
          sent_channel: string | null
          status: string
          strategy: Json | null
          temperature: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          dossier?: Json | null
          draft_message?: string | null
          error_message?: string | null
          id?: string
          lead_id: string
          mission_id: string
          offer_match?: Json | null
          qualification?: Json | null
          quality?: Json | null
          rejected_reason?: string | null
          replied_at?: string | null
          rewrite_count?: number
          score?: number | null
          send_attempts?: number
          sent_at?: string | null
          sent_channel?: string | null
          status?: string
          strategy?: Json | null
          temperature?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          dossier?: Json | null
          draft_message?: string | null
          error_message?: string | null
          id?: string
          lead_id?: string
          mission_id?: string
          offer_match?: Json | null
          qualification?: Json | null
          quality?: Json | null
          rejected_reason?: string | null
          replied_at?: string | null
          rewrite_count?: number
          score?: number | null
          send_attempts?: number
          sent_at?: string | null
          sent_channel?: string | null
          status?: string
          strategy?: Json | null
          temperature?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mission_leads_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mission_leads_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          ai_budget_usd: number | null
          autonomy_level: string
          center_lat: number | null
          center_lng: number | null
          center_radius_km: number | null
          channel: string
          city: string | null
          created_at: string
          daily_limit: number
          end_hour: number
          goal: string
          icp: Json
          icp_profile_id: string | null
          id: string
          keywords: string[] | null
          last_run_at: string | null
          leads_contacted: number
          leads_drafted: number
          leads_found: number
          leads_qualified: number
          leads_replied: number
          meetings_booked: number
          name: string
          niche: string
          offer_ids: string[] | null
          paused_at: string | null
          paused_reason: string | null
          quality_thresholds: Json
          region: string | null
          segment: string | null
          start_hour: number
          state: string | null
          status: string
          target_count: number
          updated_at: string
          user_id: string
          work_days_only: boolean
        }
        Insert: {
          ai_budget_usd?: number | null
          autonomy_level?: string
          center_lat?: number | null
          center_lng?: number | null
          center_radius_km?: number | null
          channel?: string
          city?: string | null
          created_at?: string
          daily_limit?: number
          end_hour?: number
          goal?: string
          icp?: Json
          icp_profile_id?: string | null
          id?: string
          keywords?: string[] | null
          last_run_at?: string | null
          leads_contacted?: number
          leads_drafted?: number
          leads_found?: number
          leads_qualified?: number
          leads_replied?: number
          meetings_booked?: number
          name: string
          niche: string
          offer_ids?: string[] | null
          paused_at?: string | null
          paused_reason?: string | null
          quality_thresholds?: Json
          region?: string | null
          segment?: string | null
          start_hour?: number
          state?: string | null
          status?: string
          target_count?: number
          updated_at?: string
          user_id: string
          work_days_only?: boolean
        }
        Update: {
          ai_budget_usd?: number | null
          autonomy_level?: string
          center_lat?: number | null
          center_lng?: number | null
          center_radius_km?: number | null
          channel?: string
          city?: string | null
          created_at?: string
          daily_limit?: number
          end_hour?: number
          goal?: string
          icp?: Json
          icp_profile_id?: string | null
          id?: string
          keywords?: string[] | null
          last_run_at?: string | null
          leads_contacted?: number
          leads_drafted?: number
          leads_found?: number
          leads_qualified?: number
          leads_replied?: number
          meetings_booked?: number
          name?: string
          niche?: string
          offer_ids?: string[] | null
          paused_at?: string | null
          paused_reason?: string | null
          quality_thresholds?: Json
          region?: string | null
          segment?: string | null
          start_hour?: number
          state?: string | null
          status?: string
          target_count?: number
          updated_at?: string
          user_id?: string
          work_days_only?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "missions_icp_profile_id_fkey"
            columns: ["icp_profile_id"]
            isOneToOne: false
            referencedRelation: "icp_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      niche_patterns: {
        Row: {
          avg_messages_to_convert: number | null
          best_contact_hours: number[] | null
          best_follow_up_interval_days: number | null
          best_opening_style: string | null
          common_objections: Json | null
          conversion_rate: number | null
          created_at: string
          id: string
          location: string | null
          niche: string
          response_rate: number | null
          response_rate_by_hour: Json | null
          successful_responses: Json | null
          total_contacts: number | null
          total_conversions: number | null
          total_responses: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_messages_to_convert?: number | null
          best_contact_hours?: number[] | null
          best_follow_up_interval_days?: number | null
          best_opening_style?: string | null
          common_objections?: Json | null
          conversion_rate?: number | null
          created_at?: string
          id?: string
          location?: string | null
          niche: string
          response_rate?: number | null
          response_rate_by_hour?: Json | null
          successful_responses?: Json | null
          total_contacts?: number | null
          total_conversions?: number | null
          total_responses?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avg_messages_to_convert?: number | null
          best_contact_hours?: number[] | null
          best_follow_up_interval_days?: number | null
          best_opening_style?: string | null
          common_objections?: Json | null
          conversion_rate?: number | null
          created_at?: string
          id?: string
          location?: string | null
          niche?: string
          response_rate?: number | null
          response_rate_by_hour?: Json | null
          successful_responses?: Json | null
          total_contacts?: number | null
          total_conversions?: number | null
          total_responses?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      objection_responses: {
        Row: {
          angle: string | null
          category: string
          created_at: string
          id: string
          is_active: boolean
          is_template: boolean
          objection_example: string
          objection_keywords: string[]
          response_template: string
          success_count: number
          updated_at: string
          usage_count: number
          user_id: string | null
        }
        Insert: {
          angle?: string | null
          category: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_template?: boolean
          objection_example: string
          objection_keywords?: string[]
          response_template: string
          success_count?: number
          updated_at?: string
          usage_count?: number
          user_id?: string | null
        }
        Update: {
          angle?: string | null
          category?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_template?: boolean
          objection_example?: string
          objection_keywords?: string[]
          response_template?: string
          success_count?: number
          updated_at?: string
          usage_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      outbound_suppression: {
        Row: {
          channel: string
          created_at: string
          id: string
          identifier: string | null
          lead_id: string | null
          note: string | null
          reason: string
          source: string | null
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          id?: string
          identifier?: string | null
          lead_id?: string | null
          note?: string | null
          reason?: string
          source?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          id?: string
          identifier?: string | null
          lead_id?: string | null
          note?: string | null
          reason?: string
          source?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_suppression_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_events: {
        Row: {
          amount: number | null
          cakto_event_id: string | null
          cakto_order_id: string | null
          created_at: string
          customer_email: string | null
          customer_name: string | null
          event_type: string
          id: string
          processed_at: string | null
          product_name: string | null
          raw_payload: Json | null
          user_id: string | null
        }
        Insert: {
          amount?: number | null
          cakto_event_id?: string | null
          cakto_order_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          event_type: string
          id?: string
          processed_at?: string | null
          product_name?: string | null
          raw_payload?: Json | null
          user_id?: string | null
        }
        Update: {
          amount?: number | null
          cakto_event_id?: string | null
          cakto_order_id?: string | null
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          event_type?: string
          id?: string
          processed_at?: string | null
          product_name?: string | null
          raw_payload?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      pending_replies: {
        Row: {
          first_seen_at: string
          last_seen_at: string
          lead_id: string
          message_count: number
          processing: boolean
          user_id: string
        }
        Insert: {
          first_seen_at?: string
          last_seen_at?: string
          lead_id: string
          message_count?: number
          processing?: boolean
          user_id: string
        }
        Update: {
          first_seen_at?: string
          last_seen_at?: string
          lead_id?: string
          message_count?: number
          processing?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_replies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_sites: {
        Row: {
          category: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          is_template: boolean
          send_count: number
          tags: string[]
          title: string
          updated_at: string
          url: string
          user_id: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_template?: boolean
          send_count?: number
          tags?: string[]
          title: string
          updated_at?: string
          url: string
          user_id?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_template?: boolean
          send_count?: number
          tags?: string[]
          title?: string
          updated_at?: string
          url?: string
          user_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prospecting_history: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          leads_data: Json | null
          location: string | null
          niche: string | null
          session_type: string
          started_at: string
          status: string
          total_duplicates: number | null
          total_errors: number | null
          total_found: number | null
          total_pending: number | null
          total_saved: number | null
          total_sent: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          leads_data?: Json | null
          location?: string | null
          niche?: string | null
          session_type?: string
          started_at?: string
          status?: string
          total_duplicates?: number | null
          total_errors?: number | null
          total_found?: number | null
          total_pending?: number | null
          total_saved?: number | null
          total_sent?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          leads_data?: Json | null
          location?: string | null
          niche?: string | null
          session_type?: string
          started_at?: string
          status?: string
          total_duplicates?: number | null
          total_errors?: number | null
          total_found?: number | null
          total_pending?: number | null
          total_saved?: number | null
          total_sent?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      prospecting_stats: {
        Row: {
          created_at: string
          date: string
          day_of_week: number | null
          hour_of_day: number | null
          id: string
          location: string | null
          messages_sent: number | null
          niche: string
          positive_responses: number | null
          responses_received: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          day_of_week?: number | null
          hour_of_day?: number | null
          id?: string
          location?: string | null
          messages_sent?: number | null
          niche: string
          positive_responses?: number | null
          responses_received?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          day_of_week?: number | null
          hour_of_day?: number | null
          id?: string
          location?: string | null
          messages_sent?: number | null
          niche?: string
          positive_responses?: number | null
          responses_received?: number | null
          user_id?: string
        }
        Relationships: []
      }
      provider_states: {
        Row: {
          avg_latency_ms: number
          circuit_open_until: string | null
          consecutive_failures: number
          enabled: boolean
          health: string
          last_error: string | null
          last_run_at: string | null
          priority: number
          provider_id: string
          total_found: number
          total_runs: number
          total_unique: number
          updated_at: string
        }
        Insert: {
          avg_latency_ms?: number
          circuit_open_until?: string | null
          consecutive_failures?: number
          enabled?: boolean
          health?: string
          last_error?: string | null
          last_run_at?: string | null
          priority?: number
          provider_id: string
          total_found?: number
          total_runs?: number
          total_unique?: number
          updated_at?: string
        }
        Update: {
          avg_latency_ms?: number
          circuit_open_until?: string | null
          consecutive_failures?: number
          enabled?: boolean
          health?: string
          last_error?: string | null
          last_run_at?: string | null
          priority?: number
          provider_id?: string
          total_found?: number
          total_runs?: number
          total_unique?: number
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      scheduled_prospecting: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          last_run_at: string | null
          locations: string[]
          max_leads_per_run: number | null
          name: string
          next_run_at: string | null
          niches: string[]
          prospecting_type: string | null
          schedule_days: number[] | null
          schedule_hour: number | null
          total_leads_captured: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          locations?: string[]
          max_leads_per_run?: number | null
          name: string
          next_run_at?: string | null
          niches?: string[]
          prospecting_type?: string | null
          schedule_days?: number[] | null
          schedule_hour?: number | null
          total_leads_captured?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          locations?: string[]
          max_leads_per_run?: number | null
          name?: string
          next_run_at?: string | null
          niches?: string[]
          prospecting_type?: string | null
          schedule_days?: number[] | null
          schedule_hour?: number | null
          total_leads_captured?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      search_cache: {
        Row: {
          businesses: Json
          cache_key: string
          created_at: string
          hits: number
          location: string
          result_count: number
          term: string
        }
        Insert: {
          businesses?: Json
          cache_key: string
          created_at?: string
          hits?: number
          location: string
          result_count?: number
          term: string
        }
        Update: {
          businesses?: Json
          cache_key?: string
          created_at?: string
          hits?: number
          location?: string
          result_count?: number
          term?: string
        }
        Relationships: []
      }
      search_history: {
        Row: {
          created_at: string
          id: string
          location: string | null
          results_count: number | null
          search_term: string
          search_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          results_count?: number | null
          search_term: string
          search_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          results_count?: number | null
          search_term?: string
          search_type?: string
          user_id?: string
        }
        Relationships: []
      }
      service_intelligence: {
        Row: {
          benefits: string[] | null
          case_studies: string[] | null
          closing_templates: string[] | null
          conversion_rate: number | null
          created_at: string
          description: string | null
          faq: Json | null
          follow_up_templates: string[] | null
          id: string
          ideal_client_profile: string | null
          objection_responses: Json | null
          opening_templates: string[] | null
          pain_points: string[] | null
          pricing_info: string | null
          remarketing_templates: string[] | null
          service_name: string
          service_slug: string
          target_niches: string[] | null
          total_meetings: number | null
          total_responses: number | null
          total_sent: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          benefits?: string[] | null
          case_studies?: string[] | null
          closing_templates?: string[] | null
          conversion_rate?: number | null
          created_at?: string
          description?: string | null
          faq?: Json | null
          follow_up_templates?: string[] | null
          id?: string
          ideal_client_profile?: string | null
          objection_responses?: Json | null
          opening_templates?: string[] | null
          pain_points?: string[] | null
          pricing_info?: string | null
          remarketing_templates?: string[] | null
          service_name: string
          service_slug: string
          target_niches?: string[] | null
          total_meetings?: number | null
          total_responses?: number | null
          total_sent?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          benefits?: string[] | null
          case_studies?: string[] | null
          closing_templates?: string[] | null
          conversion_rate?: number | null
          created_at?: string
          description?: string | null
          faq?: Json | null
          follow_up_templates?: string[] | null
          id?: string
          ideal_client_profile?: string | null
          objection_responses?: Json | null
          opening_templates?: string[] | null
          pain_points?: string[] | null
          pricing_info?: string | null
          remarketing_templates?: string[] | null
          service_name?: string
          service_slug?: string
          target_niches?: string[] | null
          total_meetings?: number | null
          total_responses?: number | null
          total_sent?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number | null
          cakto_customer_id: string | null
          cakto_order_id: string | null
          cakto_product_id: string | null
          cakto_subscription_id: string | null
          canceled_at: string | null
          created_at: string
          currency: string | null
          expires_at: string | null
          id: string
          metadata: Json | null
          payment_method: string | null
          plan: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          cakto_customer_id?: string | null
          cakto_order_id?: string | null
          cakto_product_id?: string | null
          cakto_subscription_id?: string | null
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          payment_method?: string | null
          plan?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          cakto_customer_id?: string | null
          cakto_order_id?: string | null
          cakto_product_id?: string | null
          cakto_subscription_id?: string | null
          canceled_at?: string | null
          created_at?: string
          currency?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json | null
          payment_method?: string | null
          plan?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender_id: string
          sender_type: string
          ticket_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sender_id: string
          sender_type?: string
          ticket_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender_id?: string
          sender_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: string
          status: string
          team_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role?: string
          status?: string
          team_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: string
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          active: boolean
          capacity: number
          created_at: string
          id: string
          invited_by: string | null
          joined_at: string
          niches: string[]
          role: string
          team_id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          capacity?: number
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          niches?: string[]
          role?: string
          team_id: string
          user_id: string
        }
        Update: {
          active?: boolean
          capacity?: number
          created_at?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          niches?: string[]
          role?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          assignment_strategy: string
          created_at: string
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          assignment_strategy?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          assignment_strategy?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          active_chip_ids: string[] | null
          agent_name: string | null
          agent_persona: string | null
          agent_type: string | null
          ai_daily_budget_usd: number
          ai_monthly_budget_usd: number
          apify_token: string | null
          auto_end_hour: number | null
          auto_first_message_enabled: boolean | null
          auto_followup_enabled: boolean | null
          auto_lead_scoring: boolean | null
          auto_pipeline_enabled: boolean | null
          auto_prospecting_enabled: boolean | null
          auto_reactivation_enabled: boolean | null
          auto_slowdown: boolean | null
          auto_start_hour: number | null
          batch_size: number | null
          blacklist: string[] | null
          chip_rotation_enabled: boolean | null
          chip_rotation_strategy: string | null
          closing_style: string | null
          communication_style: string | null
          cooldown_after_batch: boolean | null
          cooldown_minutes: number | null
          created_at: string
          daily_message_limit: number | null
          daily_report_enabled: boolean | null
          default_autonomy_level: string
          email_from: string | null
          email_notifications: boolean | null
          email_reply_to: string | null
          emoji_usage: string | null
          extra_chip_instances: Json | null
          follow_up_tone: string | null
          google_meet_link: string | null
          greeting_style: string | null
          hourly_message_limit: number | null
          hunter_api_token: string | null
          id: string
          knowledge_base: string | null
          max_consecutive_errors: number | null
          message_interval_max: number | null
          message_interval_seconds: number | null
          message_variations: Json | null
          meta_access_token: string | null
          objection_handling: string | null
          onboarding_completed: boolean | null
          onboarding_niche: string | null
          operate_all_day: boolean | null
          outbound_paused: boolean
          outbound_paused_at: string | null
          outbound_paused_reason: string | null
          pause_duration_minutes: number | null
          pause_on_error: boolean | null
          personality_traits: Json | null
          preferred_search_api: string | null
          randomize_interval: boolean | null
          randomize_order: boolean | null
          read_receipt_delay: boolean | null
          response_length: string | null
          sdr_agent_enabled: boolean | null
          serpapi_api_key: string | null
          serper_api_key: string | null
          services_offered: string[] | null
          slowdown_threshold: number | null
          target_locations: string[] | null
          target_niches: string[] | null
          typing_delay_ms: number | null
          typing_simulation: boolean | null
          updated_at: string
          user_id: string
          value_proposition_focus: string | null
          warmup_day: number | null
          warmup_enabled: boolean | null
          warmup_start_date: string | null
          webhook_events: string[] | null
          webhook_url: string | null
          weekly_report_enabled: boolean | null
          whatsapp_connected: boolean | null
          whatsapp_instance_id: string | null
          work_days_only: boolean | null
        }
        Insert: {
          active_chip_ids?: string[] | null
          agent_name?: string | null
          agent_persona?: string | null
          agent_type?: string | null
          ai_daily_budget_usd?: number
          ai_monthly_budget_usd?: number
          apify_token?: string | null
          auto_end_hour?: number | null
          auto_first_message_enabled?: boolean | null
          auto_followup_enabled?: boolean | null
          auto_lead_scoring?: boolean | null
          auto_pipeline_enabled?: boolean | null
          auto_prospecting_enabled?: boolean | null
          auto_reactivation_enabled?: boolean | null
          auto_slowdown?: boolean | null
          auto_start_hour?: number | null
          batch_size?: number | null
          blacklist?: string[] | null
          chip_rotation_enabled?: boolean | null
          chip_rotation_strategy?: string | null
          closing_style?: string | null
          communication_style?: string | null
          cooldown_after_batch?: boolean | null
          cooldown_minutes?: number | null
          created_at?: string
          daily_message_limit?: number | null
          daily_report_enabled?: boolean | null
          default_autonomy_level?: string
          email_from?: string | null
          email_notifications?: boolean | null
          email_reply_to?: string | null
          emoji_usage?: string | null
          extra_chip_instances?: Json | null
          follow_up_tone?: string | null
          google_meet_link?: string | null
          greeting_style?: string | null
          hourly_message_limit?: number | null
          hunter_api_token?: string | null
          id?: string
          knowledge_base?: string | null
          max_consecutive_errors?: number | null
          message_interval_max?: number | null
          message_interval_seconds?: number | null
          message_variations?: Json | null
          meta_access_token?: string | null
          objection_handling?: string | null
          onboarding_completed?: boolean | null
          onboarding_niche?: string | null
          operate_all_day?: boolean | null
          outbound_paused?: boolean
          outbound_paused_at?: string | null
          outbound_paused_reason?: string | null
          pause_duration_minutes?: number | null
          pause_on_error?: boolean | null
          personality_traits?: Json | null
          preferred_search_api?: string | null
          randomize_interval?: boolean | null
          randomize_order?: boolean | null
          read_receipt_delay?: boolean | null
          response_length?: string | null
          sdr_agent_enabled?: boolean | null
          serpapi_api_key?: string | null
          serper_api_key?: string | null
          services_offered?: string[] | null
          slowdown_threshold?: number | null
          target_locations?: string[] | null
          target_niches?: string[] | null
          typing_delay_ms?: number | null
          typing_simulation?: boolean | null
          updated_at?: string
          user_id: string
          value_proposition_focus?: string | null
          warmup_day?: number | null
          warmup_enabled?: boolean | null
          warmup_start_date?: string | null
          webhook_events?: string[] | null
          webhook_url?: string | null
          weekly_report_enabled?: boolean | null
          whatsapp_connected?: boolean | null
          whatsapp_instance_id?: string | null
          work_days_only?: boolean | null
        }
        Update: {
          active_chip_ids?: string[] | null
          agent_name?: string | null
          agent_persona?: string | null
          agent_type?: string | null
          ai_daily_budget_usd?: number
          ai_monthly_budget_usd?: number
          apify_token?: string | null
          auto_end_hour?: number | null
          auto_first_message_enabled?: boolean | null
          auto_followup_enabled?: boolean | null
          auto_lead_scoring?: boolean | null
          auto_pipeline_enabled?: boolean | null
          auto_prospecting_enabled?: boolean | null
          auto_reactivation_enabled?: boolean | null
          auto_slowdown?: boolean | null
          auto_start_hour?: number | null
          batch_size?: number | null
          blacklist?: string[] | null
          chip_rotation_enabled?: boolean | null
          chip_rotation_strategy?: string | null
          closing_style?: string | null
          communication_style?: string | null
          cooldown_after_batch?: boolean | null
          cooldown_minutes?: number | null
          created_at?: string
          daily_message_limit?: number | null
          daily_report_enabled?: boolean | null
          default_autonomy_level?: string
          email_from?: string | null
          email_notifications?: boolean | null
          email_reply_to?: string | null
          emoji_usage?: string | null
          extra_chip_instances?: Json | null
          follow_up_tone?: string | null
          google_meet_link?: string | null
          greeting_style?: string | null
          hourly_message_limit?: number | null
          hunter_api_token?: string | null
          id?: string
          knowledge_base?: string | null
          max_consecutive_errors?: number | null
          message_interval_max?: number | null
          message_interval_seconds?: number | null
          message_variations?: Json | null
          meta_access_token?: string | null
          objection_handling?: string | null
          onboarding_completed?: boolean | null
          onboarding_niche?: string | null
          operate_all_day?: boolean | null
          outbound_paused?: boolean
          outbound_paused_at?: string | null
          outbound_paused_reason?: string | null
          pause_duration_minutes?: number | null
          pause_on_error?: boolean | null
          personality_traits?: Json | null
          preferred_search_api?: string | null
          randomize_interval?: boolean | null
          randomize_order?: boolean | null
          read_receipt_delay?: boolean | null
          response_length?: string | null
          sdr_agent_enabled?: boolean | null
          serpapi_api_key?: string | null
          serper_api_key?: string | null
          services_offered?: string[] | null
          slowdown_threshold?: number | null
          target_locations?: string[] | null
          target_niches?: string[] | null
          typing_delay_ms?: number | null
          typing_simulation?: boolean | null
          updated_at?: string
          user_id?: string
          value_proposition_focus?: string | null
          warmup_day?: number | null
          warmup_enabled?: boolean | null
          warmup_start_date?: string | null
          webhook_events?: string[] | null
          webhook_url?: string | null
          weekly_report_enabled?: boolean | null
          whatsapp_connected?: boolean | null
          whatsapp_instance_id?: string | null
          work_days_only?: boolean | null
        }
        Relationships: []
      }
      whatsapp_blacklist: {
        Row: {
          created_at: string
          id: string
          keyword_matched: string | null
          lead_id: string | null
          phone: string
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          keyword_matched?: string | null
          lead_id?: string | null
          phone: string
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          keyword_matched?: string | null
          lead_id?: string | null
          phone?: string
          reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_blacklist_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_queue: {
        Row: {
          batch_id: string | null
          created_at: string
          delay_seconds: number | null
          error_message: string | null
          id: string
          lead_id: string | null
          max_retries: number | null
          original_content: string
          phone: string
          priority: number | null
          processed_content: string | null
          retry_count: number | null
          scheduled_at: string | null
          sent_at: string | null
          simulate_typing: boolean | null
          status: string | null
          typing_duration_seconds: number | null
          typing_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          delay_seconds?: number | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          max_retries?: number | null
          original_content: string
          phone: string
          priority?: number | null
          processed_content?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          simulate_typing?: boolean | null
          status?: string | null
          typing_duration_seconds?: number | null
          typing_started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          delay_seconds?: number | null
          error_message?: string | null
          id?: string
          lead_id?: string | null
          max_retries?: number | null
          original_content?: string
          phone?: string
          priority?: number | null
          processed_content?: string | null
          retry_count?: number | null
          scheduled_at?: string | null
          sent_at?: string | null
          simulate_typing?: boolean | null
          status?: string | null
          typing_duration_seconds?: number | null
          typing_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ab_sync_counters: { Args: { p_test_id: string }; Returns: undefined }
      ab_test_stats: { Args: { p_test_id: string }; Returns: Json }
      ab_tests_to_evaluate: {
        Args: never
        Returns: {
          min_sample: number
          test_id: string
          user_id: string
        }[]
      }
      agent_can_reply: {
        Args: { p_lead_id: string; p_max_replies_per_day?: number }
        Returns: string
      }
      agent_count_reply: { Args: { p_lead_id: string }; Returns: undefined }
      agent_handoff: {
        Args: { p_lead_id: string; p_reason: string }
        Returns: undefined
      }
      agent_opt_out: {
        Args: { p_keyword?: string; p_lead_id: string }
        Returns: undefined
      }
      ai_budget_check: {
        Args: { p_mission_id?: string; p_user_id: string }
        Returns: string
      }
      ai_cost_summary: { Args: { p_user_id: string }; Returns: Json }
      calculate_lead_score: { Args: { p_lead_id: string }; Returns: number }
      chip_allowance: {
        Args: { p_instance_id: string; p_user_id: string }
        Returns: Json
      }
      chips_overview: {
        Args: { p_user_id: string }
        Returns: {
          day_of_life: number
          failed_7d: number
          instance_id: string
          last_sent_at: string
          sent_7d: number
          sent_today: number
        }[]
      }
      command_center: { Args: { p_user_id: string }; Returns: Json }
      consume_rate_limit: {
        Args: {
          p_action: string
          p_identity: string
          p_max: number
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          remaining: number
          reset_in_seconds: number
        }[]
      }
      crm_overview: {
        Args: never
        Returns: {
          active: boolean
          enviados: number
          falhas: number
          ja_existiam: number
          provider: string
          ultimo_erro: string
          ultimo_erro_em: string
          ultimo_ok: string
        }[]
      }
      dashboard_metrics: {
        Args: { p_days?: number; p_user_id: string }
        Returns: Json
      }
      data_sources_overview: { Args: never; Returns: Json }
      emergency_stop: {
        Args: { p_reason?: string; p_user_id: string }
        Returns: number
      }
      expire_lead_signals: { Args: never; Returns: number }
      get_chip_usage_today: {
        Args: { p_user_id: string }
        Returns: {
          failed_count: number
          instance_id: string
          sent_count: number
        }[]
      }
      get_current_daily_limit: { Args: { p_user_id: string }; Returns: number }
      get_internal_secret: { Args: never; Returns: string }
      get_user_team_ids: { Args: { p_user_id: string }; Returns: string[] }
      has_active_subscription: { Args: { p_user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_lead_owner: { Args: { p_lead_id: string }; Returns: boolean }
      is_phone_blacklisted: {
        Args: { p_phone: string; p_user_id: string }
        Returns: boolean
      }
      is_team_admin: {
        Args: { p_team_id: string; p_user_id: string }
        Returns: boolean
      }
      lead_active_signals: {
        Args: { p_lead_id: string }
        Returns: {
          detected_at: string
          evidence: Json
          expires_at: string
          id: string
          strength: number
          summary: string
          type: string
        }[]
      }
      lead_data_export: { Args: { p_lead_id: string }; Returns: Json }
      lead_handoff_brief: { Args: { p_lead_id: string }; Returns: Json }
      lead_site_score: { Args: { p_audit: Json }; Returns: number }
      leads_ja_existentes: {
        Args: { p_phones: string[]; p_user_id: string }
        Returns: {
          phone_consultado: string
        }[]
      }
      mission_can_send: { Args: { p_mission_id: string }; Returns: string }
      mission_lead_send_failed: {
        Args: {
          p_definitive?: boolean
          p_error: string
          p_max_attempts?: number
          p_mission_lead_id: string
        }
        Returns: Json
      }
      mission_pending_work: {
        Args: { p_mission_id: string }
        Returns: {
          awaiting_human: number
          ready_to_send: number
          to_process: number
        }[]
      }
      mission_refresh_counters: {
        Args: { p_mission_id: string }
        Returns: undefined
      }
      mission_settle_status: { Args: { p_mission_id: string }; Returns: Json }
      missions_pending_batch: {
        Args: { p_limit?: number }
        Returns: {
          mission_id: string
          pending: number
          ready_to_send: number
          user_id: string
        }[]
      }
      normalize_phone_br: { Args: { p_phone: string }; Returns: string }
      opportunity_radar: {
        Args: { p_limit?: number; p_user_id: string }
        Returns: {
          business_name: string
          id: string
          niche: string
          opportunity_score: number
          phone: string
          rating: number
          reasons: string[]
          reviews_count: number
          site_pitch: string
          site_score: number
          stage: string
          website: string
        }[]
      }
      outbound_suppressed: {
        Args: {
          p_channel: string
          p_identifier?: string
          p_lead_id?: string
          p_user_id: string
        }
        Returns: string
      }
      outreach_by_angle: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          angle: string
          meetings: number
          replied: number
          sent: number
        }[]
      }
      outreach_by_channel: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          channel: string
          meetings: number
          replied: number
          sent: number
        }[]
      }
      outreach_by_offer: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          meetings: number
          offer: string
          replied: number
          sent: number
        }[]
      }
      process_spintax: {
        Args: { p_content: string; p_user_id: string }
        Returns: string
      }
      prospecting_hour_stats: {
        Args: { p_days?: number; p_user_id: string }
        Returns: {
          hour_of_day: number
          replied: number
          sent: number
        }[]
      }
      prune_lead_memory: { Args: never; Returns: number }
      prune_rate_limits: { Args: never; Returns: number }
      public_unsubscribe: {
        Args: { p_identifier: string; p_source?: string }
        Returns: Json
      }
      purge_search_cache: { Args: { p_hours?: number }; Returns: number }
      record_chip_send: {
        Args: { p_failed?: boolean; p_instance_id: string; p_user_id: string }
        Returns: undefined
      }
      recover_stale_jobs: { Args: never; Returns: number }
      resume_outbound: { Args: { p_user_id: string }; Returns: undefined }
      signals_overview: { Args: { p_user_id: string }; Returns: Json }
      team_availability: {
        Args: { p_owner_id: string }
        Returns: {
          active: boolean
          capacity: number
          niches: string[]
          open_load: number
          user_id: string
        }[]
      }
      upsert_lead_memory: {
        Args: {
          p_confidence?: number
          p_key: string
          p_lead_id: string
          p_memory_type: string
          p_source?: string
          p_user_id: string
          p_value: string
        }
        Returns: string
      }
      verify_internal_secret: { Args: { p_secret: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
