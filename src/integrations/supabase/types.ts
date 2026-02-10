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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benefits_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "closed_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborators: {
        Row: {
          admission_date: string | null
          birth_date: string | null
          company_id: string
          cpf: string
          created_at: string
          email: string | null
          id: string
          is_temp: boolean
          name: string
          phone: string | null
          position: string | null
          position_id: string | null
          status: Database["public"]["Enums"]["collaborator_status"]
          store_id: string | null
          team_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admission_date?: string | null
          birth_date?: string | null
          company_id: string
          cpf: string
          created_at?: string
          email?: string | null
          id?: string
          is_temp?: boolean
          name: string
          phone?: string | null
          position?: string | null
          position_id?: string | null
          status?: Database["public"]["Enums"]["collaborator_status"]
          store_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admission_date?: string | null
          birth_date?: string | null
          company_id?: string
          cpf?: string
          created_at?: string
          email?: string | null
          id?: string
          is_temp?: boolean
          name?: string
          phone?: string | null
          position?: string | null
          position_id?: string | null
          status?: Database["public"]["Enums"]["collaborator_status"]
          store_id?: string | null
          team_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collaborators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          cnpj: string | null
          company_name: string
          created_at: string
          email: string | null
          id: string
          is_blocked: boolean | null
          logo_url: string | null
          owner_id: string
          phone: string | null
          plan_type: string
          subscription_due_date: string | null
          subscription_status: string | null
          trial_ends_at: string | null
        }
        Insert: {
          address?: string | null
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          cnpj?: string | null
          company_name: string
          created_at?: string
          email?: string | null
          id?: string
          is_blocked?: boolean | null
          logo_url?: string | null
          owner_id: string
          phone?: string | null
          plan_type?: string
          subscription_due_date?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          address?: string | null
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          cnpj?: string | null
          company_name?: string
          created_at?: string
          email?: string | null
          id?: string
          is_blocked?: boolean | null
          logo_url?: string | null
          owner_id?: string
          phone?: string | null
          plan_type?: string
          subscription_due_date?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
        }
        Relationships: []
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_users_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_documents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
      master_admins: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          user_id?: string
        }
        Relationships: []
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "occupational_exams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payslips_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "positions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_history: {
        Row: {
          change_reason: string | null
          changed_by: string | null
          company_id: string
          created_at: string
          id: string
          new_plan: string
          previous_plan: string | null
        }
        Insert: {
          change_reason?: string | null
          changed_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          new_plan: string
          previous_plan?: string | null
        }
        Update: {
          change_reason?: string | null
          changed_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          new_plan?: string
          previous_plan?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_history_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "system_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_permissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_periods_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vacation_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies_overview"
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
    }
    Views: {
      companies_overview: {
        Row: {
          active_collaborators: number | null
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          company_name: string | null
          created_at: string | null
          id: string | null
          is_blocked: boolean | null
          plan_type: string | null
          subscription_due_date: string | null
          subscription_status: string | null
        }
        Insert: {
          active_collaborators?: never
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string | null
          is_blocked?: boolean | null
          plan_type?: string | null
          subscription_due_date?: string | null
          subscription_status?: string | null
        }
        Update: {
          active_collaborators?: never
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          company_name?: string | null
          created_at?: string | null
          id?: string | null
          is_blocked?: boolean | null
          plan_type?: string | null
          subscription_due_date?: string | null
          subscription_status?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_add_collaborator: { Args: { _company_id: string }; Returns: boolean }
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
      get_plan_limit: { Args: { plan: string }; Returns: number }
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
      is_master_admin: { Args: { _user_id: string }; Returns: boolean }
      user_belongs_to_company: {
        Args: { _company_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "rh" | "gestor" | "contador" | "colaborador"
      collaborator_status: "ativo" | "inativo"
      payroll_entry_type:
        | "salario"
        | "vale"
        | "custo"
        | "despesa"
        | "adicional"
        | "inss"
        | "fgts"
        | "irpf"
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
  public: {
    Enums: {
      app_role: ["admin", "rh", "gestor", "contador", "colaborador"],
      collaborator_status: ["ativo", "inativo"],
      payroll_entry_type: [
        "salario",
        "vale",
        "custo",
        "despesa",
        "adicional",
        "inss",
        "fgts",
        "irpf",
      ],
      plan_tier: ["essencial", "crescer", "profissional", "empresa_plus"],
    },
  },
} as const
