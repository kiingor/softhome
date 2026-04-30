node.exe : Initialising login role...
No linha:1 caractere:1
+ & "C:\Program Files\nodejs/node.exe" "C:\Program Files\nodejs/node_mo ...
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (Initialising login role...:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      admission_documents: {
        Row: {
          ai_confidence: number | null
          ai_validation_result: Json | null
          company_id: string
          created_at: string
          doc_type: string
          file_name: string | null
          file_url: string | null
          id: string
          journey_id: string
          notes: string | null
          rejection_reason: string | null
          required: boolean
          reviewed_at: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["admission_document_status"]
          updated_at: string
          uploaded_at: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_validation_result?: Json | null
          company_id: string
          created_at?: string
          doc_type: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          journey_id: string
          notes?: string | null
          rejection_reason?: string | null
          required?: boolean
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["admission_document_status"]
          updated_at?: string
          uploaded_at?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_validation_result?: Json | null
          company_id?: string
          created_at?: string
          doc_type?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          journey_id?: string
          notes?: string | null
          rejection_reason?: string | null
          required?: boolean
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["admission_document_status"]
          updated_at?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "admission_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_documents_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "admission_journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_events: {
        Row: {
          actor_id: string | null
          company_id: string
          created_at: string
          document_id: string | null
          id: string
          journey_id: string
          kind: Database["public"]["Enums"]["admission_event_kind"]
          message: string | null
          payload: Json | null
        }
        Insert: {
          actor_id?: string | null
          company_id: string
          created_at?: string
          document_id?: string | null
          id?: string
          journey_id: string
          kind: Database["public"]["Enums"]["admission_event_kind"]
          message?: string | null
          payload?: Json | null
        }
        Update: {
          actor_id?: string | null
          company_id?: string
          created_at?: string
          document_id?: string | null
          id?: string
          journey_id?: string
          kind?: Database["public"]["Enums"]["admission_event_kind"]
          message?: string | null
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "admission_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_events_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "admission_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_events_journey_id_fkey"
            columns: ["journey_id"]
            isOneToOne: false
            referencedRelation: "admission_journeys"
            referencedColumns: ["id"]
          },
        ]
      }
      admission_journeys: {
        Row: {
          access_token: string
          application_id: string | null
          candidate_cpf: string | null
          candidate_email: string | null
          candidate_name: string
          candidate_phone: string | null
          collaborator_id: string | null
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          position_id: string | null
          regime: Database["public"]["Enums"]["collaborator_regime"]
          status: Database["public"]["Enums"]["admission_journey_status"]
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          application_id?: string | null
          candidate_cpf?: string | null
          candidate_email?: string | null
          candidate_name: string
          candidate_phone?: string | null
          collaborator_id?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          position_id?: string | null
          regime: Database["public"]["Enums"]["collaborator_regime"]
          status?: Database["public"]["Enums"]["admission_journey_status"]
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          application_id?: string | null
          candidate_cpf?: string | null
          candidate_email?: string | null
          candidate_name?: string
          candidate_phone?: string | null
          collaborator_id?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          position_id?: string | null
          regime?: Database["public"]["Enums"]["collaborator_regime"]
          status?: Database["public"]["Enums"]["admission_journey_status"]
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admission_journeys_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_journeys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "admission_journeys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admission_journeys_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: string
          content_blocks: Json | null
          created_at: string
          id: string
          metadata: Json | null
          model: string | null
          role: Database["public"]["Enums"]["agent_message_role"]
          session_id: string
          token_input: number | null
          token_output: number | null
        }
        Insert: {
          content: string
          content_blocks?: Json | null
          created_at?: string
          id?: string
          metadata?: Json | null
          model?: string | null
          role: Database["public"]["Enums"]["agent_message_role"]
          session_id: string
          token_input?: number | null
          token_output?: number | null
        }
        Update: {
          content?: string
          content_blocks?: Json | null
          created_at?: string
          id?: string
          metadata?: Json | null
          model?: string | null
          role?: Database["public"]["Enums"]["agent_message_role"]
          session_id?: string
          token_input?: number | null
          token_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_search_log: {
        Row: {
          agent_kind: string
          company_id: string
          created_at: string
          duration_ms: number | null
          id: string
          query: string
          results: Json
          session_id: string | null
          threshold: number | null
          top_k: number
          user_id: string
        }
        Insert: {
          agent_kind: string
          company_id: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          query: string
          results: Json
          session_id?: string | null
          threshold?: number | null
          top_k?: number
          user_id: string
        }
        Update: {
          agent_kind?: string
          company_id?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          query?: string
          results?: Json
          session_id?: string | null
          threshold?: number | null
          top_k?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_search_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "agent_search_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_search_log_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_sessions: {
        Row: {
          agent_kind: string
          archived_at: string | null
          company_id: string
          created_at: string
          id: string
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_kind: string
          archived_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_kind?: string
          archived_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "agent_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          company_id: string | null
          created_at: string
          id: string
          record_id: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          company_id?: string | null
          created_at?: string
          id?: string
          record_id: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          company_id?: string | null
          created_at?: string
          id?: string
          record_id?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "audit_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      badges: {
        Row: {
          category: Database["public"]["Enums"]["badge_category"]
          color: string | null
          company_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          weight: number
        }
        Insert: {
          category?: Database["public"]["Enums"]["badge_category"]
          color?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          weight?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["badge_category"]
          color?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "badges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "badges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      benefits: {
        Row: {
          applicable_days: string[] | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          value: number
          value_type: string
        }
        Insert: {
          applicable_days?: string[] | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          value?: number
          value_type?: string
        }
        Update: {
          applicable_days?: string[] | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          value?: number
          value_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "benefits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "benefits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      benefits_assignments: {
        Row: {
          assigned_at: string
          benefit_id: string
          collaborator_id: string
          id: string
          observation: string | null
        }
        Insert: {
          assigned_at?: string
          benefit_id: string
          collaborator_id: string
          id?: string
          observation?: string | null
        }
        Update: {
          assigned_at?: string
          benefit_id?: string
          collaborator_id?: string
          id?: string
          observation?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "benefits_assignments_benefit_id_fkey"
            columns: ["benefit_id"]
            isOneToOne: false
            referencedRelation: "benefits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefits_assignments_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_applications: {
        Row: {
          ai_score: number | null
          ai_screened_at: string | null
          ai_summary: string | null
          applied_at: string
          candidate_id: string
          company_id: string
          created_at: string
          id: string
          job_id: string
          rejected_reason: string | null
          stage: Database["public"]["Enums"]["application_stage"]
          updated_at: string
        }
        Insert: {
          ai_score?: number | null
          ai_screened_at?: string | null
          ai_summary?: string | null
          applied_at?: string
          candidate_id: string
          company_id: string
          created_at?: string
          id?: string
          job_id: string
          rejected_reason?: string | null
          stage?: Database["public"]["Enums"]["application_stage"]
          updated_at?: string
        }
        Update: {
          ai_score?: number | null
          ai_screened_at?: string | null
          ai_summary?: string | null
          applied_at?: string
          candidate_id?: string
          company_id?: string
          created_at?: string
          id?: string
          job_id?: string
          rejected_reason?: string | null
          stage?: Database["public"]["Enums"]["application_stage"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_applications_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: false
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "candidate_applications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "agent_recruitment_pipeline"
            referencedColumns: ["job_id"]
          },
          {
            foreignKeyName: "candidate_applications_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "job_openings"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_embeddings: {
        Row: {
          candidate_id: string
          company_id: string
          content: string
          created_at: string
          embedding: string
          id: string
          model: string
          token_count: number | null
          updated_at: string
        }
        Insert: {
          candidate_id: string
          company_id: string
          content: string
          created_at?: string
          embedding: string
          id?: string
          model: string
          token_count?: number | null
          updated_at?: string
        }
        Update: {
          candidate_id?: string
          company_id?: string
          content?: string
          created_at?: string
          embedding?: string
          id?: string
          model?: string
          token_count?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_embeddings_candidate_id_fkey"
            columns: ["candidate_id"]
            isOneToOne: true
            referencedRelation: "candidates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_embeddings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "candidate_embeddings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      candidates: {
        Row: {
          company_id: string
          cpf: string | null
          created_at: string
          cv_filename: string | null
          cv_processed_at: string | null
          cv_summary: string | null
          cv_url: string | null
          email: string | null
          id: string
          is_active: boolean
          linkedin_url: string | null
          name: string
          notes: string | null
          phone: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          cpf?: string | null
          created_at?: string
          cv_filename?: string | null
          cv_processed_at?: string | null
          cv_summary?: string | null
          cv_url?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          linkedin_url?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          cpf?: string | null
          created_at?: string
          cv_filename?: string | null
          cv_processed_at?: string | null
          cv_summary?: string | null
          cv_url?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "candidates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      closed_periods: {
        Row: {
          closed_by: string | null
          company_id: string
          created_at: string
          id: string
          month: number
          year: number
        }
        Insert: {
          closed_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          month: number
          year: number
        }
        Update: {
          closed_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          month?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "closed_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "closed_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborator_badges: {
        Row: {
          awarded_at: string
          awarded_by: string | null
          badge_id: string
          collaborator_id: string
          company_id: string
          created_at: string
          evidence: string | null
          evidence_url: string | null
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          awarded_at?: string
          awarded_by?: string | null
          badge_id: string
          collaborator_id: string
          company_id: string
          created_at?: string
          evidence?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          awarded_at?: string
          awarded_by?: string | null
          badge_id?: string
          collaborator_id?: string
          company_id?: string
          created_at?: string
          evidence?: string | null
          evidence_url?: string | null
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_badges_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_badges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "collaborator_badges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborator_documents: {
        Row: {
          collaborator_id: string
          company_id: string
          created_at: string
          file_name: string
          file_url: string
          id: string
          position_document_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          collaborator_id: string
          company_id: string
          created_at?: string
          file_name: string
          file_url: string
          id?: string
          position_document_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          collaborator_id?: string
          company_id?: string
          created_at?: string
          file_name?: string
          file_url?: string
          id?: string
          position_document_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_documents_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "collaborator_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_documents_position_document_id_fkey"
            columns: ["position_document_id"]
            isOneToOne: false
            referencedRelation: "position_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborators: {
        Row: {
          admission_date: string | null
          birth_date: string | null
          company_id: string
          contracted_store_id: string | null
          cpf: string
          created_at: string
          email: string | null
          id: string
          is_temp: boolean
          name: string
          phone: string | null
          position: string | null
          position_id: string | null
          regime: Database["public"]["Enums"]["collaborator_regime"]
          status: Database["public"]["Enums"]["collaborator_status"]
          store_id: string | null
          team_id: string | null
          termination_date: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admission_date?: string | null
          birth_date?: string | null
          company_id: string
          contracted_store_id?: string | null
          cpf: string
          created_at?: string
          email?: string | null
          id?: string
          is_temp?: boolean
          name: string
          phone?: string | null
          position?: string | null
          position_id?: string | null
          regime?: Database["public"]["Enums"]["collaborator_regime"]
          status?: Database["public"]["Enums"]["collaborator_status"]
          store_id?: string | null
          team_id?: string | null
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admission_date?: string | null
          birth_date?: string | null
          company_id?: string
          contracted_store_id?: string | null
          cpf?: string
          created_at?: string
          email?: string | null
          id?: string
          is_temp?: boolean
          name?: string
          phone?: string | null
          position?: string | null
          position_id?: string | null
          regime?: Database["public"]["Enums"]["collaborator_regime"]
          status?: Database["public"]["Enums"]["collaborator_status"]
          store_id?: string | null
          team_id?: string | null
          termination_date?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "collaborators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_contracted_store_id_fkey"
            columns: ["contracted_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          cnpj: string | null
          company_name: string
          created_at: string
          email: string | null
          id: string
          is_matriz: boolean
          logo_url: string | null
          owner_id: string
          parent_company_id: string | null
          phone: string | null
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          company_name: string
          created_at?: string
          email?: string | null
          id?: string
          is_matriz?: boolean
          logo_url?: string | null
          owner_id: string
          parent_company_id?: string | null
          phone?: string | null
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          id?: string
          is_matriz?: boolean
          logo_url?: string | null
          owner_id?: string
          parent_company_id?: string | null
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_users: {
        Row: {
          accepted_at: string | null
          company_id: string
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          company_id: string
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          company_id?: string
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_documents: {
        Row: {
          company_id: string
          created_at: string
          exam_id: string
          file_name: string
          file_url: string
          id: string
          uploaded_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          exam_id: string
          file_name: string
          file_url: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          exam_id?: string
          file_name?: string
          file_url?: string
          id?: string
          uploaded_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "exam_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_documents_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "occupational_exams"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_feedbacks: {
        Row: {
          ai_summary: string | null
          application_id: string
          company_id: string
          created_at: string
          id: string
          interviewer_id: string | null
          notes: string | null
          recommendation: string
          schedule_id: string
          scores: Json | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          application_id: string
          company_id: string
          created_at?: string
          id?: string
          interviewer_id?: string | null
          notes?: string | null
          recommendation: string
          schedule_id: string
          scores?: Json | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          application_id?: string
          company_id?: string
          created_at?: string
          id?: string
          interviewer_id?: string | null
          notes?: string | null
          recommendation?: string
          schedule_id?: string
          scores?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_feedbacks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "candidate_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_feedbacks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "interview_feedbacks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_feedbacks_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "interview_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_schedules: {
        Row: {
          application_id: string
          cancellation_reason: string | null
          cancelled_at: string | null
          company_id: string
          created_at: string
          duration_minutes: number
          id: string
          interviewer_id: string | null
          location: string | null
          notes: string | null
          scheduled_for: string
          updated_at: string
        }
        Insert: {
          application_id: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          company_id: string
          created_at?: string
          duration_minutes?: number
          id?: string
          interviewer_id?: string | null
          location?: string | null
          notes?: string | null
          scheduled_for: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          cancellation_reason?: string | null
          cancelled_at?: string | null
          company_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          interviewer_id?: string | null
          location?: string | null
          notes?: string | null
          scheduled_for?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_schedules_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "candidate_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "interview_schedules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      job_openings: {
        Row: {
          closed_at: string | null
          company_id: string
          created_at: string
          description: string | null
          hiring_manager_id: string | null
          id: string
          notes: string | null
          opened_at: string | null
          position_id: string | null
          regime: Database["public"]["Enums"]["collaborator_regime"]
          requirements: string | null
          status: Database["public"]["Enums"]["job_opening_status"]
          team_id: string | null
          title: string
          updated_at: string
          vacancies_count: number
        }
        Insert: {
          closed_at?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          hiring_manager_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string | null
          position_id?: string | null
          regime: Database["public"]["Enums"]["collaborator_regime"]
          requirements?: string | null
          status?: Database["public"]["Enums"]["job_opening_status"]
          team_id?: string | null
          title: string
          updated_at?: string
          vacancies_count?: number
        }
        Update: {
          closed_at?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          hiring_manager_id?: string | null
          id?: string
          notes?: string | null
          opened_at?: string | null
          position_id?: string | null
          regime?: Database["public"]["Enums"]["collaborator_regime"]
          requirements?: string | null
          status?: Database["public"]["Enums"]["job_opening_status"]
          team_id?: string | null
          title?: string
          updated_at?: string
          vacancies_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "job_openings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "job_openings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_openings_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_openings_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_milestones: {
        Row: {
          badges_count: number
          collaborator_id: string
          company_id: string
          created_at: string
          due_date: string
          evaluated_at: string | null
          evaluated_by: string | null
          id: string
          kind: Database["public"]["Enums"]["journey_milestone_kind"]
          notes: string | null
          status: Database["public"]["Enums"]["journey_milestone_status"]
          updated_at: string
        }
        Insert: {
          badges_count?: number
          collaborator_id: string
          company_id: string
          created_at?: string
          due_date: string
          evaluated_at?: string | null
          evaluated_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["journey_milestone_kind"]
          notes?: string | null
          status?: Database["public"]["Enums"]["journey_milestone_status"]
          updated_at?: string
        }
        Update: {
          badges_count?: number
          collaborator_id?: string
          company_id?: string
          created_at?: string
          due_date?: string
          evaluated_at?: string | null
          evaluated_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["journey_milestone_kind"]
          notes?: string | null
          status?: Database["public"]["Enums"]["journey_milestone_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_milestones_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journey_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "journey_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          collaborator_id: string | null
          company_id: string
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          message_sent: string
          phone_number: string | null
          status: string
        }
        Insert: {
          collaborator_id?: string | null
          company_id: string
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          message_sent: string
          phone_number?: string | null
          status?: string
        }
        Update: {
          collaborator_id?: string | null
          company_id?: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          message_sent?: string
          phone_number?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_logs_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "notification_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          company_id: string
          created_at: string
          event_type: string
          id: string
          is_enabled: boolean
          message_template: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          is_enabled?: boolean
          message_template: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          is_enabled?: boolean
          message_template?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "notification_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      occupational_exams: {
        Row: {
          auto_generated: boolean
          collaborator_id: string
          company_id: string
          completed_date: string | null
          created_at: string
          created_by: string | null
          due_date: string
          exam_type: string
          id: string
          notes: string | null
          position_id: string | null
          previous_position_id: string | null
          risk_group_at_time: string | null
          scheduled_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          auto_generated?: boolean
          collaborator_id: string
          company_id: string
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          due_date: string
          exam_type: string
          id?: string
          notes?: string | null
          position_id?: string | null
          previous_position_id?: string | null
          risk_group_at_time?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          auto_generated?: boolean
          collaborator_id?: string
          company_id?: string
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          due_date?: string
          exam_type?: string
          id?: string
          notes?: string | null
          position_id?: string | null
          previous_position_id?: string | null
          risk_group_at_time?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "occupational_exams_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occupational_exams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "occupational_exams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occupational_exams_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occupational_exams_previous_position_id_fkey"
            columns: ["previous_position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_errors: {
        Row: {
          created_at: string
          description: string
          id: string
          onboarding_session_id: string
          step: number
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          onboarding_session_id: string
          step: number
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          onboarding_session_id?: string
          step?: number
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_errors_onboarding_session_id_fkey"
            columns: ["onboarding_session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_sessions: {
        Row: {
          collaborator_id: string
          company_id: string
          completed_at: string | null
          created_at: string
          current_step: number
          data_validated: boolean
          documents_completed: boolean
          financial_validated: boolean
          id: string
        }
        Insert: {
          collaborator_id: string
          company_id: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          data_validated?: boolean
          documents_completed?: boolean
          financial_validated?: boolean
          id?: string
        }
        Update: {
          collaborator_id?: string
          company_id?: string
          completed_at?: string | null
          created_at?: string
          current_step?: number
          data_validated?: boolean
          documents_completed?: boolean
          financial_validated?: boolean
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_sessions_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "onboarding_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_alerts: {
        Row: {
          collaborator_id: string | null
          company_id: string
          context: Json | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["payroll_alert_kind"]
          message: string
          period_id: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["payroll_alert_severity"]
          updated_at: string
        }
        Insert: {
          collaborator_id?: string | null
          company_id: string
          context?: Json | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["payroll_alert_kind"]
          message: string
          period_id: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["payroll_alert_severity"]
          updated_at?: string
        }
        Update: {
          collaborator_id?: string | null
          company_id?: string
          context?: Json | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["payroll_alert_kind"]
          message?: string
          period_id?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["payroll_alert_severity"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_alerts_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "payroll_alerts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_alerts_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_entries: {
        Row: {
          collaborator_id: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          installment_group_id: string | null
          installment_number: number | null
          installment_total: number | null
          is_fixed: boolean
          month: number
          store_id: string | null
          type: Database["public"]["Enums"]["payroll_entry_type"]
          updated_at: string
          value: number
          year: number
        }
        Insert: {
          collaborator_id: string
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_fixed?: boolean
          month: number
          store_id?: string | null
          type: Database["public"]["Enums"]["payroll_entry_type"]
          updated_at?: string
          value: number
          year: number
        }
        Update: {
          collaborator_id?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          installment_group_id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_fixed?: boolean
          month?: number
          store_id?: string | null
          type?: Database["public"]["Enums"]["payroll_entry_type"]
          updated_at?: string
          value?: number
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_entries_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "payroll_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          company_id: string
          created_at: string
          export_file_hash: string | null
          export_file_url: string | null
          exported_at: string | null
          exported_by: string | null
          id: string
          notes: string | null
          reference_month: string
          status: Database["public"]["Enums"]["payroll_period_status"]
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          company_id: string
          created_at?: string
          export_file_hash?: string | null
          export_file_url?: string | null
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          notes?: string | null
          reference_month: string
          status?: Database["public"]["Enums"]["payroll_period_status"]
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          company_id?: string
          created_at?: string
          export_file_hash?: string | null
          export_file_url?: string | null
          exported_at?: string | null
          exported_by?: string | null
          id?: string
          notes?: string | null
          reference_month?: string
          status?: Database["public"]["Enums"]["payroll_period_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "payroll_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      payslips: {
        Row: {
          collaborator_id: string
          company_id: string
          file_name: string
          file_url: string
          id: string
          month: number
          uploaded_at: string
          uploaded_by: string | null
          year: number
        }
        Insert: {
          collaborator_id: string
          company_id: string
          file_name: string
          file_url: string
          id?: string
          month: number
          uploaded_at?: string
          uploaded_by?: string | null
          year: number
        }
        Update: {
          collaborator_id?: string
          company_id?: string
          file_name?: string
          file_url?: string
          id?: string
          month?: number
          uploaded_at?: string
          uploaded_by?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payslips_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "payslips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      position_documents: {
        Row: {
          company_id: string
          created_at: string
          file_type: string
          id: string
          name: string
          observation: string | null
          position_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          file_type?: string
          id?: string
          name: string
          observation?: string | null
          position_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          file_type?: string
          id?: string
          name?: string
          observation?: string | null
          position_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "position_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "position_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "position_documents_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "positions"
            referencedColumns: ["id"]
          },
        ]
      }
      positions: {
        Row: {
          company_id: string
          created_at: string
          exam_periodicity_months: number | null
          fgts_percent: number | null
          id: string
          inss_percent: number | null
          irpf_percent: number | null
          name: string
          risk_group: string | null
          salary: number
        }
        Insert: {
          company_id: string
          created_at?: string
          exam_periodicity_months?: number | null
          fgts_percent?: number | null
          id?: string
          inss_percent?: number | null
          irpf_percent?: number | null
          name: string
          risk_group?: string | null
          salary?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          exam_periodicity_months?: number | null
          fgts_percent?: number | null
          id?: string
          inss_percent?: number | null
          irpf_percent?: number | null
          name?: string
          risk_group?: string | null
          salary?: number
        }
        Relationships: [
          {
            foreignKeyName: "positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          full_name: string | null
          id: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          cnpj: string | null
          company_id: string
          created_at: string
          id: string
          store_code: string | null
          store_name: string
        }
        Insert: {
          address?: string | null
          cnpj?: string | null
          company_id: string
          created_at?: string
          id?: string
          store_code?: string | null
          store_name: string
        }
        Update: {
          address?: string | null
          cnpj?: string | null
          company_id?: string
          created_at?: string
          id?: string
          store_code?: string | null
          store_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "stores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_messages: {
        Row: {
          body: string
          company_id: string | null
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          is_read: boolean | null
          message_type: string
          read_at: string | null
          title: string
          visible_until: string | null
        }
        Insert: {
          body: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_read?: boolean | null
          message_type?: string
          read_at?: string | null
          title: string
          visible_until?: string | null
        }
        Update: {
          body?: string
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          is_read?: boolean | null
          message_type?: string
          read_at?: string | null
          title?: string
          visible_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "system_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      teams: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          store_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          store_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          can_create: boolean | null
          can_delete: boolean | null
          can_edit: boolean | null
          can_view: boolean | null
          company_id: string
          created_at: string | null
          id: string
          module: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          company_id: string
          created_at?: string | null
          id?: string
          module: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          can_create?: boolean | null
          can_delete?: boolean | null
          can_edit?: boolean | null
          can_view?: boolean | null
          company_id?: string
          created_at?: string | null
          id?: string
          module?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "user_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
      vacation_periods: {
        Row: {
          collaborator_id: string
          company_id: string
          created_at: string
          days_entitled: number
          days_remaining: number
          days_sold: number
          days_taken: number
          end_date: string
          id: string
          start_date: string
          status: string
        }
        Insert: {
          collaborator_id: string
          company_id: string
          created_at?: string
          days_entitled?: number
          days_remaining?: number
          days_sold?: number
          days_taken?: number
          end_date: string
          id?: string
          start_date: string
          status?: string
        }
        Update: {
          collaborator_id?: string
          company_id?: string
          created_at?: string
          days_entitled?: number
          days_remaining?: number
          days_sold?: number
          days_taken?: number
          end_date?: string
          id?: string
          start_date?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_periods_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "vacation_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      vacation_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          collaborator_id: string
          company_id: string
          created_at: string
          days_count: number
          end_date: string
          id: string
          notes: string | null
          rejection_reason: string | null
          requested_by: string | null
          sell_days: number
          start_date: string
          status: string
          updated_at: string
          vacation_period_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          collaborator_id: string
          company_id: string
          created_at?: string
          days_count: number
          end_date: string
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          sell_days?: number
          start_date: string
          status?: string
          updated_at?: string
          vacation_period_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          collaborator_id?: string
          company_id?: string
          created_at?: string
          days_count?: number
          end_date?: string
          id?: string
          notes?: string | null
          rejection_reason?: string | null
          requested_by?: string | null
          sell_days?: number
          start_date?: string
          status?: string
          updated_at?: string
          vacation_period_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vacation_requests_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "vacation_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_requests_vacation_period_id_fkey"
            columns: ["vacation_period_id"]
            isOneToOne: false
            referencedRelation: "vacation_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_instances: {
        Row: {
          company_id: string
          created_at: string
          id: string
          instance_id: string | null
          instance_name: string
          phone_number: string | null
          status: string
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name: string
          phone_number?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          instance_id?: string | null
          instance_name?: string
          phone_number?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "whatsapp_instances_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      agent_admission_funnel: {
        Row: {
          avg_days_in_status: number | null
          company_id: string | null
          count: number | null
          latest_movement_at: string | null
          oldest_journey_at: string | null
          regime: Database["public"]["Enums"]["collaborator_regime"] | null
          status: Database["public"]["Enums"]["admission_journey_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "admission_journeys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "admission_journeys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_collaborator_distribution: {
        Row: {
          company_id: string | null
          count: number | null
          position_title: string | null
          regime: Database["public"]["Enums"]["collaborator_regime"] | null
          status: Database["public"]["Enums"]["collaborator_status"] | null
          team_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "collaborators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_company_overview: {
        Row: {
          active_collaborators: number | null
          clt_count: number | null
          company_id: string | null
          company_name: string | null
          estagiario_count: number | null
          inactive_collaborators: number | null
          is_matriz: boolean | null
          parent_company_id: string | null
          pj_count: number | null
          stores_count: number | null
          teams_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_journey_stats: {
        Row: {
          badges_count: number | null
          collaborator_id: string | null
          company_id: string | null
          first_award: string | null
          last_30d: number | null
          last_90d: number | null
          latest_award: string | null
          unique_badges_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_badges_collaborator_id_fkey"
            columns: ["collaborator_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborator_badges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "collaborator_badges_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_milestone_overview: {
        Row: {
          avg_badges_at_milestone: number | null
          company_id: string | null
          count: number | null
          kind: Database["public"]["Enums"]["journey_milestone_kind"] | null
          status: Database["public"]["Enums"]["journey_milestone_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "journey_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "journey_milestones_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_recruitment_pipeline: {
        Row: {
          avg_ai_score: number | null
          company_id: string | null
          job_id: string | null
          opened_at: string | null
          regime: Database["public"]["Enums"]["collaborator_regime"] | null
          stage_accepted: number | null
          stage_interview_hr: number | null
          stage_interview_manager: number | null
          stage_new: number | null
          stage_offer: number | null
          stage_rejected: number | null
          stage_screening: number | null
          status: Database["public"]["Enums"]["job_opening_status"] | null
          title: string | null
          total_applications: number | null
        }
        Relationships: [
          {
            foreignKeyName: "job_openings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "agent_company_overview"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "job_openings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      can_modify_module: {
        Args: { _company_id: string; _module: string; _user_id: string }
        Returns: boolean
      }
      can_view_module: {
        Args: { _company_id: string; _module: string; _user_id: string }
        Returns: boolean
      }
      generate_vacation_periods: {
        Args: {
          _admission_date: string
          _collaborator_id: string
          _company_id: string
        }
        Returns: undefined
      }
      get_user_permissions: {
        Args: { _company_id: string; _module: string; _user_id: string }
        Returns: {
          can_create: boolean
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
        }[]
      }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_module_permission: {
        Args: {
          _company_id: string
          _module: string
          _permission?: string
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_company_admin: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
      match_candidates: {
        Args: {
          filter_company_id?: string
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          candidate_id: string
          content: string
          similarity: number
        }[]
      }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      admission_document_status:
        | "pending"
        | "submitted"
        | "ai_validating"
        | "approved"
        | "needs_adjustment"
      admission_event_kind:
        | "created"
        | "token_sent"
        | "docs_submitted"
        | "doc_validated"
        | "doc_approved"
        | "doc_rejected"
        | "exam_scheduled"
        | "exam_completed"
        | "contract_sent"
        | "contract_signed"
        | "admitted"
        | "cancelled"
        | "note"
      admission_journey_status:
        | "created"
        | "docs_pending"
        | "docs_in_review"
        | "docs_needs_adjustment"
        | "docs_approved"
        | "exam_scheduled"
        | "exam_done"
        | "contract_signed"
        | "admitted"
        | "cancelled"
      agent_message_role: "user" | "assistant" | "system" | "tool"
      app_role:
        | "admin_gc"
        | "rh"
        | "gestor"
        | "contador"
        | "colaborador"
        | "gestor_gc"
      application_stage:
        | "new"
        | "screening"
        | "interview_hr"
        | "interview_manager"
        | "offer"
        | "accepted"
        | "rejected"
        | "withdrawn"
      badge_category:
        | "tecnico"
        | "comportamental"
        | "lideranca"
        | "cultura"
        | "integracao"
        | "outro"
      collaborator_regime: "clt" | "pj" | "estagiario"
      collaborator_status:
        | "ativo"
        | "inativo"
        | "aguardando_documentacao"
        | "validacao_pendente"
        | "reprovado"
      job_opening_status: "draft" | "open" | "paused" | "filled" | "cancelled"
      journey_milestone_kind: "d30" | "d60" | "d90" | "d180" | "annual"
      journey_milestone_status: "pending" | "due" | "completed" | "overdue"
      payroll_alert_kind:
        | "collaborator_no_entry"
        | "value_divergence"
        | "absence_no_attestation"
        | "admission_pending"
        | "termination_pending"
        | "other"
      payroll_alert_severity: "info" | "warning" | "critical"
      payroll_entry_type:
        | "salario_base"
        | "beneficio"
        | "custo"
        | "despesa"
        | "hora_extra"
        | "inss"
        | "fgts"
        | "irpf"
        | "falta"
        | "atestado"
        | "adiantamento"
        | "bonificacao"
        | "desconto"
      payroll_period_status: "open" | "closed" | "exported"
      plan_tier: "essencial" | "crescer" | "profissional" | "empresa_plus"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admission_document_status: [
        "pending",
        "submitted",
        "ai_validating",
        "approved",
        "needs_adjustment",
      ],
      admission_event_kind: [
        "created",
        "token_sent",
        "docs_submitted",
        "doc_validated",
        "doc_approved",
        "doc_rejected",
        "exam_scheduled",
        "exam_completed",
        "contract_sent",
        "contract_signed",
        "admitted",
        "cancelled",
        "note",
      ],
      admission_journey_status: [
        "created",
        "docs_pending",
        "docs_in_review",
        "docs_needs_adjustment",
        "docs_approved",
        "exam_scheduled",
        "exam_done",
        "contract_signed",
        "admitted",
        "cancelled",
      ],
      agent_message_role: ["user", "assistant", "system", "tool"],
      app_role: [
        "admin_gc",
        "rh",
        "gestor",
        "contador",
        "colaborador",
        "gestor_gc",
      ],
      application_stage: [
        "new",
        "screening",
        "interview_hr",
        "interview_manager",
        "offer",
        "accepted",
        "rejected",
        "withdrawn",
      ],
      badge_category: [
        "tecnico",
        "comportamental",
        "lideranca",
        "cultura",
        "integracao",
        "outro",
      ],
      collaborator_regime: ["clt", "pj", "estagiario"],
      collaborator_status: [
        "ativo",
        "inativo",
        "aguardando_documentacao",
        "validacao_pendente",
        "reprovado",
      ],
      job_opening_status: ["draft", "open", "paused", "filled", "cancelled"],
      journey_milestone_kind: ["d30", "d60", "d90", "d180", "annual"],
      journey_milestone_status: ["pending", "due", "completed", "overdue"],
      payroll_alert_kind: [
        "collaborator_no_entry",
        "value_divergence",
        "absence_no_attestation",
        "admission_pending",
        "termination_pending",
        "other",
      ],
      payroll_alert_severity: ["info", "warning", "critical"],
      payroll_entry_type: [
        "salario_base",
        "beneficio",
        "custo",
        "despesa",
        "hora_extra",
        "inss",
        "fgts",
        "irpf",
        "falta",
        "atestado",
        "adiantamento",
        "bonificacao",
        "desconto",
      ],
      payroll_period_status: ["open", "closed", "exported"],
      plan_tier: ["essencial", "crescer", "profissional", "empresa_plus"],
    },
  },
} as const
<claude-code-hint v="1" type="plugin" value="supabase@claude-plugins-official" />
