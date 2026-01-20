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
          asaas_customer_id: string | null
          asaas_subscription_id: string | null
          company_name: string
          created_at: string
          id: string
          is_blocked: boolean | null
          owner_id: string
          plan_type: string
          subscription_due_date: string | null
          subscription_status: string | null
        }
        Insert: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          company_name: string
          created_at?: string
          id?: string
          is_blocked?: boolean | null
          owner_id: string
          plan_type?: string
          subscription_due_date?: string | null
          subscription_status?: string | null
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_subscription_id?: string | null
          company_name?: string
          created_at?: string
          id?: string
          is_blocked?: boolean | null
          owner_id?: string
          plan_type?: string
          subscription_due_date?: string | null
          subscription_status?: string | null
        }
        Relationships: []
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
      payroll_entries: {
        Row: {
          collaborator_id: string
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
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
          id: string
          name: string
          salary: number
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          name: string
          salary?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          name?: string
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
      get_plan_limit: { Args: { plan: string }; Returns: number }
      get_user_roles: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"][]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
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
      payroll_entry_type: "salario" | "vale" | "custo" | "despesa" | "adicional"
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
      payroll_entry_type: ["salario", "vale", "custo", "despesa", "adicional"],
      plan_tier: ["essencial", "crescer", "profissional", "empresa_plus"],
    },
  },
} as const
