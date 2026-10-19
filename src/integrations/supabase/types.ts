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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_reset_events: {
        Row: {
          detail: Json
          id: string
          reset_at: string
          reset_by: string
        }
        Insert: {
          detail?: Json
          id?: string
          reset_at?: string
          reset_by: string
        }
        Update: {
          detail?: Json
          id?: string
          reset_at?: string
          reset_by?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string | null
          actor: string | null
          at: string
          detail: Json | null
          entity: string | null
          id: number
          new_status: string | null
          old_status: string | null
          rid: string | null
        }
        Insert: {
          action?: string | null
          actor?: string | null
          at?: string
          detail?: Json | null
          entity?: string | null
          id?: number
          new_status?: string | null
          old_status?: string | null
          rid?: string | null
        }
        Update: {
          action?: string | null
          actor?: string | null
          at?: string
          detail?: Json | null
          entity?: string | null
          id?: number
          new_status?: string | null
          old_status?: string | null
          rid?: string | null
        }
        Relationships: []
      }
      department_app_roles: {
        Row: {
          department_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Insert: {
          department_id: string
          role: Database["public"]["Enums"]["app_role"]
        }
        Update: {
          department_id?: string
          role?: Database["public"]["Enums"]["app_role"]
        }
        Relationships: [
          {
            foreignKeyName: "department_app_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      department_owner_roles: {
        Row: {
          department_id: string
          owner_role_id: string
        }
        Insert: {
          department_id: string
          owner_role_id: string
        }
        Update: {
          department_id?: string
          owner_role_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "department_owner_roles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "department_owner_roles_owner_role_id_fkey"
            columns: ["owner_role_id"]
            isOneToOne: false
            referencedRelation: "owner_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      evidence_files: {
        Row: {
          category: string | null
          created_at: string
          filename: string
          id: string
          path: string
          record_id: string
          size: number | null
          uploaded_by: string | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          filename: string
          id?: string
          path: string
          record_id: string
          size?: number | null
          uploaded_by?: string | null
        }
        Update: {
          category?: string | null
          created_at?: string
          filename?: string
          id?: string
          path?: string
          record_id?: string
          size?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_files_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      import_runs: {
        Row: {
          id: string
          run_at: string
          run_by: string | null
          summary: Json
        }
        Insert: {
          id?: string
          run_at?: string
          run_by?: string | null
          summary?: Json
        }
        Update: {
          id?: string
          run_at?: string
          run_by?: string | null
          summary?: Json
        }
        Relationships: []
      }
      owner_roles: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          department: string | null
          display_name: string | null
          email: string | null
          id: string
          job_title: string | null
          must_change_password: boolean
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          job_title?: string | null
          must_change_password?: boolean
        }
        Update: {
          company_id?: string | null
          created_at?: string
          department?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          job_title?: string | null
          must_change_password?: boolean
        }
        Relationships: []
      }
      record_departments: {
        Row: {
          created_at: string
          department_id: string
          id: string
          notes: string | null
          record_id: string
          role: string
          source_sheet: string
        }
        Insert: {
          created_at?: string
          department_id: string
          id?: string
          notes?: string | null
          record_id: string
          role?: string
          source_sheet?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          id?: string
          notes?: string | null
          record_id?: string
          role?: string
          source_sheet?: string
        }
        Relationships: [
          {
            foreignKeyName: "record_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "record_departments_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      record_links: {
        Row: {
          created_at: string
          id: string
          lag_days: number | null
          link_type: string
          notes: string | null
          role: string | null
          sequence: number | null
          source_entity: string
          source_field: string | null
          source_rid: string
          source_sheet: string
          status: string | null
          target_entity: string
          target_rid: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          lag_days?: number | null
          link_type: string
          notes?: string | null
          role?: string | null
          sequence?: number | null
          source_entity: string
          source_field?: string | null
          source_rid: string
          source_sheet: string
          status?: string | null
          target_entity: string
          target_rid: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          lag_days?: number | null
          link_type?: string
          notes?: string | null
          role?: string | null
          sequence?: number | null
          source_entity?: string
          source_field?: string | null
          source_rid?: string
          source_sheet?: string
          status?: string | null
          target_entity?: string
          target_rid?: string
          updated_at?: string
        }
        Relationships: []
      }
      records: {
        Row: {
          acceptance_ids: string[]
          applicability: string | null
          approver: string | null
          closure_pct: number
          created_at: string
          criticality: string | null
          data: Json
          department: string | null
          description: string | null
          doc_number: string | null
          doc_source: string | null
          due_date: string | null
          entity: string
          evidence_ids: string[]
          execution_note: string | null
          expiry_date: string | null
          gate_id: string | null
          id: string
          issuer: string | null
          links: string[]
          no_go_active: boolean
          owner: string | null
          parent_id: string | null
          quorum_required: number
          review_status: string
          reviewer: string | null
          revision: string | null
          rid: string
          rule_ids: string[]
          source_kind: string
          status: string
          title: string
          updated_at: string
          updated_by: string | null
          wps_id: string | null
        }
        Insert: {
          acceptance_ids?: string[]
          applicability?: string | null
          approver?: string | null
          closure_pct?: number
          created_at?: string
          criticality?: string | null
          data?: Json
          department?: string | null
          description?: string | null
          doc_number?: string | null
          doc_source?: string | null
          due_date?: string | null
          entity: string
          evidence_ids?: string[]
          execution_note?: string | null
          expiry_date?: string | null
          gate_id?: string | null
          id?: string
          issuer?: string | null
          links?: string[]
          no_go_active?: boolean
          owner?: string | null
          parent_id?: string | null
          quorum_required?: number
          review_status?: string
          reviewer?: string | null
          revision?: string | null
          rid: string
          rule_ids?: string[]
          source_kind?: string
          status?: string
          title: string
          updated_at?: string
          updated_by?: string | null
          wps_id?: string | null
        }
        Update: {
          acceptance_ids?: string[]
          applicability?: string | null
          approver?: string | null
          closure_pct?: number
          created_at?: string
          criticality?: string | null
          data?: Json
          department?: string | null
          description?: string | null
          doc_number?: string | null
          doc_source?: string | null
          due_date?: string | null
          entity?: string
          evidence_ids?: string[]
          execution_note?: string | null
          expiry_date?: string | null
          gate_id?: string | null
          id?: string
          issuer?: string | null
          links?: string[]
          no_go_active?: boolean
          owner?: string | null
          parent_id?: string | null
          quorum_required?: number
          review_status?: string
          reviewer?: string | null
          revision?: string | null
          rid?: string
          rule_ids?: string[]
          source_kind?: string
          status?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
          wps_id?: string | null
        }
        Relationships: []
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string
          decision: string
          id: string
          kind: string
          record_id: string
          reviewer: string | null
          reviewer_name: string | null
          stage: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          decision: string
          id?: string
          kind?: string
          record_id: string
          reviewer?: string | null
          reviewer_name?: string | null
          stage?: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          decision?: string
          id?: string
          kind?: string
          record_id?: string
          reviewer?: string | null
          reviewer_name?: string | null
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_record_id_fkey"
            columns: ["record_id"]
            isOneToOne: false
            referencedRelation: "records"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workbook_diagnostics: {
        Row: {
          id: number
          imported_at: string
          payload: Json
          row_number: number | null
          run_id: string | null
          source_sheet: string
        }
        Insert: {
          id?: never
          imported_at?: string
          payload: Json
          row_number?: number | null
          run_id?: string | null
          source_sheet: string
        }
        Update: {
          id?: never
          imported_at?: string
          payload?: Json
          row_number?: number | null
          run_id?: string | null
          source_sheet?: string
        }
        Relationships: []
      }
    }
    Views: {
      role_permission_matrix: {
        Row: {
          can_edit: boolean | null
          can_review: boolean | null
          description: string | null
          is_admin: boolean | null
          role: Database["public"]["Enums"]["app_role"] | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_first_login: { Args: never; Returns: undefined }
      can_edit: { Args: { _u: string }; Returns: boolean }
      can_review: { Args: { _u: string }; Returns: boolean }
      closure_blockers: { Args: { _id: string }; Returns: string[] }
      closure_blockers_row: {
        Args: { r: Database["public"]["Tables"]["records"]["Row"] }
        Returns: string[]
      }
      current_department: { Args: never; Returns: string }
      current_user_department: { Args: never; Returns: string }
      expire_evidence: { Args: never; Returns: number }
      gate_approval_count: { Args: { _record_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_member: { Args: { _u: string }; Returns: boolean }
      reset_all_project_records: { Args: never; Returns: Json }
      set_record_department: {
        Args: { _department: string; _record_id: string }
        Returns: undefined
      }
      set_user_department: {
        Args: { _department: string; _user_id: string }
        Returns: undefined
      }
      set_wps_department: {
        Args: { _department: string; _wps_rid: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "reviewer" | "contributor" | "viewer"
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
    Enums: {
      app_role: ["admin", "reviewer", "contributor", "viewer"],
    },
  },
} as const
