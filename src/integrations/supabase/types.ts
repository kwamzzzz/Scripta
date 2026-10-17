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
      admin_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string
          created_at: string
          id: string
          metadata: Json
          summary: string
          target: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          id?: string
          metadata?: Json
          summary: string
          target?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          id?: string
          metadata?: Json
          summary?: string
          target?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage_events: {
        Row: {
          cost_usd: number | null
          created_at: string
          feature: string
          id: string
          input_tokens: number
          model: string
          ok: boolean
          output_tokens: number
          provider: string
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          cost_usd?: number | null
          created_at?: string
          feature: string
          id?: string
          input_tokens?: number
          model: string
          ok?: boolean
          output_tokens?: number
          provider: string
          user_id?: string
          workspace_id?: string | null
        }
        Update: {
          cost_usd?: number | null
          created_at?: string
          feature?: string
          id?: string
          input_tokens?: number
          model?: string
          ok?: boolean
          output_tokens?: number
          provider?: string
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          archived_at: string | null
          audience: string
          body: string
          created_at: string
          created_by: string | null
          dismissible: boolean
          ends_at: string | null
          id: string
          starts_at: string
          title: string
          tone: string
        }
        Insert: {
          archived_at?: string | null
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          dismissible?: boolean
          ends_at?: string | null
          id?: string
          starts_at?: string
          title: string
          tone?: string
        }
        Update: {
          archived_at?: string | null
          audience?: string
          body?: string
          created_at?: string
          created_by?: string | null
          dismissible?: boolean
          ends_at?: string | null
          id?: string
          starts_at?: string
          title?: string
          tone?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          assigned_to: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          entity_id: string
          entity_kind: Database["public"]["Enums"]["source_kind"]
          id: string
          reason: string | null
          requested_by: string | null
          status: Database["public"]["Enums"]["approval_status"]
          task_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          entity_id: string
          entity_kind: Database["public"]["Enums"]["source_kind"]
          id?: string
          reason?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          task_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          entity_id?: string
          entity_kind?: Database["public"]["Enums"]["source_kind"]
          id?: string
          reason?: string | null
          requested_by?: string | null
          status?: Database["public"]["Enums"]["approval_status"]
          task_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_id: string | null
          actor_name: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          matter_id: string | null
          metadata: Json
          research_matter_id: string | null
          summary: string
          workspace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          matter_id?: string | null
          metadata?: Json
          research_matter_id?: string | null
          summary: string
          workspace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          matter_id?: string | null
          metadata?: Json
          research_matter_id?: string | null
          summary?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_research_matter_id_fkey"
            columns: ["research_matter_id"]
            isOneToOne: false
            referencedRelation: "research_matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_claims: {
        Row: {
          created_at: string
          created_by: string
          criterion_id: string
          evidence_id: string
          id: string
          note: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          criterion_id: string
          evidence_id: string
          id?: string
          note?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          criterion_id?: string
          evidence_id?: string
          id?: string
          note?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_claims_criterion_id_fkey"
            columns: ["criterion_id"]
            isOneToOne: false
            referencedRelation: "career_criteria"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_claims_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "career_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_claims_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_contacts: {
        Row: {
          archived_at: string | null
          call_on: string
          closeness: string
          created_at: string
          created_by: string
          email: string
          expertise: string[]
          how_you_met: string
          id: string
          last_contact_on: string | null
          location: string
          name: string
          notes: string
          organisation: string
          phone: string
          role: string
          they_call_on: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          call_on?: string
          closeness?: string
          created_at?: string
          created_by?: string
          email?: string
          expertise?: string[]
          how_you_met?: string
          id?: string
          last_contact_on?: string | null
          location?: string
          name?: string
          notes?: string
          organisation?: string
          phone?: string
          role?: string
          they_call_on?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          call_on?: string
          closeness?: string
          created_at?: string
          created_by?: string
          email?: string
          expertise?: string[]
          how_you_met?: string
          id?: string
          last_contact_on?: string | null
          location?: string
          name?: string
          notes?: string
          organisation?: string
          phone?: string
          role?: string
          they_call_on?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_credentials: {
        Row: {
          created_at: string
          created_by: string
          credential_id: string
          expires_on: string | null
          id: string
          issued_on: string | null
          issuer: string
          name: string
          skills: string[]
          updated_at: string
          url: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          credential_id?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string
          name?: string
          skills?: string[]
          updated_at?: string
          url?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          credential_id?: string
          expires_on?: string | null
          id?: string
          issued_on?: string | null
          issuer?: string
          name?: string
          skills?: string[]
          updated_at?: string
          url?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_credentials_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_criteria: {
        Row: {
          created_at: string
          created_by: string
          essential: boolean
          id: string
          kind: string
          note: string
          role_id: string
          section: string
          sort_order: number
          text: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          essential?: boolean
          id?: string
          kind?: string
          note?: string
          role_id: string
          section?: string
          sort_order?: number
          text?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          essential?: boolean
          id?: string
          kind?: string
          note?: string
          role_id?: string
          section?: string
          sort_order?: number
          text?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_criteria_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "career_roles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_criteria_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_education: {
        Row: {
          created_at: string
          created_by: string
          ended_on: string | null
          field: string
          id: string
          institution: string
          note: string
          qualification: string
          sort_order: number
          started_on: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          ended_on?: string | null
          field?: string
          id?: string
          institution?: string
          note?: string
          qualification?: string
          sort_order?: number
          started_on?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          ended_on?: string | null
          field?: string
          id?: string
          institution?: string
          note?: string
          qualification?: string
          sort_order?: number
          started_on?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_education_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_evidence: {
        Row: {
          archived_at: string | null
          area: string
          complexity: string
          corroborated_by: string
          created_at: string
          created_by: string
          file_name: string | null
          file_ref: string | null
          happened_on: string | null
          id: string
          kind: string
          level: string
          outcome: string
          repetition: string
          statement: string
          through_to: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          area?: string
          complexity?: string
          corroborated_by?: string
          created_at?: string
          created_by?: string
          file_name?: string | null
          file_ref?: string | null
          happened_on?: string | null
          id?: string
          kind?: string
          level?: string
          outcome?: string
          repetition?: string
          statement?: string
          through_to?: string | null
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          area?: string
          complexity?: string
          corroborated_by?: string
          created_at?: string
          created_by?: string
          file_name?: string | null
          file_ref?: string | null
          happened_on?: string | null
          id?: string
          kind?: string
          level?: string
          outcome?: string
          repetition?: string
          statement?: string
          through_to?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_evidence_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_evidence_links: {
        Row: {
          created_at: string
          created_by: string
          evidence_id: string
          id: string
          kind: Database["public"]["Enums"]["source_kind"]
          label: string
          ref_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          evidence_id: string
          id?: string
          kind: Database["public"]["Enums"]["source_kind"]
          label?: string
          ref_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          evidence_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          label?: string
          ref_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_evidence_links_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "career_evidence"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_evidence_links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_milestones: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string
          happened_on: string | null
          headline: string
          id: string
          kind: string
          note: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string
          happened_on?: string | null
          headline?: string
          id?: string
          kind?: string
          note?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string
          happened_on?: string | null
          headline?: string
          id?: string
          kind?: string
          note?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_milestones_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "career_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "career_milestones_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_positions: {
        Row: {
          created_at: string
          created_by: string
          current: boolean
          employment: string
          ended_on: string | null
          id: string
          location: string
          organisation: string
          skills: string[]
          sort_order: number
          started_on: string | null
          summary: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          current?: boolean
          employment?: string
          ended_on?: string | null
          id?: string
          location?: string
          organisation?: string
          skills?: string[]
          sort_order?: number
          started_on?: string | null
          summary?: string
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current?: boolean
          employment?: string
          ended_on?: string | null
          id?: string
          location?: string
          organisation?: string
          skills?: string[]
          sort_order?: number
          started_on?: string | null
          summary?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_positions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_profile: {
        Row: {
          about: string
          admissions: string
          created_at: string
          created_by: string
          email: string
          headline: string
          id: string
          location: string
          phone: string
          updated_at: string
          website: string
          workspace_id: string
        }
        Insert: {
          about?: string
          admissions?: string
          created_at?: string
          created_by?: string
          email?: string
          headline?: string
          id?: string
          location?: string
          phone?: string
          updated_at?: string
          website?: string
          workspace_id: string
        }
        Update: {
          about?: string
          admissions?: string
          created_at?: string
          created_by?: string
          email?: string
          headline?: string
          id?: string
          location?: string
          phone?: string
          updated_at?: string
          website?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_profile_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_roles: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string
          file_name: string | null
          file_ref: string | null
          id: string
          kind: string
          note: string
          organisation: string
          source_text: string
          target_on: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          file_name?: string | null
          file_ref?: string | null
          id?: string
          kind?: string
          note?: string
          organisation?: string
          source_text?: string
          target_on?: string | null
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string
          file_name?: string | null
          file_ref?: string | null
          id?: string
          kind?: string
          note?: string
          organisation?: string
          source_text?: string
          target_on?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      career_skills: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          note: string
          sort_order: number
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          note?: string
          sort_order?: number
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          note?: string
          sort_order?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "career_skills_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_assessments: {
        Row: {
          authorities: Json
          clause_id: string
          client_impact: string
          created_at: string
          detail: string | null
          id: string
          kind: string
          playbook_rule_id: string | null
          recommendation: string
          severity: string
          source: Database["public"]["Enums"]["analysis_source"]
          summary: string
          updated_at: string
          verdict: Database["public"]["Enums"]["verdict"] | null
        }
        Insert: {
          authorities?: Json
          clause_id: string
          client_impact?: string
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          playbook_rule_id?: string | null
          recommendation?: string
          severity?: string
          source?: Database["public"]["Enums"]["analysis_source"]
          summary?: string
          updated_at?: string
          verdict?: Database["public"]["Enums"]["verdict"] | null
        }
        Update: {
          authorities?: Json
          clause_id?: string
          client_impact?: string
          created_at?: string
          detail?: string | null
          id?: string
          kind?: string
          playbook_rule_id?: string | null
          recommendation?: string
          severity?: string
          source?: Database["public"]["Enums"]["analysis_source"]
          summary?: string
          updated_at?: string
          verdict?: Database["public"]["Enums"]["verdict"] | null
        }
        Relationships: [
          {
            foreignKeyName: "clause_assessments_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_assessments_playbook_rule_id_fkey"
            columns: ["playbook_rule_id"]
            isOneToOne: false
            referencedRelation: "playbook_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_revisions: {
        Row: {
          clause_id: string | null
          clause_num: string
          clause_title: string
          created_at: string
          created_by: string | null
          doc: Json
          id: string
          kind: string
          label: string | null
          matter_id: string
          note: string | null
        }
        Insert: {
          clause_id?: string | null
          clause_num?: string
          clause_title?: string
          created_at?: string
          created_by?: string | null
          doc: Json
          id?: string
          kind?: string
          label?: string | null
          matter_id: string
          note?: string | null
        }
        Update: {
          clause_id?: string | null
          clause_num?: string
          clause_title?: string
          created_at?: string
          created_by?: string | null
          doc?: Json
          id?: string
          kind?: string
          label?: string | null
          matter_id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clause_revisions_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_revisions_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_segments: {
        Row: {
          clause_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["seg_kind"]
          ordinal: number
          text: string
          updated_at: string
        }
        Insert: {
          clause_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["seg_kind"]
          ordinal: number
          text: string
          updated_at?: string
        }
        Update: {
          clause_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["seg_kind"]
          ordinal?: number
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clause_segments_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
        ]
      }
      clause_semantics: {
        Row: {
          actor: string | null
          clause_id: string
          confidence: number | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          function: string
          id: string
          matter_id: string
          source: Database["public"]["Enums"]["analysis_source"]
          updated_at: string
        }
        Insert: {
          actor?: string | null
          clause_id: string
          confidence?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          function: string
          id?: string
          matter_id: string
          source?: Database["public"]["Enums"]["analysis_source"]
          updated_at?: string
        }
        Update: {
          actor?: string | null
          clause_id?: string
          confidence?: number | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          function?: string
          id?: string
          matter_id?: string
          source?: Database["public"]["Enums"]["analysis_source"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clause_semantics_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: true
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clause_semantics_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      clauses: {
        Row: {
          analysis: string | null
          analysis_error: string | null
          analysis_source: Database["public"]["Enums"]["analysis_source"]
          approval: Database["public"]["Enums"]["approval_status"]
          assignee_id: string | null
          change: Database["public"]["Enums"]["clause_change"] | null
          classification: string | null
          classification_reason: string | null
          classification_source: string | null
          compared_to_document_id: string | null
          confidence: number | null
          created_at: string
          diff_summary: string | null
          doc: Json | null
          document_num: string | null
          drafted_here: boolean
          id: string
          kind: string | null
          matter_id: string
          num: string | null
          ordinal: number
          page_ref: string | null
          parts_numbered: boolean | null
          refs: Json
          review_state: Database["public"]["Enums"]["review_state"] | null
          risk: Database["public"]["Enums"]["clause_risk"] | null
          source_document_id: string | null
          status: Database["public"]["Enums"]["clause_status"]
          suggested_text: string | null
          title: string
          updated_at: string
        }
        Insert: {
          analysis?: string | null
          analysis_error?: string | null
          analysis_source?: Database["public"]["Enums"]["analysis_source"]
          approval?: Database["public"]["Enums"]["approval_status"]
          assignee_id?: string | null
          change?: Database["public"]["Enums"]["clause_change"] | null
          classification?: string | null
          classification_reason?: string | null
          classification_source?: string | null
          compared_to_document_id?: string | null
          confidence?: number | null
          created_at?: string
          diff_summary?: string | null
          doc?: Json | null
          document_num?: string | null
          drafted_here?: boolean
          id?: string
          kind?: string | null
          matter_id: string
          num?: string | null
          ordinal?: number
          page_ref?: string | null
          parts_numbered?: boolean | null
          refs?: Json
          review_state?: Database["public"]["Enums"]["review_state"] | null
          risk?: Database["public"]["Enums"]["clause_risk"] | null
          source_document_id?: string | null
          status?: Database["public"]["Enums"]["clause_status"]
          suggested_text?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          analysis?: string | null
          analysis_error?: string | null
          analysis_source?: Database["public"]["Enums"]["analysis_source"]
          approval?: Database["public"]["Enums"]["approval_status"]
          assignee_id?: string | null
          change?: Database["public"]["Enums"]["clause_change"] | null
          classification?: string | null
          classification_reason?: string | null
          classification_source?: string | null
          compared_to_document_id?: string | null
          confidence?: number | null
          created_at?: string
          diff_summary?: string | null
          doc?: Json | null
          document_num?: string | null
          drafted_here?: boolean
          id?: string
          kind?: string | null
          matter_id?: string
          num?: string | null
          ordinal?: number
          page_ref?: string | null
          parts_numbered?: boolean | null
          refs?: Json
          review_state?: Database["public"]["Enums"]["review_state"] | null
          risk?: Database["public"]["Enums"]["clause_risk"] | null
          source_document_id?: string | null
          status?: Database["public"]["Enums"]["clause_status"]
          suggested_text?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clauses_compared_to_document_id_fkey"
            columns: ["compared_to_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clauses_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clauses_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      client_marketing_access: {
        Row: {
          client_id: string
          created_at: string
          granted_by: string | null
          id: string
          level: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          level: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          level?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_marketing_access_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      client_notes: {
        Row: {
          archived_at: string | null
          body: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          noted_on: string | null
          title: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          body?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          noted_on?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          noted_on?: string | null
          title?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notes_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      clients: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          doc_category_order: Json
          id: string
          kind: string
          name: string
          optional_areas: string[]
          reference: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_category_order?: Json
          id?: string
          kind?: string
          name: string
          optional_areas?: string[]
          reference?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          doc_category_order?: Json
          id?: string
          kind?: string
          name?: string
          optional_areas?: string[]
          reference?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          entity_id: string
          entity_kind: Database["public"]["Enums"]["source_kind"]
          id: string
          kind: Database["public"]["Enums"]["comment_kind"]
          mentions: string[]
          parent_id: string | null
          resolved: boolean
          updated_at: string | null
          workspace_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          entity_id: string
          entity_kind: Database["public"]["Enums"]["source_kind"]
          id?: string
          kind?: Database["public"]["Enums"]["comment_kind"]
          mentions?: string[]
          parent_id?: string | null
          resolved?: boolean
          updated_at?: string | null
          workspace_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          entity_id?: string
          entity_kind?: Database["public"]["Enums"]["source_kind"]
          id?: string
          kind?: Database["public"]["Enums"]["comment_kind"]
          mentions?: string[]
          parent_id?: string | null
          resolved?: boolean
          updated_at?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_amendments: {
        Row: {
          clause_id: string
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          issue_id: string | null
          matter_id: string
          ordinal: number
          origin: string
          proposed_text: string
          rationale: string
          status: string
          updated_at: string
        }
        Insert: {
          clause_id: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          issue_id?: string | null
          matter_id: string
          ordinal?: number
          origin?: string
          proposed_text?: string
          rationale?: string
          status?: string
          updated_at?: string
        }
        Update: {
          clause_id?: string
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          issue_id?: string | null
          matter_id?: string
          ordinal?: number
          origin?: string
          proposed_text?: string
          rationale?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_amendments_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_amendments_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "contract_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_amendments_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_drafts: {
        Row: {
          accepted_at: string | null
          accepted_matter_id: string | null
          agreement_type: string
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          governing_law: string
          id: string
          instructions: string
          matter_id: string | null
          outcomes: Json
          plan: Json | null
          stage: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_matter_id?: string | null
          agreement_type?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          governing_law?: string
          id?: string
          instructions?: string
          matter_id?: string | null
          outcomes?: Json
          plan?: Json | null
          stage?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_matter_id?: string | null
          agreement_type?: string
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          governing_law?: string
          id?: string
          instructions?: string
          matter_id?: string | null
          outcomes?: Json
          plan?: Json | null
          stage?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_drafts_accepted_matter_id_fkey"
            columns: ["accepted_matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_drafts_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_issues: {
        Row: {
          assessment_id: string | null
          clause_id: string | null
          created_at: string
          created_by: string | null
          decided_at: string | null
          decided_by: string | null
          decision_note: string
          detail: string
          id: string
          kind: string
          matter_id: string
          ordinal: number
          recommendation: string
          ref: number
          severity: string
          source: Database["public"]["Enums"]["analysis_source"]
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assessment_id?: string | null
          clause_id?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          detail?: string
          id?: string
          kind?: string
          matter_id: string
          ordinal?: number
          recommendation?: string
          ref: number
          severity?: string
          source?: Database["public"]["Enums"]["analysis_source"]
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assessment_id?: string | null
          clause_id?: string | null
          created_at?: string
          created_by?: string | null
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          detail?: string
          id?: string
          kind?: string
          matter_id?: string
          ordinal?: number
          recommendation?: string
          ref?: number
          severity?: string
          source?: Database["public"]["Enums"]["analysis_source"]
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_issues_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "clause_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_issues_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_issues_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_key_terms: {
        Row: {
          clause_id: string | null
          created_at: string
          id: string
          label: string
          matter_id: string
          ordinal: number
          source: Database["public"]["Enums"]["analysis_source"]
          term_key: string
          updated_at: string
          value: string
        }
        Insert: {
          clause_id?: string | null
          created_at?: string
          id?: string
          label: string
          matter_id: string
          ordinal?: number
          source?: Database["public"]["Enums"]["analysis_source"]
          term_key: string
          updated_at?: string
          value?: string
        }
        Update: {
          clause_id?: string | null
          created_at?: string
          id?: string
          label?: string
          matter_id?: string
          ordinal?: number
          source?: Database["public"]["Enums"]["analysis_source"]
          term_key?: string
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_key_terms_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_key_terms_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      corporate_documents: {
        Row: {
          archived_at: string | null
          content: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          kind: string
          letterhead_id: string | null
          matter_id: string | null
          stage: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          kind: string
          letterhead_id?: string | null
          matter_id?: string | null
          stage?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          content?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          kind?: string
          letterhead_id?: string | null
          matter_id?: string | null
          stage?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "corporate_documents_letterhead_workspace_fkey"
            columns: ["workspace_id", "letterhead_id"]
            isOneToOne: false
            referencedRelation: "letterheads"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "corporate_documents_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corporate_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      discussion_points: {
        Row: {
          created_at: string
          id: string
          ordinal: number
          seconds: number | null
          speaker_label: string | null
          speaker_name: string | null
          speaker_role: string | null
          text: string
          timestamp_label: string | null
          transcript_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          ordinal?: number
          seconds?: number | null
          speaker_label?: string | null
          speaker_name?: string | null
          speaker_role?: string | null
          text: string
          timestamp_label?: string | null
          transcript_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          ordinal?: number
          seconds?: number | null
          speaker_label?: string | null
          speaker_name?: string | null
          speaker_role?: string | null
          text?: string
          timestamp_label?: string | null
          transcript_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discussion_points_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          byte_size: number | null
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          label: string | null
          matter_id: string
          mime_type: string | null
          note: string | null
          page_count: number | null
          storage_path: string | null
          updated_at: string
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          label?: string | null
          matter_id: string
          mime_type?: string | null
          note?: string | null
          page_count?: number | null
          storage_path?: string | null
          updated_at?: string
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          label?: string | null
          matter_id?: string
          mime_type?: string | null
          note?: string | null
          page_count?: number | null
          storage_path?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          archived_at: string | null
          byte_size: number | null
          client_id: string | null
          confidentiality: string | null
          created_at: string
          deleted_at: string | null
          doc_date: string | null
          effective_date: string | null
          id: string
          jurisdiction: string | null
          kind: Database["public"]["Enums"]["doc_kind"]
          last_edited_at: string | null
          last_edited_by: string | null
          matter_id: string | null
          mime_type: string | null
          name: string
          notes: string | null
          org_category: string | null
          page_count: number | null
          parse_error: string | null
          parse_status: Database["public"]["Enums"]["parse_status"]
          parsed_at: string | null
          parsed_blocks: Json | null
          parsed_text: string | null
          parties: string[]
          storage_path: string | null
          structure_detected: boolean
          tags: string[]
          updated_at: string
          uploaded_by: string | null
          version_label: string | null
          workspace_id: string | null
        }
        Insert: {
          archived_at?: string | null
          byte_size?: number | null
          client_id?: string | null
          confidentiality?: string | null
          created_at?: string
          deleted_at?: string | null
          doc_date?: string | null
          effective_date?: string | null
          id?: string
          jurisdiction?: string | null
          kind: Database["public"]["Enums"]["doc_kind"]
          last_edited_at?: string | null
          last_edited_by?: string | null
          matter_id?: string | null
          mime_type?: string | null
          name: string
          notes?: string | null
          org_category?: string | null
          page_count?: number | null
          parse_error?: string | null
          parse_status?: Database["public"]["Enums"]["parse_status"]
          parsed_at?: string | null
          parsed_blocks?: Json | null
          parsed_text?: string | null
          parties?: string[]
          storage_path?: string | null
          structure_detected?: boolean
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
          version_label?: string | null
          workspace_id?: string | null
        }
        Update: {
          archived_at?: string | null
          byte_size?: number | null
          client_id?: string | null
          confidentiality?: string | null
          created_at?: string
          deleted_at?: string | null
          doc_date?: string | null
          effective_date?: string | null
          id?: string
          jurisdiction?: string | null
          kind?: Database["public"]["Enums"]["doc_kind"]
          last_edited_at?: string | null
          last_edited_by?: string | null
          matter_id?: string | null
          mime_type?: string | null
          name?: string
          notes?: string | null
          org_category?: string | null
          page_count?: number | null
          parse_error?: string | null
          parse_status?: Database["public"]["Enums"]["parse_status"]
          parsed_at?: string | null
          parsed_blocks?: Json | null
          parsed_text?: string | null
          parties?: string[]
          storage_path?: string | null
          structure_detected?: boolean
          tags?: string[]
          updated_at?: string
          uploaded_by?: string | null
          version_label?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "documents_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      drafting_points: {
        Row: {
          clause_id: string | null
          created_at: string
          id: string
          matter_id: string
          ordinal: number
          resolution_id: string | null
          source: Database["public"]["Enums"]["analysis_source"]
          status: Database["public"]["Enums"]["drafting_status"]
          text: string | null
          title: string
          updated_at: string
        }
        Insert: {
          clause_id?: string | null
          created_at?: string
          id?: string
          matter_id: string
          ordinal?: number
          resolution_id?: string | null
          source?: Database["public"]["Enums"]["analysis_source"]
          status?: Database["public"]["Enums"]["drafting_status"]
          text?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          clause_id?: string | null
          created_at?: string
          id?: string
          matter_id?: string
          ordinal?: number
          resolution_id?: string | null
          source?: Database["public"]["Enums"]["analysis_source"]
          status?: Database["public"]["Enums"]["drafting_status"]
          text?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drafting_points_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafting_points_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "drafting_points_resolution_id_fkey"
            columns: ["resolution_id"]
            isOneToOne: false
            referencedRelation: "resolutions"
            referencedColumns: ["id"]
          },
        ]
      }
      drafts: {
        Row: {
          agreement_type: string | null
          body: string
          clause_category: string | null
          created_at: string
          created_by: string | null
          id: string
          jurisdiction: string | null
          matter_id: string | null
          risk_position: string | null
          sector: string | null
          source: Database["public"]["Enums"]["analysis_source"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          agreement_type?: string | null
          body?: string
          clause_category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jurisdiction?: string | null
          matter_id?: string | null
          risk_position?: string | null
          sector?: string | null
          source?: Database["public"]["Enums"]["analysis_source"]
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          agreement_type?: string | null
          body?: string
          clause_category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          jurisdiction?: string | null
          matter_id?: string | null
          risk_position?: string | null
          sector?: string | null
          source?: Database["public"]["Enums"]["analysis_source"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "drafts_matter_workspace_fkey"
            columns: ["workspace_id", "matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "drafts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      edit_locks: {
        Row: {
          acquired_at: string
          entity_id: string
          entity_kind: string
          expires_at: string
          matter_id: string | null
          refreshed_at: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          entity_id: string
          entity_kind: string
          expires_at?: string
          matter_id?: string | null
          refreshed_at?: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          entity_id?: string
          entity_kind?: string
          expires_at?: string
          matter_id?: string | null
          refreshed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "edit_locks_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "edit_locks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          created_at: string
          enabled: boolean
          key: string
          note: string | null
          off_mode: string
          preview_users: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          key: string
          note?: string | null
          off_mode?: string
          preview_users?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          key?: string
          note?: string | null
          off_mode?: string
          preview_users?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          author_id: string
          context: Json
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["feedback_kind"]
          message: string
          replied_at: string | null
          replied_by: string | null
          reply: string | null
          route: string
          screen: string
          screenshot: string | null
          status: Database["public"]["Enums"]["feedback_status"]
          status_changed_at: string | null
          status_changed_by: string | null
          target: Json | null
          workspace_id: string
        }
        Insert: {
          author_id?: string
          context?: Json
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["feedback_kind"]
          message: string
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          route?: string
          screen?: string
          screenshot?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          target?: Json | null
          workspace_id: string
        }
        Update: {
          author_id?: string
          context?: Json
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["feedback_kind"]
          message?: string
          replied_at?: string | null
          replied_by?: string | null
          reply?: string | null
          route?: string
          screen?: string
          screenshot?: string | null
          status?: Database["public"]["Enums"]["feedback_status"]
          status_changed_at?: string | null
          status_changed_by?: string | null
          target?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_replied_by_fkey"
            columns: ["replied_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_status_changed_by_fkey"
            columns: ["status_changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_deliverables: {
        Row: {
          counterparty: string
          deadline: string | null
          depends_on: Json
          description: string
          editor_ref: string | null
          expected: Json
          flow_id: string
          id: string
          kind: string
          mandatory: boolean
          name: string
          note: string | null
          owner: string
          owner_id: string | null
          phase_id: string
          position: number
          references_note: string
          start_on: string | null
          ticked: boolean
          ticked_at: string | null
          type: string
          waiting_on: Json | null
          workspace_id: string
        }
        Insert: {
          counterparty?: string
          deadline?: string | null
          depends_on?: Json
          description?: string
          editor_ref?: string | null
          expected?: Json
          flow_id: string
          id?: string
          kind?: string
          mandatory?: boolean
          name?: string
          note?: string | null
          owner?: string
          owner_id?: string | null
          phase_id: string
          position?: number
          references_note?: string
          start_on?: string | null
          ticked?: boolean
          ticked_at?: string | null
          type?: string
          waiting_on?: Json | null
          workspace_id: string
        }
        Update: {
          counterparty?: string
          deadline?: string | null
          depends_on?: Json
          description?: string
          editor_ref?: string | null
          expected?: Json
          flow_id?: string
          id?: string
          kind?: string
          mandatory?: boolean
          name?: string
          note?: string | null
          owner?: string
          owner_id?: string | null
          phase_id?: string
          position?: number
          references_note?: string
          start_on?: string | null
          ticked?: boolean
          ticked_at?: string | null
          type?: string
          waiting_on?: Json | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_deliverables_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "matter_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_deliverables_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_deliverables_phase_id_fkey"
            columns: ["phase_id"]
            isOneToOne: false
            referencedRelation: "flow_phases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_deliverables_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_emails: {
        Row: {
          body: string
          cc_line: string
          deliverable_id: string
          id: string
          subject: string
          to_line: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body?: string
          cc_line?: string
          deliverable_id: string
          id?: string
          subject?: string
          to_line?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string
          cc_line?: string
          deliverable_id?: string
          id?: string
          subject?: string
          to_line?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_emails_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: true
            referencedRelation: "flow_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_emails_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_evidence: {
        Row: {
          created_at: string
          deliverable_id: string
          email_ref: string | null
          file_ref: string | null
          id: string
          meta: string
          name: string
          note: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          deliverable_id: string
          email_ref?: string | null
          file_ref?: string | null
          id?: string
          meta?: string
          name?: string
          note?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          deliverable_id?: string
          email_ref?: string | null
          file_ref?: string | null
          id?: string
          meta?: string
          name?: string
          note?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_evidence_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "flow_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_evidence_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_phases: {
        Row: {
          deadline: string | null
          description: string
          flow_id: string
          id: string
          name: string
          note: string | null
          position: number
          steps: Json
          workspace_id: string
        }
        Insert: {
          deadline?: string | null
          description?: string
          flow_id: string
          id?: string
          name?: string
          note?: string | null
          position?: number
          steps?: Json
          workspace_id: string
        }
        Update: {
          deadline?: string | null
          description?: string
          flow_id?: string
          id?: string
          name?: string
          note?: string | null
          position?: number
          steps?: Json
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_phases_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "matter_flows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_phases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_preset_families: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_preset_families_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_presets: {
        Row: {
          archived_at: string | null
          body: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          family_id: string
          id: string
          kind: string
          name: string
          position: number
          summary: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          body?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          family_id: string
          id?: string
          kind?: string
          name: string
          position?: number
          summary?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          body?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          family_id?: string
          id?: string
          kind?: string
          name?: string
          position?: number
          summary?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_presets_family_fkey"
            columns: ["workspace_id", "family_id"]
            isOneToOne: false
            referencedRelation: "flow_preset_families"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "flow_presets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_threads: {
        Row: {
          attachments: Json
          author: string
          body: string
          created_at: string
          deliverable_id: string
          id: string
          received_at: string | null
          search_text: string
          workspace_id: string
        }
        Insert: {
          attachments?: Json
          author?: string
          body?: string
          created_at?: string
          deliverable_id: string
          id?: string
          received_at?: string | null
          search_text?: string
          workspace_id: string
        }
        Update: {
          attachments?: Json
          author?: string
          body?: string
          created_at?: string
          deliverable_id?: string
          id?: string
          received_at?: string | null
          search_text?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_threads_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "flow_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_threads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_versions: {
        Row: {
          by_name: string
          created_at: string
          deliverable_id: string
          file_ref: string | null
          id: string
          is_final: boolean
          label: string
          note: string
          pages: number | null
          tag: string | null
          thumbnail_ref: string | null
          workspace_id: string
        }
        Insert: {
          by_name?: string
          created_at?: string
          deliverable_id: string
          file_ref?: string | null
          id?: string
          is_final?: boolean
          label?: string
          note?: string
          pages?: number | null
          tag?: string | null
          thumbnail_ref?: string | null
          workspace_id: string
        }
        Update: {
          by_name?: string
          created_at?: string
          deliverable_id?: string
          file_ref?: string | null
          id?: string
          is_final?: boolean
          label?: string
          note?: string
          pages?: number | null
          tag?: string | null
          thumbnail_ref?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_versions_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "flow_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flow_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      handovers: {
        Row: {
          archived_at: string | null
          attachments: Json
          body: Json | null
          cc_line: string
          created_at: string
          created_by: string
          id: string
          sent_at: string | null
          status: string
          subject: string
          to_line: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          attachments?: Json
          body?: Json | null
          cc_line?: string
          created_at?: string
          created_by?: string
          id?: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_line?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          attachments?: Json
          body?: Json | null
          cc_line?: string
          created_at?: string
          created_by?: string
          id?: string
          sent_at?: string | null
          status?: string
          subject?: string
          to_line?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "handovers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      harness_versions: {
        Row: {
          app: string
          id: string
          note: string | null
          published_at: string
          published_by: string
          spec: Json
          version: number
          workspace_id: string
        }
        Insert: {
          app: string
          id?: string
          note?: string | null
          published_at?: string
          published_by?: string
          spec: Json
          version: number
          workspace_id: string
        }
        Update: {
          app?: string
          id?: string
          note?: string | null
          published_at?: string
          published_by?: string
          spec?: Json
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "harness_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_shares: {
        Row: {
          created_at: string
          id: string
          kind: string
          object_id: string
          shared_by: string | null
          subject_id: string
          subject_type: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          object_id: string
          shared_by?: string | null
          subject_id: string
          subject_type?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          object_id?: string
          shared_by?: string | null
          subject_id?: string
          subject_type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_courses: {
        Row: {
          archived_at: string | null
          cover_credit: string
          cover_path: string | null
          cpd_hours: number
          created_at: string
          created_by: string
          ends_on: string | null
          id: string
          opens_on: string | null
          published_at: string | null
          subtitle: string
          title: string
          updated_at: string
          visibility: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          cover_credit?: string
          cover_path?: string | null
          cpd_hours?: number
          created_at?: string
          created_by?: string
          ends_on?: string | null
          id?: string
          opens_on?: string | null
          published_at?: string | null
          subtitle?: string
          title?: string
          updated_at?: string
          visibility?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          cover_credit?: string
          cover_path?: string | null
          cpd_hours?: number
          created_at?: string
          created_by?: string
          ends_on?: string | null
          id?: string
          opens_on?: string | null
          published_at?: string | null
          subtitle?: string
          title?: string
          updated_at?: string
          visibility?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_courses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_enrolments: {
        Row: {
          course_id: string
          enrolled_at: string
          id: string
          person_id: string
          role: string
        }
        Insert: {
          course_id: string
          enrolled_at?: string
          id?: string
          person_id?: string
          role?: string
        }
        Update: {
          course_id?: string
          enrolled_at?: string
          id?: string
          person_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_enrolments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "learning_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_item_progress: {
        Row: {
          completed_on: string | null
          id: string
          item_id: string
          person_id: string
          started_on: string
          state: string
          updated_at: string
        }
        Insert: {
          completed_on?: string | null
          id?: string
          item_id: string
          person_id?: string
          started_on?: string
          state?: string
          updated_at?: string
        }
        Update: {
          completed_on?: string | null
          id?: string
          item_id?: string
          person_id?: string
          started_on?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_item_progress_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "learning_items"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_items: {
        Row: {
          created_at: string
          id: string
          kind: string
          module_id: string
          outline_line_id: string | null
          parent_item_id: string | null
          payload: Json
          position: number
          release_rule: Json | null
          title: string
          topic_tags: string[]
          updated_at: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          module_id: string
          outline_line_id?: string | null
          parent_item_id?: string | null
          payload?: Json
          position?: number
          release_rule?: Json | null
          title?: string
          topic_tags?: string[]
          updated_at?: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          module_id?: string
          outline_line_id?: string | null
          parent_item_id?: string | null
          payload?: Json
          position?: number
          release_rule?: Json | null
          title?: string
          topic_tags?: string[]
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "learning_items_module_id_fkey"
            columns: ["module_id"]
            isOneToOne: false
            referencedRelation: "learning_modules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_items_parent_item_id_fkey"
            columns: ["parent_item_id"]
            isOneToOne: false
            referencedRelation: "learning_items"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_menu_entries: {
        Row: {
          counts_as_content: boolean
          course_id: string
          created_at: string
          id: string
          kind: string
          label: string
          position: number
          target_kind: string | null
          target_ref: string | null
          updated_at: string
        }
        Insert: {
          counts_as_content?: boolean
          course_id: string
          created_at?: string
          id?: string
          kind: string
          label?: string
          position?: number
          target_kind?: string | null
          target_ref?: string | null
          updated_at?: string
        }
        Update: {
          counts_as_content?: boolean
          course_id?: string
          created_at?: string
          id?: string
          kind?: string
          label?: string
          position?: number
          target_kind?: string | null
          target_ref?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_menu_entries_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "learning_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_modules: {
        Row: {
          course_id: string
          cover_credit: string
          cover_path: string | null
          cpd_hours: number
          created_at: string
          id: string
          outline: Json
          position: number
          published_at: string | null
          title: string
          updated_at: string
          week: number | null
        }
        Insert: {
          course_id: string
          cover_credit?: string
          cover_path?: string | null
          cpd_hours?: number
          created_at?: string
          id?: string
          outline?: Json
          position?: number
          published_at?: string | null
          title?: string
          updated_at?: string
          week?: number | null
        }
        Update: {
          course_id?: string
          cover_credit?: string
          cover_path?: string | null
          cpd_hours?: number
          created_at?: string
          id?: string
          outline?: Json
          position?: number
          published_at?: string | null
          title?: string
          updated_at?: string
          week?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_modules_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "learning_courses"
            referencedColumns: ["id"]
          },
        ]
      }
      letterheads: {
        Row: {
          body_bottom_px: number | null
          body_top_px: number | null
          byte_size: number
          continuation_path: string | null
          created_at: string
          created_by: string | null
          height_px: number
          id: string
          is_default: boolean
          kind: string
          mime_type: string
          name: string
          source_mime: string | null
          source_path: string | null
          storage_path: string
          updated_at: string
          width_px: number
          workspace_id: string
        }
        Insert: {
          body_bottom_px?: number | null
          body_top_px?: number | null
          byte_size: number
          continuation_path?: string | null
          created_at?: string
          created_by?: string | null
          height_px: number
          id?: string
          is_default?: boolean
          kind?: string
          mime_type: string
          name: string
          source_mime?: string | null
          source_path?: string | null
          storage_path: string
          updated_at?: string
          width_px: number
          workspace_id: string
        }
        Update: {
          body_bottom_px?: number | null
          body_top_px?: number | null
          byte_size?: number
          continuation_path?: string | null
          created_at?: string
          created_by?: string | null
          height_px?: number
          id?: string
          is_default?: boolean
          kind?: string
          mime_type?: string
          name?: string
          source_mime?: string | null
          source_path?: string | null
          storage_path?: string
          updated_at?: string
          width_px?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "letterheads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      library_collections: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_collections_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      library_source_collections: {
        Row: {
          collection_id: string
          created_at: string
          source_id: string
          workspace_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          source_id: string
          workspace_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          source_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_sc_collection_fk"
            columns: ["workspace_id", "collection_id"]
            isOneToOne: false
            referencedRelation: "library_collections"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "library_sc_source_fk"
            columns: ["workspace_id", "source_id"]
            isOneToOne: false
            referencedRelation: "library_sources"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      library_sources: {
        Row: {
          archived_at: string | null
          authors: string
          citation: string
          created_at: string
          created_by: string
          file_bytes: number | null
          file_mime: string | null
          file_name: string | null
          file_path: string | null
          id: string
          issued: string
          jurisdiction: string
          kind: string
          kind_label: string
          notes: string
          private: boolean
          publisher: string
          status: string | null
          title: string
          topics: string[]
          updated_at: string
          updated_by: string | null
          url: string
          weight: string | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          authors?: string
          citation?: string
          created_at?: string
          created_by?: string
          file_bytes?: number | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          issued?: string
          jurisdiction?: string
          kind?: string
          kind_label?: string
          notes?: string
          private?: boolean
          publisher?: string
          status?: string | null
          title: string
          topics?: string[]
          updated_at?: string
          updated_by?: string | null
          url?: string
          weight?: string | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          authors?: string
          citation?: string
          created_at?: string
          created_by?: string
          file_bytes?: number | null
          file_mime?: string | null
          file_name?: string | null
          file_path?: string | null
          id?: string
          issued?: string
          jurisdiction?: string
          kind?: string
          kind_label?: string
          notes?: string
          private?: boolean
          publisher?: string
          status?: string | null
          title?: string
          topics?: string[]
          updated_at?: string
          updated_by?: string | null
          url?: string
          weight?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      links: {
        Row: {
          created_at: string
          created_by: string | null
          from_id: string
          from_kind: Database["public"]["Enums"]["source_kind"]
          id: string
          matter_id: string | null
          note: string | null
          to_id: string
          to_kind: Database["public"]["Enums"]["source_kind"]
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          from_id: string
          from_kind: Database["public"]["Enums"]["source_kind"]
          id?: string
          matter_id?: string | null
          note?: string | null
          to_id: string
          to_kind: Database["public"]["Enums"]["source_kind"]
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          from_id?: string
          from_kind?: Database["public"]["Enums"]["source_kind"]
          id?: string
          matter_id?: string | null
          note?: string | null
          to_id?: string
          to_kind?: Database["public"]["Enums"]["source_kind"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "links_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "links_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      manuscript_chapters: {
        Row: {
          assessment: Json | null
          chapter_key: string
          id: string
          manuscript_id: string
          number: string
          ord: number
          reviewed_at: string | null
          state: string
          summarised_at: string | null
          summary: Json | null
          title: string
          version_id: string
          word_count: number
        }
        Insert: {
          assessment?: Json | null
          chapter_key: string
          id?: string
          manuscript_id: string
          number?: string
          ord: number
          reviewed_at?: string | null
          state?: string
          summarised_at?: string | null
          summary?: Json | null
          title?: string
          version_id: string
          word_count?: number
        }
        Update: {
          assessment?: Json | null
          chapter_key?: string
          id?: string
          manuscript_id?: string
          number?: string
          ord?: number
          reviewed_at?: string | null
          state?: string
          summarised_at?: string | null
          summary?: Json | null
          title?: string
          version_id?: string
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "manuscript_chapters_manuscript_id_fkey"
            columns: ["manuscript_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuscript_chapters_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "manuscript_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      manuscript_findings: {
        Row: {
          action: string
          body: string
          carried_from: string | null
          category: string
          chapter_keys: string[]
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string
          evidence: Json
          fingerprint: string
          id: string
          manuscript_id: string
          original: string | null
          pass: string
          ref: number
          replacement: string | null
          rule_id: string | null
          severity: string
          source: string
          status: string
          title: string
          verification: string | null
          version_id: string
        }
        Insert: {
          action: string
          body?: string
          carried_from?: string | null
          category: string
          chapter_keys?: string[]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          evidence?: Json
          fingerprint: string
          id?: string
          manuscript_id: string
          original?: string | null
          pass: string
          ref: number
          replacement?: string | null
          rule_id?: string | null
          severity: string
          source?: string
          status?: string
          title: string
          verification?: string | null
          version_id: string
        }
        Update: {
          action?: string
          body?: string
          carried_from?: string | null
          category?: string
          chapter_keys?: string[]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string
          evidence?: Json
          fingerprint?: string
          id?: string
          manuscript_id?: string
          original?: string | null
          pass?: string
          ref?: number
          replacement?: string | null
          rule_id?: string | null
          severity?: string
          source?: string
          status?: string
          title?: string
          verification?: string | null
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manuscript_findings_carried_from_fkey"
            columns: ["carried_from"]
            isOneToOne: false
            referencedRelation: "manuscript_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuscript_findings_manuscript_id_fkey"
            columns: ["manuscript_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuscript_findings_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "manuscript_style_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuscript_findings_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "manuscript_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      manuscript_nodes: {
        Row: {
          chapter_key: string | null
          id: string
          key: string
          kind: string
          label: string
          level: number
          manuscript_id: string
          note_refs: string[]
          number: string
          ord: number
          page: number | null
          parent_key: string | null
          rows: Json | null
          source: number | null
          style: string | null
          text: string
          version_id: string
        }
        Insert: {
          chapter_key?: string | null
          id?: string
          key: string
          kind: string
          label?: string
          level?: number
          manuscript_id: string
          note_refs?: string[]
          number?: string
          ord: number
          page?: number | null
          parent_key?: string | null
          rows?: Json | null
          source?: number | null
          style?: string | null
          text?: string
          version_id: string
        }
        Update: {
          chapter_key?: string | null
          id?: string
          key?: string
          kind?: string
          label?: string
          level?: number
          manuscript_id?: string
          note_refs?: string[]
          number?: string
          ord?: number
          page?: number | null
          parent_key?: string | null
          rows?: Json | null
          source?: number | null
          style?: string | null
          text?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manuscript_nodes_manuscript_id_fkey"
            columns: ["manuscript_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuscript_nodes_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "manuscript_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      manuscript_runs: {
        Row: {
          chapter_keys: string[]
          error: string | null
          finished_at: string | null
          id: string
          manuscript_id: string
          passes: string[]
          progress: Json
          scope: string
          started_at: string
          started_by: string
          status: string
          version_id: string
        }
        Insert: {
          chapter_keys?: string[]
          error?: string | null
          finished_at?: string | null
          id?: string
          manuscript_id: string
          passes?: string[]
          progress?: Json
          scope: string
          started_at?: string
          started_by?: string
          status?: string
          version_id: string
        }
        Update: {
          chapter_keys?: string[]
          error?: string | null
          finished_at?: string | null
          id?: string
          manuscript_id?: string
          passes?: string[]
          progress?: Json
          scope?: string
          started_at?: string
          started_by?: string
          status?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manuscript_runs_manuscript_id_fkey"
            columns: ["manuscript_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuscript_runs_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "manuscript_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      manuscript_style_rules: {
        Row: {
          active: boolean
          category: string
          created_at: string
          created_by: string | null
          id: string
          manuscript_id: string
          note: string
          origin: string
          preferred: string
          updated_at: string
          variants: string[]
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          created_by?: string | null
          id?: string
          manuscript_id: string
          note?: string
          origin?: string
          preferred?: string
          updated_at?: string
          variants?: string[]
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          manuscript_id?: string
          note?: string
          origin?: string
          preferred?: string
          updated_at?: string
          variants?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "manuscript_style_rules_manuscript_id_fkey"
            columns: ["manuscript_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id"]
          },
        ]
      }
      manuscript_versions: {
        Row: {
          created_at: string
          created_by: string
          file_name: string
          format: string
          id: string
          manuscript_id: string
          storage_path: string | null
          verified_at: string | null
          version_no: number
          warnings: string[]
          word_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string
          file_name?: string
          format: string
          id?: string
          manuscript_id: string
          storage_path?: string | null
          verified_at?: string | null
          version_no: number
          warnings?: string[]
          word_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          file_name?: string
          format?: string
          id?: string
          manuscript_id?: string
          storage_path?: string | null
          verified_at?: string | null
          version_no?: number
          warnings?: string[]
          word_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "manuscript_versions_manuscript_id_fkey"
            columns: ["manuscript_id"]
            isOneToOne: false
            referencedRelation: "manuscripts"
            referencedColumns: ["id"]
          },
        ]
      }
      manuscripts: {
        Row: {
          archived_at: string | null
          author: string
          client_id: string | null
          created_at: string
          created_by: string
          current_version_id: string | null
          deleted_at: string | null
          id: string
          kind: string
          map: Json | null
          mapped_at: string | null
          matter_id: string | null
          private: boolean
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          author?: string
          client_id?: string | null
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          deleted_at?: string | null
          id?: string
          kind?: string
          map?: Json | null
          mapped_at?: string | null
          matter_id?: string | null
          private?: boolean
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          author?: string
          client_id?: string | null
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          deleted_at?: string | null
          id?: string
          kind?: string
          map?: Json | null
          mapped_at?: string | null
          matter_id?: string | null
          private?: boolean
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manuscripts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuscripts_current_version"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "manuscript_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuscripts_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manuscripts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_flows: {
        Row: {
          archived_at: string | null
          client_id: string | null
          contacts: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          kind: string
          matter_id: string | null
          name: string | null
          parties: Json
          phases_title: string | null
          started_at: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          client_id?: string | null
          contacts?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          kind?: string
          matter_id?: string | null
          name?: string | null
          parties?: Json
          phases_title?: string | null
          started_at?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string | null
          contacts?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          kind?: string
          matter_id?: string | null
          name?: string | null
          parties?: Json
          phases_title?: string | null
          started_at?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_flows_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "matter_flows_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_flows_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_members: {
        Row: {
          added_at: string
          added_by: string | null
          added_via_team: string | null
          matter_id: string
          mentions_seen_at: string | null
          role: Database["public"]["Enums"]["matter_role"]
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          added_via_team?: string | null
          matter_id: string
          mentions_seen_at?: string | null
          role?: Database["public"]["Enums"]["matter_role"]
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          added_via_team?: string | null
          matter_id?: string
          mentions_seen_at?: string | null
          role?: Database["public"]["Enums"]["matter_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matter_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_members_added_via_team_fkey"
            columns: ["added_via_team"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_members_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matter_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matter_reference_counters: {
        Row: {
          next_value: number
          workspace_id: string
          year: number
        }
        Insert: {
          next_value?: number
          workspace_id: string
          year: number
        }
        Update: {
          next_value?: number
          workspace_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "matter_reference_counters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      matters: {
        Row: {
          archived_at: string | null
          client: string | null
          client_entity_id: string | null
          client_id: string | null
          counterparty: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          front_matter: Json | null
          governing_law: string | null
          id: string
          is_sample: boolean
          matter_type: string
          name: string
          owner_id: string | null
          playbook_id: string | null
          reference: string | null
          review_depth: string
          review_for: string
          review_instructions: string
          review_priorities: string[]
          review_role: string
          reviewed_at: string | null
          stage: string | null
          target_date: string | null
          updated_at: string
          use_letterhead: boolean | null
          value: number | null
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          client?: string | null
          client_entity_id?: string | null
          client_id?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          front_matter?: Json | null
          governing_law?: string | null
          id?: string
          is_sample?: boolean
          matter_type?: string
          name: string
          owner_id?: string | null
          playbook_id?: string | null
          reference?: string | null
          review_depth?: string
          review_for?: string
          review_instructions?: string
          review_priorities?: string[]
          review_role?: string
          reviewed_at?: string | null
          stage?: string | null
          target_date?: string | null
          updated_at?: string
          use_letterhead?: boolean | null
          value?: number | null
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          client?: string | null
          client_entity_id?: string | null
          client_id?: string | null
          counterparty?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          front_matter?: Json | null
          governing_law?: string | null
          id?: string
          is_sample?: boolean
          matter_type?: string
          name?: string
          owner_id?: string | null
          playbook_id?: string | null
          reference?: string | null
          review_depth?: string
          review_for?: string
          review_instructions?: string
          review_priorities?: string[]
          review_role?: string
          reviewed_at?: string | null
          stage?: string | null
          target_date?: string | null
          updated_at?: string
          use_letterhead?: boolean | null
          value?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "matters_client_entity_fk"
            columns: ["client_id", "client_entity_id"]
            isOneToOne: false
            referencedRelation: "org_entities"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "matters_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "matters_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_approvals: {
        Row: {
          client_id: string
          content_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          kind: string
          note: string
          requested_by: string | null
          status: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          client_id: string
          content_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind: string
          note?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          version: number
          workspace_id: string
        }
        Update: {
          client_id?: string
          content_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          kind?: string
          note?: string
          requested_by?: string | null
          status?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_approvals_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "mkt_approvals_content_fk"
            columns: ["client_id", "content_id"]
            isOneToOne: false
            referencedRelation: "mkt_content"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      mkt_assets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          byte_size: number | null
          client_id: string
          created_at: string
          created_by: string | null
          expires_on: string | null
          id: string
          kind: string
          mime_type: string | null
          name: string
          rules: string
          status: string
          storage_path: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          byte_size?: number | null
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          name: string
          rules?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          byte_size?: number | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          id?: string
          kind?: string
          mime_type?: string | null
          name?: string
          rules?: string
          status?: string
          storage_path?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_assets_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      mkt_brand_kits: {
        Row: {
          avoid_words: string[]
          body_font: string
          client_id: string
          created_at: string
          created_by: string | null
          heading_font: string
          id: string
          palette: Json
          rules: string
          tone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          avoid_words?: string[]
          body_font?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          heading_font?: string
          id?: string
          palette?: Json
          rules?: string
          tone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          avoid_words?: string[]
          body_font?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          heading_font?: string
          id?: string
          palette?: Json
          rules?: string
          tone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_brand_kits_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      mkt_campaigns: {
        Row: {
          archived_at: string | null
          audience: string
          channels: string[]
          client_id: string
          created_at: string
          created_by: string | null
          ends_on: string | null
          entity_id: string | null
          goal: string
          id: string
          measure: string
          message: string
          name: string
          starts_on: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          audience?: string
          channels?: string[]
          client_id: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          entity_id?: string | null
          goal?: string
          id?: string
          measure?: string
          message?: string
          name: string
          starts_on?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          audience?: string
          channels?: string[]
          client_id?: string
          created_at?: string
          created_by?: string | null
          ends_on?: string | null
          entity_id?: string | null
          goal?: string
          id?: string
          measure?: string
          message?: string
          name?: string
          starts_on?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_campaigns_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "mkt_campaigns_entity_fk"
            columns: ["client_id", "entity_id"]
            isOneToOne: false
            referencedRelation: "org_entities"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      mkt_consents: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          note: string
          party: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          note?: string
          party: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          note?: string
          party?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_consents_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "mkt_consents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      mkt_content: {
        Row: {
          archived_at: string | null
          asset_id: string | null
          body: string
          campaign_id: string | null
          channel: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          metrics: Json
          published_at: string | null
          scheduled_at: string | null
          stage: string
          title: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          asset_id?: string | null
          body?: string
          campaign_id?: string | null
          channel?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          metrics?: Json
          published_at?: string | null
          scheduled_at?: string | null
          stage?: string
          title: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          asset_id?: string | null
          body?: string
          campaign_id?: string | null
          channel?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          metrics?: Json
          published_at?: string | null
          scheduled_at?: string | null
          stage?: string
          title?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_content_asset_fk"
            columns: ["client_id", "asset_id"]
            isOneToOne: false
            referencedRelation: "mkt_assets"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "mkt_content_campaign_fk"
            columns: ["client_id", "campaign_id"]
            isOneToOne: false
            referencedRelation: "mkt_campaigns"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "mkt_content_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      mkt_content_versions: {
        Row: {
          body: string
          client_id: string
          content_id: string
          created_at: string
          created_by: string | null
          id: string
          title: string
          version: number
          workspace_id: string
        }
        Insert: {
          body: string
          client_id: string
          content_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          title: string
          version: number
          workspace_id: string
        }
        Update: {
          body?: string
          client_id?: string
          content_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          title?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_content_versions_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "mkt_content_versions_content_fk"
            columns: ["client_id", "content_id"]
            isOneToOne: false
            referencedRelation: "mkt_content"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      mkt_overrides: {
        Row: {
          actor_id: string | null
          check_key: string
          client_id: string
          content_id: string
          created_at: string
          id: string
          reason: string
          version: number
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          check_key: string
          client_id: string
          content_id: string
          created_at?: string
          id?: string
          reason: string
          version: number
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          check_key?: string
          client_id?: string
          content_id?: string
          created_at?: string
          id?: string
          reason?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mkt_overrides_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "mkt_overrides_content_fk"
            columns: ["client_id", "content_id"]
            isOneToOne: false
            referencedRelation: "mkt_content"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_appointments: {
        Row: {
          appointed_on: string | null
          capacity: string
          ceased_on: string | null
          client_id: string
          created_at: string
          created_by: string | null
          entity_id: string
          id: string
          last_change_on: string | null
          last_change_ref: string | null
          person_id: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          appointed_on?: string | null
          capacity: string
          ceased_on?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          id?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          person_id: string
          title?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          appointed_on?: string | null
          capacity?: string
          ceased_on?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          id?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          person_id?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_appointments_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_appointments_entity_fk"
            columns: ["client_id", "entity_id"]
            isOneToOne: false
            referencedRelation: "org_entities"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_appointments_person_fk"
            columns: ["client_id", "person_id"]
            isOneToOne: false
            referencedRelation: "org_people"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_authority_instruments: {
        Row: {
          approved_by: string
          approved_on: string | null
          client_id: string
          created_at: string
          created_by: string | null
          document_id: string | null
          id: string
          last_change_on: string | null
          last_change_ref: string | null
          reference: string
          review_due_on: string | null
          scope_note: string
          superseded_on: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          approved_by?: string
          approved_on?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          reference?: string
          review_due_on?: string | null
          scope_note?: string
          superseded_on?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          approved_by?: string
          approved_on?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          document_id?: string | null
          id?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          reference?: string
          review_due_on?: string | null
          scope_note?: string
          superseded_on?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_authority_instruments_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_authority_instruments_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      org_authority_parties: {
        Row: {
          body: string | null
          capacity: string | null
          client_id: string
          count: number
          created_at: string
          created_by: string | null
          id: string
          position: number
          role_id: string | null
          rule_id: string
          step: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          capacity?: string | null
          client_id: string
          count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          role_id?: string | null
          rule_id: string
          step: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          capacity?: string | null
          client_id?: string
          count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          position?: number
          role_id?: string | null
          rule_id?: string
          step?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_authority_parties_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_authority_parties_role_fk"
            columns: ["client_id", "role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_authority_parties_rule_fk"
            columns: ["client_id", "rule_id"]
            isOneToOne: false
            referencedRelation: "org_authority_rules"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_authority_rules: {
        Row: {
          basis: string
          client_id: string
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string | null
          effective_to: string | null
          entity_id: string | null
          id: string
          instrument_id: string | null
          last_change_on: string | null
          last_change_ref: string | null
          matter_type: string
          max_amount: number | null
          min_amount: number | null
          note: string
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          basis?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string | null
          effective_to?: string | null
          entity_id?: string | null
          id?: string
          instrument_id?: string | null
          last_change_on?: string | null
          last_change_ref?: string | null
          matter_type: string
          max_amount?: number | null
          min_amount?: number | null
          note?: string
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          basis?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string | null
          effective_to?: string | null
          entity_id?: string | null
          id?: string
          instrument_id?: string | null
          last_change_on?: string | null
          last_change_ref?: string | null
          matter_type?: string
          max_amount?: number | null
          min_amount?: number | null
          note?: string
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_authority_rules_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_authority_rules_entity_fk"
            columns: ["client_id", "entity_id"]
            isOneToOne: false
            referencedRelation: "org_entities"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_authority_rules_instrument_fk"
            columns: ["client_id", "instrument_id"]
            isOneToOne: false
            referencedRelation: "org_authority_instruments"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_chart_designs: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          design: Json
          id: string
          kind: string
          updated_at: string
          updated_by: string | null
          version: number
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          design?: Json
          id?: string
          kind: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          design?: Json
          id?: string
          kind?: string
          updated_at?: string
          updated_by?: string | null
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_chart_designs_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      org_entities: {
        Row: {
          activity: string
          archived_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          entity_type: string
          field_sources: Json
          id: string
          incorporated_on: string | null
          jurisdiction: string
          last_change_on: string | null
          last_change_ref: string | null
          name: string
          notes: string
          proposed_change_id: string | null
          registered_office: string
          registration_no: string
          share_capital: string
          short_name: string
          status: string
          tax_no: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          activity?: string
          archived_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          entity_type?: string
          field_sources?: Json
          id?: string
          incorporated_on?: string | null
          jurisdiction?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          name: string
          notes?: string
          proposed_change_id?: string | null
          registered_office?: string
          registration_no?: string
          share_capital?: string
          short_name?: string
          status?: string
          tax_no?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          activity?: string
          archived_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          entity_type?: string
          field_sources?: Json
          id?: string
          incorporated_on?: string | null
          jurisdiction?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          name?: string
          notes?: string
          proposed_change_id?: string | null
          registered_office?: string
          registration_no?: string
          share_capital?: string
          short_name?: string
          status?: string
          tax_no?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_entities_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_entities_proposed_fk"
            columns: ["client_id", "proposed_change_id"]
            isOneToOne: false
            referencedRelation: "org_structure_changes"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_holdings: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          id: string
          instrument: string
          last_change_on: string | null
          last_change_ref: string | null
          owner_entity_id: string | null
          owner_name: string | null
          owner_person_id: string | null
          percent: number | null
          proposed_change_id: string | null
          removed_by_change_id: string | null
          subsidiary_entity_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          instrument?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          owner_entity_id?: string | null
          owner_name?: string | null
          owner_person_id?: string | null
          percent?: number | null
          proposed_change_id?: string | null
          removed_by_change_id?: string | null
          subsidiary_entity_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          instrument?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          owner_entity_id?: string | null
          owner_name?: string | null
          owner_person_id?: string | null
          percent?: number | null
          proposed_change_id?: string | null
          removed_by_change_id?: string | null
          subsidiary_entity_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_holdings_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_holdings_owner_entity_fk"
            columns: ["client_id", "owner_entity_id"]
            isOneToOne: false
            referencedRelation: "org_entities"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_holdings_owner_person_fk"
            columns: ["client_id", "owner_person_id"]
            isOneToOne: false
            referencedRelation: "org_people"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_holdings_proposed_fk"
            columns: ["client_id", "proposed_change_id"]
            isOneToOne: false
            referencedRelation: "org_structure_changes"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_holdings_removed_fk"
            columns: ["client_id", "removed_by_change_id"]
            isOneToOne: false
            referencedRelation: "org_structure_changes"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_holdings_subsidiary_fk"
            columns: ["client_id", "subsidiary_entity_id"]
            isOneToOne: false
            referencedRelation: "org_entities"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_licence_types: {
        Row: {
          created_at: string
          default_lead_days: number
          fields: Json
          has_expiry: boolean
          id: string
          jurisdiction: string
          key: string
          label: string
          position: number
          typical_prerequisites: string[]
          updated_at: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          default_lead_days?: number
          fields?: Json
          has_expiry?: boolean
          id?: string
          jurisdiction?: string
          key: string
          label: string
          position?: number
          typical_prerequisites?: string[]
          updated_at?: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          default_lead_days?: number
          fields?: Json
          has_expiry?: boolean
          id?: string
          jurisdiction?: string
          key?: string
          label?: string
          position?: number
          typical_prerequisites?: string[]
          updated_at?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_licence_types_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      org_licences: {
        Row: {
          archived_at: string | null
          authority: string
          client_id: string
          conditions: string
          country: string
          created_at: string
          created_by: string | null
          entity_id: string | null
          expires_on: string | null
          field_sources: Json
          id: string
          issued_note: string
          issued_on: string | null
          last_change_on: string | null
          last_change_ref: string | null
          name: string
          original_location: string
          owner_person_id: string | null
          owner_role_id: string | null
          prerequisites: Json
          recurring_note: string
          reference: string
          renewal_lead_days: number
          renewal_lodged_on: string | null
          renewal_state: string
          type_key: string
          updated_at: string
          verified: boolean
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          authority?: string
          client_id: string
          conditions?: string
          country?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          expires_on?: string | null
          field_sources?: Json
          id?: string
          issued_note?: string
          issued_on?: string | null
          last_change_on?: string | null
          last_change_ref?: string | null
          name: string
          original_location?: string
          owner_person_id?: string | null
          owner_role_id?: string | null
          prerequisites?: Json
          recurring_note?: string
          reference?: string
          renewal_lead_days?: number
          renewal_lodged_on?: string | null
          renewal_state?: string
          type_key?: string
          updated_at?: string
          verified?: boolean
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          authority?: string
          client_id?: string
          conditions?: string
          country?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string | null
          expires_on?: string | null
          field_sources?: Json
          id?: string
          issued_note?: string
          issued_on?: string | null
          last_change_on?: string | null
          last_change_ref?: string | null
          name?: string
          original_location?: string
          owner_person_id?: string | null
          owner_role_id?: string | null
          prerequisites?: Json
          recurring_note?: string
          reference?: string
          renewal_lead_days?: number
          renewal_lodged_on?: string | null
          renewal_state?: string
          type_key?: string
          updated_at?: string
          verified?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_licences_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_licences_entity_fk"
            columns: ["client_id", "entity_id"]
            isOneToOne: false
            referencedRelation: "org_entities"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_licences_owner_person_fk"
            columns: ["client_id", "owner_person_id"]
            isOneToOne: false
            referencedRelation: "org_people"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_licences_owner_role_fk"
            columns: ["client_id", "owner_role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_obligation_occurrences: {
        Row: {
          client_id: string
          completed_on: string | null
          created_at: string
          created_by: string | null
          due_on: string
          id: string
          note: string
          obligation_id: string
          state: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          completed_on?: string | null
          created_at?: string
          created_by?: string | null
          due_on: string
          id?: string
          note?: string
          obligation_id: string
          state?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          completed_on?: string | null
          created_at?: string
          created_by?: string | null
          due_on?: string
          id?: string
          note?: string
          obligation_id?: string
          state?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_obligation_occurrences_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_obligation_occurrences_obligation_fk"
            columns: ["client_id", "obligation_id"]
            isOneToOne: false
            referencedRelation: "org_obligations"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_obligations: {
        Row: {
          archived_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          detail: string
          due_on: string
          ends_on: string | null
          entity_id: string | null
          id: string
          kind: string
          last_change_on: string | null
          last_change_ref: string | null
          licence_id: string | null
          owner_person_id: string | null
          owner_role_id: string | null
          penalty_note: string
          recurrence: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          detail?: string
          due_on: string
          ends_on?: string | null
          entity_id?: string | null
          id?: string
          kind?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          licence_id?: string | null
          owner_person_id?: string | null
          owner_role_id?: string | null
          penalty_note?: string
          recurrence?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string
          due_on?: string
          ends_on?: string | null
          entity_id?: string | null
          id?: string
          kind?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          licence_id?: string | null
          owner_person_id?: string | null
          owner_role_id?: string | null
          penalty_note?: string
          recurrence?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_obligations_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_obligations_entity_fk"
            columns: ["client_id", "entity_id"]
            isOneToOne: false
            referencedRelation: "org_entities"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_obligations_licence_fk"
            columns: ["client_id", "licence_id"]
            isOneToOne: false
            referencedRelation: "org_licences"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_obligations_owner_person_fk"
            columns: ["client_id", "owner_person_id"]
            isOneToOne: false
            referencedRelation: "org_people"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_obligations_owner_role_fk"
            columns: ["client_id", "owner_role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_people: {
        Row: {
          archived_at: string | null
          client_id: string
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          id: string
          last_change_on: string | null
          last_change_ref: string | null
          location: string
          notes: string
          phone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          email?: string
          full_name: string
          id?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          location?: string
          notes?: string
          phone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          id?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          location?: string
          notes?: string
          phone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_people_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      org_process_steps: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          detail: string
          duration_days: number | null
          id: string
          owner_role_id: string | null
          position: number
          process_id: string
          source_page: number | null
          source_section: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          detail?: string
          duration_days?: number | null
          id?: string
          owner_role_id?: string | null
          position?: number
          process_id: string
          source_page?: number | null
          source_section?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string
          duration_days?: number | null
          id?: string
          owner_role_id?: string | null
          position?: number
          process_id?: string
          source_page?: number | null
          source_section?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_process_steps_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_process_steps_owner_fk"
            columns: ["client_id", "owner_role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_process_steps_process_fk"
            columns: ["client_id", "process_id"]
            isOneToOne: false
            referencedRelation: "org_processes"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_processes: {
        Row: {
          archived_at: string | null
          cadence: string
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          last_change_on: string | null
          last_change_ref: string | null
          name: string
          owner_role_id: string | null
          preset_id: string | null
          source_document_id: string | null
          status: string
          summary: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          cadence?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          name: string
          owner_role_id?: string | null
          preset_id?: string | null
          source_document_id?: string | null
          status?: string
          summary?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          cadence?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          name?: string
          owner_role_id?: string | null
          preset_id?: string | null
          source_document_id?: string | null
          status?: string
          summary?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_processes_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_processes_owner_fk"
            columns: ["client_id", "owner_role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_processes_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "flow_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_processes_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      org_record_documents: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          document_id: string
          id: string
          note: string
          page: number | null
          record_id: string
          record_type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          document_id: string
          id?: string
          note?: string
          page?: number | null
          record_id: string
          record_type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          document_id?: string
          id?: string
          note?: string
          page?: number | null
          record_id?: string
          record_type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_record_documents_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_record_documents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      org_responsibilities: {
        Row: {
          area: string
          client_id: string
          created_at: string
          created_by: string | null
          deputy_role_id: string | null
          detail: string
          id: string
          last_change_on: string | null
          last_change_ref: string | null
          position: number
          role_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          area: string
          client_id: string
          created_at?: string
          created_by?: string | null
          deputy_role_id?: string | null
          detail?: string
          id?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          position?: number
          role_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          area?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          deputy_role_id?: string | null
          detail?: string
          id?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          position?: number
          role_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_responsibilities_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_responsibilities_deputy_fk"
            columns: ["client_id", "deputy_role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_responsibilities_role_fk"
            columns: ["client_id", "role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_role_lines: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          note: string
          role_id: string
          to_role_id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          role_id: string
          to_role_id: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          role_id?: string
          to_role_id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_role_lines_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_role_lines_role_fk"
            columns: ["client_id", "role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_role_lines_to_fk"
            columns: ["client_id", "to_role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_roles: {
        Row: {
          acting: boolean
          client_id: string
          cover_note: string
          cover_role_id: string | null
          created_at: string
          created_by: string | null
          effective_from: string | null
          effective_to: string | null
          entity_id: string | null
          function_name: string
          holder_person_id: string | null
          id: string
          kind: string
          kind_label: string
          last_change_on: string | null
          last_change_ref: string | null
          parent_role_id: string | null
          position: number
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          acting?: boolean
          client_id: string
          cover_note?: string
          cover_role_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          entity_id?: string | null
          function_name?: string
          holder_person_id?: string | null
          id?: string
          kind?: string
          kind_label?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          parent_role_id?: string | null
          position?: number
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          acting?: boolean
          client_id?: string
          cover_note?: string
          cover_role_id?: string | null
          created_at?: string
          created_by?: string | null
          effective_from?: string | null
          effective_to?: string | null
          entity_id?: string | null
          function_name?: string
          holder_person_id?: string | null
          id?: string
          kind?: string
          kind_label?: string
          last_change_on?: string | null
          last_change_ref?: string | null
          parent_role_id?: string | null
          position?: number
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_roles_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "org_roles_cover_fk"
            columns: ["client_id", "cover_role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_roles_entity_fk"
            columns: ["client_id", "entity_id"]
            isOneToOne: false
            referencedRelation: "org_entities"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_roles_holder_fk"
            columns: ["client_id", "holder_person_id"]
            isOneToOne: false
            referencedRelation: "org_people"
            referencedColumns: ["client_id", "id"]
          },
          {
            foreignKeyName: "org_roles_parent_fk"
            columns: ["client_id", "parent_role_id"]
            isOneToOne: false
            referencedRelation: "org_roles"
            referencedColumns: ["client_id", "id"]
          },
        ]
      }
      org_structure_changes: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          detail: string
          id: string
          position: number
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          detail?: string
          id?: string
          position?: number
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          detail?: string
          id?: string
          position?: number
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_structure_changes_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
        ]
      }
      plan_entries: {
        Row: {
          archived_at: string | null
          body: string
          created_at: string
          created_by: string
          for_date: string | null
          id: string
          made_tasks: Json
          scope: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          created_at?: string
          created_by?: string
          for_date?: string | null
          id?: string
          made_tasks?: Json
          scope?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          created_at?: string
          created_by?: string
          for_date?: string | null
          id?: string
          made_tasks?: Json
          scope?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          granted_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "platform_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      playbook_rules: {
        Row: {
          acceptable: string | null
          approval_threshold: string | null
          approved_clause_text: string | null
          category: string | null
          commercial_rationale: string | null
          created_at: string
          escalate: string | null
          fallback: string | null
          id: string
          internal_note: string | null
          jurisdiction_note: string | null
          legal_rationale: string | null
          negotiation_guidance: string | null
          ordinal: number
          owner_id: string | null
          owner_name: string | null
          playbook_id: string
          preferred: string | null
          redflag: string | null
          risk_level: string | null
          suggestion_note: string | null
          topic: string
          updated_at: string
          usage_note: string | null
        }
        Insert: {
          acceptable?: string | null
          approval_threshold?: string | null
          approved_clause_text?: string | null
          category?: string | null
          commercial_rationale?: string | null
          created_at?: string
          escalate?: string | null
          fallback?: string | null
          id?: string
          internal_note?: string | null
          jurisdiction_note?: string | null
          legal_rationale?: string | null
          negotiation_guidance?: string | null
          ordinal?: number
          owner_id?: string | null
          owner_name?: string | null
          playbook_id: string
          preferred?: string | null
          redflag?: string | null
          risk_level?: string | null
          suggestion_note?: string | null
          topic: string
          updated_at?: string
          usage_note?: string | null
        }
        Update: {
          acceptable?: string | null
          approval_threshold?: string | null
          approved_clause_text?: string | null
          category?: string | null
          commercial_rationale?: string | null
          created_at?: string
          escalate?: string | null
          fallback?: string | null
          id?: string
          internal_note?: string | null
          jurisdiction_note?: string | null
          legal_rationale?: string | null
          negotiation_guidance?: string | null
          ordinal?: number
          owner_id?: string | null
          owner_name?: string | null
          playbook_id?: string
          preferred?: string | null
          redflag?: string | null
          risk_level?: string | null
          suggestion_note?: string | null
          topic?: string
          updated_at?: string
          usage_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "playbook_rules_playbook_id_fkey"
            columns: ["playbook_id"]
            isOneToOne: false
            referencedRelation: "playbooks"
            referencedColumns: ["id"]
          },
        ]
      }
      playbooks: {
        Row: {
          agreement_type: string | null
          approval: Database["public"]["Enums"]["approval_status"]
          approved_at: string | null
          approved_by: string | null
          approvers: string[]
          archived_at: string | null
          content_changed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          effective_date: string | null
          id: string
          jurisdiction: string | null
          last_reviewed_at: string | null
          name: string
          our_role: string | null
          owner_id: string | null
          status: Database["public"]["Enums"]["playbook_status"]
          team: string | null
          updated_at: string
          version_label: string | null
          visibility: Database["public"]["Enums"]["knowledge_visibility"]
          workspace_id: string
        }
        Insert: {
          agreement_type?: string | null
          approval?: Database["public"]["Enums"]["approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          approvers?: string[]
          archived_at?: string | null
          content_changed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          effective_date?: string | null
          id?: string
          jurisdiction?: string | null
          last_reviewed_at?: string | null
          name: string
          our_role?: string | null
          owner_id?: string | null
          status?: Database["public"]["Enums"]["playbook_status"]
          team?: string | null
          updated_at?: string
          version_label?: string | null
          visibility?: Database["public"]["Enums"]["knowledge_visibility"]
          workspace_id: string
        }
        Update: {
          agreement_type?: string | null
          approval?: Database["public"]["Enums"]["approval_status"]
          approved_at?: string | null
          approved_by?: string | null
          approvers?: string[]
          archived_at?: string | null
          content_changed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          effective_date?: string | null
          id?: string
          jurisdiction?: string | null
          last_reviewed_at?: string | null
          name?: string
          our_role?: string | null
          owner_id?: string | null
          status?: Database["public"]["Enums"]["playbook_status"]
          team?: string | null
          updated_at?: string
          version_label?: string | null
          visibility?: Database["public"]["Enums"]["knowledge_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playbooks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      precedents: {
        Row: {
          agreement_type: string | null
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          body: string
          clause_id: string | null
          clause_type: string | null
          content_changed_at: string | null
          counterparty_type: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          id: string
          jurisdiction: string | null
          kind: string
          matter_id: string | null
          our_role: string | null
          owner_id: string | null
          playbook_rule_id: string | null
          sector: string | null
          source_kind: string | null
          source_note: string | null
          status: string
          superseded_by: string | null
          title: string
          updated_at: string
          used_at: string | null
          visibility: Database["public"]["Enums"]["knowledge_visibility"]
          why_useful: string | null
          workspace_id: string
        }
        Insert: {
          agreement_type?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          body: string
          clause_id?: string | null
          clause_type?: string | null
          content_changed_at?: string | null
          counterparty_type?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          jurisdiction?: string | null
          kind?: string
          matter_id?: string | null
          our_role?: string | null
          owner_id?: string | null
          playbook_rule_id?: string | null
          sector?: string | null
          source_kind?: string | null
          source_note?: string | null
          status?: string
          superseded_by?: string | null
          title: string
          updated_at?: string
          used_at?: string | null
          visibility?: Database["public"]["Enums"]["knowledge_visibility"]
          why_useful?: string | null
          workspace_id: string
        }
        Update: {
          agreement_type?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          body?: string
          clause_id?: string | null
          clause_type?: string | null
          content_changed_at?: string | null
          counterparty_type?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          jurisdiction?: string | null
          kind?: string
          matter_id?: string | null
          our_role?: string | null
          owner_id?: string | null
          playbook_rule_id?: string | null
          sector?: string | null
          source_kind?: string | null
          source_note?: string | null
          status?: string
          superseded_by?: string | null
          title?: string
          updated_at?: string
          used_at?: string | null
          visibility?: Database["public"]["Enums"]["knowledge_visibility"]
          why_useful?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "precedents_clause_id_fkey"
            columns: ["clause_id"]
            isOneToOne: false
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precedents_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precedents_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precedents_playbook_rule_id_fkey"
            columns: ["playbook_rule_id"]
            isOneToOne: false
            referencedRelation: "playbook_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precedents_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "precedents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "precedents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          agreement_types: string[]
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          jurisdiction: string | null
          notifications_seen_at: string | null
          onboarded_at: string | null
          org_name: string | null
          role_title: string | null
          updated_at: string
          use_case: string | null
        }
        Insert: {
          agreement_types?: string[]
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          jurisdiction?: string | null
          notifications_seen_at?: string | null
          onboarded_at?: string | null
          org_name?: string | null
          role_title?: string | null
          updated_at?: string
          use_case?: string | null
        }
        Update: {
          agreement_types?: string[]
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          jurisdiction?: string | null
          notifications_seen_at?: string | null
          onboarded_at?: string | null
          org_name?: string | null
          role_title?: string | null
          updated_at?: string
          use_case?: string | null
        }
        Relationships: []
      }
      research_assumptions: {
        Row: {
          assumption: string
          created_at: string
          id: string
          ordinal: number
          research_matter_id: string
          risk: string
          state: string
          why: string
        }
        Insert: {
          assumption?: string
          created_at?: string
          id?: string
          ordinal: number
          research_matter_id: string
          risk?: string
          state?: string
          why?: string
        }
        Update: {
          assumption?: string
          created_at?: string
          id?: string
          ordinal?: number
          research_matter_id?: string
          risk?: string
          state?: string
          why?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_assumptions_research_matter_id_fkey"
            columns: ["research_matter_id"]
            isOneToOne: false
            referencedRelation: "research_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      research_authorities: {
        Row: {
          added_by: string
          cite: string
          cite_date: string
          created_at: string
          held: string
          id: string
          issue_nos: string
          kind: string
          n: number
          note: string
          research_matter_id: string
          sections: Json
          source: string
          status: string
          tier: string
          url: string
          weight: string
        }
        Insert: {
          added_by?: string
          cite: string
          cite_date?: string
          created_at?: string
          held?: string
          id?: string
          issue_nos?: string
          kind?: string
          n: number
          note?: string
          research_matter_id: string
          sections?: Json
          source?: string
          status?: string
          tier?: string
          url?: string
          weight?: string
        }
        Update: {
          added_by?: string
          cite?: string
          cite_date?: string
          created_at?: string
          held?: string
          id?: string
          issue_nos?: string
          kind?: string
          n?: number
          note?: string
          research_matter_id?: string
          sections?: Json
          source?: string
          status?: string
          tier?: string
          url?: string
          weight?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_authorities_research_matter_id_fkey"
            columns: ["research_matter_id"]
            isOneToOne: false
            referencedRelation: "research_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      research_documents: {
        Row: {
          bytes: number
          created_at: string
          id: string
          kind: string
          mime_type: string
          name: string
          note: string
          research_matter_id: string
          storage_path: string
          uploaded_by: string | null
          workspace_id: string
        }
        Insert: {
          bytes?: number
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string
          name: string
          note?: string
          research_matter_id: string
          storage_path: string
          uploaded_by?: string | null
          workspace_id: string
        }
        Update: {
          bytes?: number
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string
          name?: string
          note?: string
          research_matter_id?: string
          storage_path?: string
          uploaded_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_documents_research_matter_id_fkey"
            columns: ["research_matter_id"]
            isOneToOne: false
            referencedRelation: "research_matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_documents_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      research_facts: {
        Row: {
          classification: string
          confidence: string
          created_at: string
          fact: string
          id: string
          issue_refs: string
          ordinal: number
          ref: string
          research_matter_id: string
          source: string
        }
        Insert: {
          classification?: string
          confidence?: string
          created_at?: string
          fact?: string
          id?: string
          issue_refs?: string
          ordinal: number
          ref?: string
          research_matter_id: string
          source?: string
        }
        Update: {
          classification?: string
          confidence?: string
          created_at?: string
          fact?: string
          id?: string
          issue_refs?: string
          ordinal?: number
          ref?: string
          research_matter_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_facts_research_matter_id_fkey"
            columns: ["research_matter_id"]
            isOneToOne: false
            referencedRelation: "research_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      research_findings: {
        Row: {
          cites: number[]
          created_at: string
          id: string
          issue_no: string
          ordinal: number
          research_matter_id: string
          text: string
        }
        Insert: {
          cites?: number[]
          created_at?: string
          id?: string
          issue_no?: string
          ordinal: number
          research_matter_id: string
          text?: string
        }
        Update: {
          cites?: number[]
          created_at?: string
          id?: string
          issue_no?: string
          ordinal?: number
          research_matter_id?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_findings_research_matter_id_fkey"
            columns: ["research_matter_id"]
            isOneToOne: false
            referencedRelation: "research_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      research_issues: {
        Row: {
          answer: string
          application: string
          assignee: string
          authority: string
          conclusion: string
          confidence: string
          counterpoint: string
          created_at: string
          done: boolean
          id: string
          in_report: boolean
          jurisdiction: string
          no: string
          ordinal: number
          position_label: string
          priority: string
          question: string
          reasoning: string
          research_matter_id: string
          research_status: string
          risk: string
          rule: string
          short: string
          state: string
        }
        Insert: {
          answer?: string
          application?: string
          assignee?: string
          authority?: string
          conclusion?: string
          confidence?: string
          counterpoint?: string
          created_at?: string
          done?: boolean
          id?: string
          in_report?: boolean
          jurisdiction?: string
          no?: string
          ordinal: number
          position_label?: string
          priority?: string
          question?: string
          reasoning?: string
          research_matter_id: string
          research_status?: string
          risk?: string
          rule?: string
          short?: string
          state?: string
        }
        Update: {
          answer?: string
          application?: string
          assignee?: string
          authority?: string
          conclusion?: string
          confidence?: string
          counterpoint?: string
          created_at?: string
          done?: boolean
          id?: string
          in_report?: boolean
          jurisdiction?: string
          no?: string
          ordinal?: number
          position_label?: string
          priority?: string
          question?: string
          reasoning?: string
          research_matter_id?: string
          research_status?: string
          risk?: string
          rule?: string
          short?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_issues_research_matter_id_fkey"
            columns: ["research_matter_id"]
            isOneToOne: false
            referencedRelation: "research_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      research_matters: {
        Row: {
          analysis_format: string
          archived_at: string | null
          area_of_law: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deliverable_sections: Json
          depth: string
          draft_rejected: boolean
          has_answer: boolean
          id: string
          instructions: string
          jurisdiction: string
          kind: Database["public"]["Enums"]["research_kind"]
          law_as_at: string
          legacy_id: string | null
          linked_clause: string
          matter_id: string | null
          memo_intro: string
          memo_intro_doc: Json | null
          memo_style: string
          memo_title: string
          output_kind: string
          plan: Json
          question: string
          report_approval_sent: boolean
          report_approved_at: string
          report_draft: Database["public"]["Enums"]["research_draft_state"]
          report_locked: boolean
          report_track: boolean
          report_version: string
          selected_authority: number | null
          selected_issue: number
          short_answer: string
          since_filter: string
          source_clause_id: string | null
          source_issue_id: string | null
          sources: string
          title: string
          topic: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          analysis_format?: string
          archived_at?: string | null
          area_of_law?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deliverable_sections?: Json
          depth?: string
          draft_rejected?: boolean
          has_answer?: boolean
          id?: string
          instructions?: string
          jurisdiction?: string
          kind: Database["public"]["Enums"]["research_kind"]
          law_as_at?: string
          legacy_id?: string | null
          linked_clause?: string
          matter_id?: string | null
          memo_intro?: string
          memo_intro_doc?: Json | null
          memo_style?: string
          memo_title?: string
          output_kind?: string
          plan?: Json
          question?: string
          report_approval_sent?: boolean
          report_approved_at?: string
          report_draft?: Database["public"]["Enums"]["research_draft_state"]
          report_locked?: boolean
          report_track?: boolean
          report_version?: string
          selected_authority?: number | null
          selected_issue?: number
          short_answer?: string
          since_filter?: string
          source_clause_id?: string | null
          source_issue_id?: string | null
          sources?: string
          title: string
          topic?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          analysis_format?: string
          archived_at?: string | null
          area_of_law?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deliverable_sections?: Json
          depth?: string
          draft_rejected?: boolean
          has_answer?: boolean
          id?: string
          instructions?: string
          jurisdiction?: string
          kind?: Database["public"]["Enums"]["research_kind"]
          law_as_at?: string
          legacy_id?: string | null
          linked_clause?: string
          matter_id?: string | null
          memo_intro?: string
          memo_intro_doc?: Json | null
          memo_style?: string
          memo_title?: string
          output_kind?: string
          plan?: Json
          question?: string
          report_approval_sent?: boolean
          report_approved_at?: string
          report_draft?: Database["public"]["Enums"]["research_draft_state"]
          report_locked?: boolean
          report_track?: boolean
          report_version?: string
          selected_authority?: number | null
          selected_issue?: number
          short_answer?: string
          since_filter?: string
          source_clause_id?: string | null
          source_issue_id?: string | null
          sources?: string
          title?: string
          topic?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_matters_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_matters_source_clause_id_fkey"
            columns: ["source_clause_id"]
            isOneToOne: false
            referencedRelation: "clauses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_matters_source_issue_id_fkey"
            columns: ["source_issue_id"]
            isOneToOne: false
            referencedRelation: "contract_issues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_matters_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      research_memo_sections: {
        Row: {
          body: string
          cites: number[]
          created_at: string
          doc: Json | null
          id: string
          no: string
          ordinal: number
          research_matter_id: string
          title: string
        }
        Insert: {
          body?: string
          cites?: number[]
          created_at?: string
          doc?: Json | null
          id?: string
          no?: string
          ordinal: number
          research_matter_id: string
          title?: string
        }
        Update: {
          body?: string
          cites?: number[]
          created_at?: string
          doc?: Json | null
          id?: string
          no?: string
          ordinal?: number
          research_matter_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_memo_sections_research_matter_id_fkey"
            columns: ["research_matter_id"]
            isOneToOne: false
            referencedRelation: "research_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      research_pins: {
        Row: {
          authority_n: number
          created_at: string
          id: string
          note: string
          ordinal: number
          paragraph_index: number
          research_matter_id: string
          section_index: number
          text: string
        }
        Insert: {
          authority_n: number
          created_at?: string
          id?: string
          note?: string
          ordinal: number
          paragraph_index?: number
          research_matter_id: string
          section_index?: number
          text?: string
        }
        Update: {
          authority_n?: number
          created_at?: string
          id?: string
          note?: string
          ordinal?: number
          paragraph_index?: number
          research_matter_id?: string
          section_index?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_pins_research_matter_id_fkey"
            columns: ["research_matter_id"]
            isOneToOne: false
            referencedRelation: "research_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      research_risks: {
        Row: {
          action: string
          created_at: string
          due: string
          id: string
          impact: string
          issue: string
          likelihood: string
          mitigation: string
          ordinal: number
          owner: string
          priority: string
          rating: string
          rating_override: string | null
          research_matter_id: string
          status: string
          title: string
        }
        Insert: {
          action?: string
          created_at?: string
          due?: string
          id?: string
          impact?: string
          issue?: string
          likelihood?: string
          mitigation?: string
          ordinal: number
          owner?: string
          priority?: string
          rating?: string
          rating_override?: string | null
          research_matter_id: string
          status?: string
          title?: string
        }
        Update: {
          action?: string
          created_at?: string
          due?: string
          id?: string
          impact?: string
          issue?: string
          likelihood?: string
          mitigation?: string
          ordinal?: number
          owner?: string
          priority?: string
          rating?: string
          rating_override?: string | null
          research_matter_id?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_risks_research_matter_id_fkey"
            columns: ["research_matter_id"]
            isOneToOne: false
            referencedRelation: "research_matters"
            referencedColumns: ["id"]
          },
        ]
      }
      resolution_sources: {
        Row: {
          created_at: string
          discussion_point_id: string
          id: string
          resolution_id: string
        }
        Insert: {
          created_at?: string
          discussion_point_id: string
          id?: string
          resolution_id: string
        }
        Update: {
          created_at?: string
          discussion_point_id?: string
          id?: string
          resolution_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resolution_sources_discussion_point_id_fkey"
            columns: ["discussion_point_id"]
            isOneToOne: false
            referencedRelation: "discussion_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "resolution_sources_resolution_id_fkey"
            columns: ["resolution_id"]
            isOneToOne: false
            referencedRelation: "resolutions"
            referencedColumns: ["id"]
          },
        ]
      }
      resolutions: {
        Row: {
          created_at: string
          id: string
          matter_id: string
          ordinal: number
          owner_id: string | null
          owner_name: string | null
          playbook_detail: string | null
          playbook_verdict: Database["public"]["Enums"]["verdict"] | null
          source: Database["public"]["Enums"]["analysis_source"]
          status: Database["public"]["Enums"]["resolution_status"]
          text: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          matter_id: string
          ordinal?: number
          owner_id?: string | null
          owner_name?: string | null
          playbook_detail?: string | null
          playbook_verdict?: Database["public"]["Enums"]["verdict"] | null
          source?: Database["public"]["Enums"]["analysis_source"]
          status?: Database["public"]["Enums"]["resolution_status"]
          text?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          matter_id?: string
          ordinal?: number
          owner_id?: string | null
          owner_name?: string | null
          playbook_detail?: string | null
          playbook_verdict?: Database["public"]["Enums"]["verdict"] | null
          source?: Database["public"]["Enums"]["analysis_source"]
          status?: Database["public"]["Enums"]["resolution_status"]
          text?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "resolutions_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          attachments: Json
          checklist: Json
          client_id: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          detail: string | null
          due_date: string | null
          email_draft: Json | null
          flow_deliverable_id: string | null
          id: string
          matter_id: string | null
          origin_id: string | null
          origin_kind: Database["public"]["Enums"]["source_kind"] | null
          output_id: string | null
          output_kind: string | null
          output_label: string | null
          planned_on: string | null
          priority: string
          status: Database["public"]["Enums"]["task_status"]
          tags: Json
          threads: Json
          title: string
          tool: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assignee_id?: string | null
          attachments?: Json
          checklist?: Json
          client_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          due_date?: string | null
          email_draft?: Json | null
          flow_deliverable_id?: string | null
          id?: string
          matter_id?: string | null
          origin_id?: string | null
          origin_kind?: Database["public"]["Enums"]["source_kind"] | null
          output_id?: string | null
          output_kind?: string | null
          output_label?: string | null
          planned_on?: string | null
          priority?: string
          status?: Database["public"]["Enums"]["task_status"]
          tags?: Json
          threads?: Json
          title: string
          tool?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assignee_id?: string | null
          attachments?: Json
          checklist?: Json
          client_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          detail?: string | null
          due_date?: string | null
          email_draft?: Json | null
          flow_deliverable_id?: string | null
          id?: string
          matter_id?: string | null
          origin_id?: string | null
          origin_kind?: Database["public"]["Enums"]["source_kind"] | null
          output_id?: string | null
          output_kind?: string | null
          output_label?: string | null
          planned_on?: string | null
          priority?: string
          status?: Database["public"]["Enums"]["task_status"]
          tags?: Json
          threads?: Json
          title?: string
          tool?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_client_fk"
            columns: ["workspace_id", "client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["workspace_id", "id"]
          },
          {
            foreignKeyName: "tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_flow_deliverable_id_fkey"
            columns: ["flow_deliverable_id"]
            isOneToOne: false
            referencedRelation: "flow_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          added_by: string | null
          created_at: string
          team_id: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          team_id: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
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
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          archived_at: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      template_sections: {
        Row: {
          body: string
          created_at: string
          guidance: string | null
          heading: string
          id: string
          optional: boolean
          ordinal: number
          template_id: string
          updated_at: string
        }
        Insert: {
          body?: string
          created_at?: string
          guidance?: string | null
          heading: string
          id?: string
          optional?: boolean
          ordinal?: number
          template_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          guidance?: string | null
          heading?: string
          id?: string
          optional?: boolean
          ordinal?: number
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_sections_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          content_changed_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          doc_type: string
          id: string
          jurisdiction: string | null
          name: string
          owner_id: string | null
          status: Database["public"]["Enums"]["template_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["knowledge_visibility"]
          workspace_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          content_changed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          doc_type: string
          id?: string
          jurisdiction?: string | null
          name: string
          owner_id?: string | null
          status?: Database["public"]["Enums"]["template_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["knowledge_visibility"]
          workspace_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          content_changed_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          doc_type?: string
          id?: string
          jurisdiction?: string | null
          name?: string
          owner_id?: string | null
          status?: Database["public"]["Enums"]["template_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["knowledge_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          activity_code: string
          billable: boolean
          created_at: string
          id: string
          matter_id: string | null
          minutes: number
          narrative: string
          source: string
          subject_id: string
          subject_kind: string
          user_id: string
          worked_on: string
          workspace_id: string
        }
        Insert: {
          activity_code?: string
          billable?: boolean
          created_at?: string
          id?: string
          matter_id?: string | null
          minutes: number
          narrative?: string
          source?: string
          subject_id: string
          subject_kind: string
          user_id?: string
          worked_on?: string
          workspace_id: string
        }
        Update: {
          activity_code?: string
          billable?: boolean
          created_at?: string
          id?: string
          matter_id?: string | null
          minutes?: number
          narrative?: string
          source?: string
          subject_id?: string
          subject_kind?: string
          user_id?: string
          worked_on?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      time_sessions: {
        Row: {
          beat_at: string
          created_at: string
          ended_at: string | null
          entry_id: string | null
          id: string
          label: string
          running_since: string | null
          seconds: number
          started_at: string
          subject_id: string
          subject_kind: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          beat_at?: string
          created_at?: string
          ended_at?: string | null
          entry_id?: string | null
          id?: string
          label?: string
          running_since?: string | null
          seconds?: number
          started_at?: string
          subject_id: string
          subject_kind: string
          user_id?: string
          workspace_id: string
        }
        Update: {
          beat_at?: string
          created_at?: string
          ended_at?: string | null
          entry_id?: string | null
          id?: string
          label?: string
          running_since?: string | null
          seconds?: number
          started_at?: string
          subject_id?: string
          subject_kind?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_sessions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "time_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_insights: {
        Row: {
          attribution_material: boolean
          category: string
          created_at: string
          detail: string | null
          discussion_point_id: string | null
          due_text: string | null
          excerpt: string | null
          id: string
          kind: string | null
          ordinal: number
          point_ids: string[]
          reported: boolean
          review_state: string
          reviewed_at: string | null
          reviewed_by: string | null
          roles: Json
          run_id: string | null
          source: Database["public"]["Enums"]["analysis_source"]
          substance_confidence: string
          task_id: string | null
          title: string
          transcript_id: string
          unit_ids: string[]
          updated_at: string
        }
        Insert: {
          attribution_material?: boolean
          category: string
          created_at?: string
          detail?: string | null
          discussion_point_id?: string | null
          due_text?: string | null
          excerpt?: string | null
          id?: string
          kind?: string | null
          ordinal?: number
          point_ids?: string[]
          reported?: boolean
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          roles?: Json
          run_id?: string | null
          source?: Database["public"]["Enums"]["analysis_source"]
          substance_confidence?: string
          task_id?: string | null
          title: string
          transcript_id: string
          unit_ids?: string[]
          updated_at?: string
        }
        Update: {
          attribution_material?: boolean
          category?: string
          created_at?: string
          detail?: string | null
          discussion_point_id?: string | null
          due_text?: string | null
          excerpt?: string | null
          id?: string
          kind?: string | null
          ordinal?: number
          point_ids?: string[]
          reported?: boolean
          review_state?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          roles?: Json
          run_id?: string | null
          source?: Database["public"]["Enums"]["analysis_source"]
          substance_confidence?: string
          task_id?: string | null
          title?: string
          transcript_id?: string
          unit_ids?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_insights_discussion_point_id_fkey"
            columns: ["discussion_point_id"]
            isOneToOne: false
            referencedRelation: "discussion_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_insights_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_insights_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcript_insights_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      transcript_units: {
        Row: {
          created_at: string
          episode: string
          id: string
          ordinal: number
          point_ids: string[]
          run_id: string | null
          speaker: Json
          text: string
          transcript_id: string
          voice: string
        }
        Insert: {
          created_at?: string
          episode?: string
          id?: string
          ordinal?: number
          point_ids?: string[]
          run_id?: string | null
          speaker?: Json
          text: string
          transcript_id: string
          voice?: string
        }
        Update: {
          created_at?: string
          episode?: string
          id?: string
          ordinal?: number
          point_ids?: string[]
          run_id?: string | null
          speaker?: Json
          text?: string
          transcript_id?: string
          voice?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcript_units_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      transcripts: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attribution: string | null
          created_at: string
          distill_error: string | null
          distill_run: string | null
          distill_status: string
          distilled_at: string | null
          document_id: string | null
          duration_minutes: number | null
          episodes: Json
          id: string
          matter_id: string
          meeting_date: string | null
          meeting_kind: string
          meeting_title: string | null
          participants: Json
          source_label: string | null
          speaker_count: number | null
          speaker_map: Json
          summary: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attribution?: string | null
          created_at?: string
          distill_error?: string | null
          distill_run?: string | null
          distill_status?: string
          distilled_at?: string | null
          document_id?: string | null
          duration_minutes?: number | null
          episodes?: Json
          id?: string
          matter_id: string
          meeting_date?: string | null
          meeting_kind?: string
          meeting_title?: string | null
          participants?: Json
          source_label?: string | null
          speaker_count?: number | null
          speaker_map?: Json
          summary?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attribution?: string | null
          created_at?: string
          distill_error?: string | null
          distill_run?: string | null
          distill_status?: string
          distilled_at?: string | null
          document_id?: string | null
          duration_minutes?: number | null
          episodes?: Json
          id?: string
          matter_id?: string
          meeting_date?: string | null
          meeting_kind?: string
          meeting_title?: string | null
          participants?: Json
          source_label?: string | null
          speaker_count?: number | null
          speaker_map?: Json
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
        ]
      }
      work_reports: {
        Row: {
          created_at: string
          day: string
          entries: Json
          generated_at: string
          id: string
          note: string | null
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          day: string
          entries?: Json
          generated_at?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          day?: string
          entries?: Json
          generated_at?: string
          id?: string
          note?: string | null
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_reports_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          matter_id: string | null
          matter_role: Database["public"]["Enums"]["matter_role"] | null
          role: Database["public"]["Enums"]["app_role"]
          scope: string
          status: Database["public"]["Enums"]["invite_status"]
          token: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          matter_id?: string | null
          matter_role?: Database["public"]["Enums"]["matter_role"] | null
          role?: Database["public"]["Enums"]["app_role"]
          scope?: string
          status?: Database["public"]["Enums"]["invite_status"]
          token: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          matter_id?: string | null
          matter_role?: Database["public"]["Enums"]["matter_role"] | null
          role?: Database["public"]["Enums"]["app_role"]
          scope?: string
          status?: Database["public"]["Enums"]["invite_status"]
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_matter_id_fkey"
            columns: ["matter_id"]
            isOneToOne: false
            referencedRelation: "matters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_invites_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["workspace_kind"]
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["workspace_kind"]
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["workspace_kind"]
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_fresh_contract: {
        Args: {
          _agreement_type: string
          _clauses: Json
          _governing_law: string
          _matter_id: string
          _matter_name: string
          _workspace_id: string
        }
        Returns: Json
      }
      accept_workspace_invite: { Args: { p_token: string }; Returns: string }
      actor_label: { Args: never; Returns: string }
      add_matter_member: {
        Args: {
          p_matter: string
          p_role?: Database["public"]["Enums"]["matter_role"]
          p_user: string
        }
        Returns: undefined
      }
      add_team_member: {
        Args: { _team: string; _user: string }
        Returns: undefined
      }
      admin_overview: { Args: never; Returns: Json }
      admin_people: { Args: never; Returns: Json }
      admin_usage: { Args: { since: string }; Returns: Json }
      approve_knowledge: { Args: { _id: string; _kind: string }; Returns: Json }
      assign_work: { Args: { _task: string; _to: string }; Returns: undefined }
      audit_event_visible: {
        Args: {
          _actor: string
          _entity_id: string
          _entity_type: string
          _event: string
          _matter: string
          _research: string
          _workspace: string
        }
        Returns: boolean
      }
      bootstrap_current_user: { Args: never; Returns: undefined }
      bootstrap_user: {
        Args: {
          _avatar_url: string
          _email: string
          _full_name: string
          _user_id: string
        }
        Returns: undefined
      }
      break_clause_lease: {
        Args: { _clause: string }
        Returns: {
          expires_at: string
          holder: string
          holder_name: string
          taken: boolean
        }[]
      }
      can_admin_workspace: { Args: { _workspace_id: string }; Returns: boolean }
      can_approve_knowledge: {
        Args: { _id: string; _kind: string }
        Returns: boolean
      }
      can_approve_marketing: { Args: { _client: string }; Returns: boolean }
      can_move_review: { Args: { _approval: string }; Returns: boolean }
      can_read_manuscript: { Args: { _id: string }; Returns: boolean }
      can_read_storage_path: { Args: { _name: string }; Returns: boolean }
      can_review_matter: { Args: { _matter_id: string }; Returns: boolean }
      can_see_library_source: { Args: { _source: string }; Returns: boolean }
      can_see_marketing: { Args: { _client: string }; Returns: boolean }
      can_settle_change: {
        Args: { _change_author: string; _clause: string }
        Returns: boolean
      }
      can_use_knowledge: {
        Args: { _id: string; _kind: string }
        Returns: boolean
      }
      can_write_clause: { Args: { _clause_id: string }; Returns: boolean }
      can_write_deliverable: {
        Args: { _deliverable_id: string }
        Returns: boolean
      }
      can_write_flow: { Args: { _flow_id: string }; Returns: boolean }
      can_write_knowledge: {
        Args: { _id: string; _kind: string }
        Returns: boolean
      }
      can_write_manuscript: { Args: { _id: string }; Returns: boolean }
      can_write_matter: { Args: { _matter_id: string }; Returns: boolean }
      can_write_research: { Args: { _research_id: string }; Returns: boolean }
      can_write_storage_path: { Args: { _name: string }; Returns: boolean }
      can_write_workspace: { Args: { _workspace_id: string }; Returns: boolean }
      clause_baseline: { Args: { _clause: string }; Returns: Json }
      clause_context: {
        Args: { _authors?: string[]; _clause: string }
        Returns: {
          matter_id: string
          may_break: boolean
          may_edit: boolean
          settleable: string[]
        }[]
      }
      clause_lease: {
        Args: { _clause: string }
        Returns: {
          expires_at: string
          holder: string
          holder_name: string
          is_mine: boolean
          since: string
        }[]
      }
      clause_matter: { Args: { _clause_id: string }; Returns: string }
      clause_revision_doc: { Args: { _revision: string }; Returns: Json }
      clause_revision_list: {
        Args: { _clause: string }
        Returns: {
          created_at: string
          created_by: string
          created_by_name: string
          id: string
          kind: string
          label: string
          note: string
        }[]
      }
      comment_matter: { Args: { _id: string; _kind: string }; Returns: string }
      create_firm_workspace: { Args: { p_name: string }; Returns: string }
      create_team: {
        Args: { _name: string; _workspace: string }
        Returns: string
      }
      create_workspace_invite: {
        Args: {
          p_email: string
          p_role?: Database["public"]["Enums"]["app_role"]
          p_workspace: string
        }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          matter_id: string | null
          matter_role: Database["public"]["Enums"]["matter_role"] | null
          role: Database["public"]["Enums"]["app_role"]
          scope: string
          status: Database["public"]["Enums"]["invite_status"]
          token: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decline_work: {
        Args: { _reason: string; _task: string }
        Returns: undefined
      }
      deliverable_matter: { Args: { _deliverable_id: string }; Returns: string }
      doc_change_marks: {
        Args: { _doc: Json }
        Returns: {
          author_id: string
          change_id: string
          kind: string
        }[]
      }
      entity_owner: { Args: { _id: string; _kind: string }; Returns: string }
      events_involving_me: {
        Args: { _limit?: number }
        Returns: {
          actor_id: string
          actor_name: string
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          is_new: boolean
          matter_id: string
          summary: string
        }[]
      }
      flow_matter: { Args: { _flow_id: string }; Returns: string }
      has_workspace_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _workspace_id: string
        }
        Returns: boolean
      }
      insert_clause: {
        Args: { _after: string; _matter: string; _num: string; _title: string }
        Returns: string
      }
      is_clause_member: { Args: { _clause_id: string }; Returns: boolean }
      is_client_owner: { Args: { _client: string }; Returns: boolean }
      is_deliverable_member: {
        Args: { _deliverable_id: string }
        Returns: boolean
      }
      is_flow_member: { Args: { _flow_id: string }; Returns: boolean }
      is_matter_lead: { Args: { _matter_id: string }; Returns: boolean }
      is_matter_member: { Args: { _matter_id: string }; Returns: boolean }
      is_platform_admin: { Args: { _user_id?: string }; Returns: boolean }
      is_research_member: { Args: { _research_id: string }; Returns: boolean }
      is_team_member: { Args: { _team: string }; Returns: boolean }
      is_workspace_member: { Args: { _workspace_id: string }; Returns: boolean }
      keep_clause_revision: {
        Args: {
          _clause: string
          _kind?: string
          _label?: string
          _note?: string
        }
        Returns: string
      }
      knowledge_approved: {
        Args: { _approved_at: string; _content_changed_at: string }
        Returns: boolean
      }
      knowledge_context: {
        Args: { _id: string; _kind: string }
        Returns: {
          approved: boolean
          is_owner: boolean
          may_approve: boolean
          may_write: boolean
          shared_with: number
          visibility: Database["public"]["Enums"]["knowledge_visibility"]
        }[]
      }
      knowledge_owner: { Args: { _id: string; _kind: string }; Returns: string }
      knowledge_visible: {
        Args: {
          _id: string
          _kind: string
          _owner: string
          _visibility: Database["public"]["Enums"]["knowledge_visibility"]
          _workspace: string
        }
        Returns: boolean
      }
      knowledge_workspace: {
        Args: { _id: string; _kind: string }
        Returns: string
      }
      learning_course_readable: { Args: { p_course: string }; Returns: boolean }
      learning_course_writable: { Args: { p_course: string }; Returns: boolean }
      mark_mentions_seen: { Args: { p_matter: string }; Returns: undefined }
      mark_notifications_seen: { Args: never; Returns: undefined }
      marketing_level: { Args: { _client: string }; Returns: string }
      matter_clause_context: {
        Args: { _authors?: string[]; _matter: string }
        Returns: {
          clause_id: string
          may_break: boolean
          may_edit: boolean
          settleable: string[]
        }[]
      }
      matter_move_preview: {
        Args: { _matter: string; _to: string }
        Returns: {
          capped_names: string[]
          documents: number
          flows: number
          from_name: string
          from_workspace: string
          notes: number
          released_names: string[]
          reviews: number
          tasks: number
          to_name: string
        }[]
      }
      matter_presence: {
        Args: { _matter: string }
        Returns: {
          clause_id: string
          clause_num: string
          expires_at: string
          name: string
          since: string
          user_id: string
        }[]
      }
      matter_register: {
        Args: { p_workspace: string }
        Returns: {
          archived: boolean
          binned: boolean
          client: string
          lead_name: string
          member_count: number
          name: string
          reference: string
        }[]
      }
      matter_stragglers: {
        Args: { _matter: string }
        Returns: {
          relation: string
          rows: number
        }[]
      }
      matter_workspace: { Args: { _matter_id: string }; Returns: string }
      matters_with_unseen_mentions: { Args: never; Returns: string[] }
      mkt_content_checks: {
        Args: { _content: string }
        Returns: {
          check_key: string
          level: string
          reason: string
          title: string
        }[]
      }
      move_matter_to_workspace: {
        Args: { _matter: string; _to: string }
        Returns: Json
      }
      move_task_to_workspace: {
        Args: { _task: string; _to: string }
        Returns: Json
      }
      moving_matter: { Args: never; Returns: string }
      my_notifications_seen_at: { Args: never; Returns: string }
      my_pending_invites: {
        Args: never
        Returns: {
          expires_at: string
          firm_name: string
          invited_role: string
          token: string
        }[]
      }
      my_team_ids: { Args: never; Returns: string[] }
      new_invite_token: { Args: never; Returns: string }
      next_matter_reference: {
        Args: { ws: string; yr: number }
        Returns: string
      }
      peek_workspace_invite: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          invited_role: string
          status: string
          workspace_name: string
        }[]
      }
      phase_matter: { Args: { _phase_id: string }; Returns: string }
      playbook_workspace: { Args: { _playbook_id: string }; Returns: string }
      precedent_provenance: {
        Args: { _precedent: string }
        Returns: {
          clause_id: string
          derived: boolean
          document_id: string
          matter_id: string
          matter_name: string
          matter_reference: string
          may_see_source: boolean
          source_kind: string
          source_note: string
          used_at: string
        }[]
      }
      preview_team_staffing: {
        Args: { _matter: string; _team: string }
        Returns: {
          already_member: boolean
          existing_role: Database["public"]["Enums"]["matter_role"]
          name: string
          user_id: string
        }[]
      }
      purge_recently_deleted: { Args: never; Returns: number }
      recently_deleted_days: { Args: never; Returns: number }
      refresh_clause: { Args: { _clause: string }; Returns: string }
      release_clause: { Args: { _clause: string }; Returns: undefined }
      remove_matter_member: {
        Args: { p_matter: string; p_user: string }
        Returns: undefined
      }
      remove_team_member: {
        Args: { _team: string; _user: string }
        Returns: undefined
      }
      rename_team: {
        Args: { _name: string; _team: string }
        Returns: undefined
      }
      rename_workspace: {
        Args: { p_name: string; p_workspace: string }
        Returns: string
      }
      renumber_clauses: {
        Args: { p_changes: Json; p_matter: string; p_reset?: boolean }
        Returns: number
      }
      request_review: {
        Args: {
          _id: string
          _kind: string
          _reason?: string
          _reviewer: string
          _title: string
        }
        Returns: string
      }
      request_work: {
        Args: {
          _assignee: string
          _detail?: string
          _due?: string
          _matter: string
          _title: string
        }
        Returns: string
      }
      research_workspace: { Args: { _research_id: string }; Returns: string }
      resend_workspace_invite: {
        Args: { p_id: string }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          matter_id: string | null
          matter_role: Database["public"]["Enums"]["matter_role"] | null
          role: Database["public"]["Enums"]["app_role"]
          scope: string
          status: Database["public"]["Enums"]["invite_status"]
          token: string
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "workspace_invites"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      resolution_matter: { Args: { _resolution_id: string }; Returns: string }
      restore_clause_revision: {
        Args: { _note?: string; _revision: string }
        Returns: Json
      }
      review_for: {
        Args: { _id: string; _kind: string }
        Returns: {
          assigned_to: string
          decided_at: string
          i_may_move: boolean
          i_may_withdraw: boolean
          id: string
          reason: string
          requested_by: string
          status: Database["public"]["Enums"]["approval_status"]
          task_id: string
          updated_at: string
        }[]
      }
      review_transition_allowed: {
        Args: {
          _from: Database["public"]["Enums"]["approval_status"]
          _to: Database["public"]["Enums"]["approval_status"]
        }
        Returns: boolean
      }
      revoke_workspace_invite: { Args: { p_id: string }; Returns: undefined }
      save_clause_doc: {
        Args: { _clause: string; _doc: Json; _seen?: string }
        Returns: Json
      }
      set_deliverable_owner: {
        Args: { _deliverable: string; _to: string }
        Returns: undefined
      }
      set_knowledge_visibility: {
        Args: {
          _id: string
          _kind: string
          _visibility: Database["public"]["Enums"]["knowledge_visibility"]
        }
        Returns: undefined
      }
      set_matter_lead: {
        Args: { p_matter: string; p_user: string }
        Returns: undefined
      }
      set_matter_member_role: {
        Args: {
          p_matter: string
          p_role: Database["public"]["Enums"]["matter_role"]
          p_user: string
        }
        Returns: undefined
      }
      set_team_archived: {
        Args: { _archived: boolean; _team: string }
        Returns: undefined
      }
      share_knowledge: {
        Args: { _id: string; _kind: string; _with: string }
        Returns: undefined
      }
      share_knowledge_with_team: {
        Args: { _id: string; _kind: string; _team: string }
        Returns: undefined
      }
      staff_matter_from_team: {
        Args: {
          _matter: string
          _role: Database["public"]["Enums"]["matter_role"]
          _team: string
        }
        Returns: Json
      }
      take_clause: {
        Args: { _clause: string }
        Returns: {
          expires_at: string
          holder: string
          holder_name: string
          taken: boolean
        }[]
      }
      task_actions: {
        Args: { _task: string }
        Returns: {
          asked_by: string
          i_may_assign: boolean
          i_may_decline: boolean
        }[]
      }
      team_workspace: { Args: { _team: string }; Returns: string }
      thread_context: {
        Args: { _id: string; _kind: string }
        Returns: {
          matter_id: string
          may_comment: boolean
          my_role: string
          owner_id: string
        }[]
      }
      transcript_matter: { Args: { _transcript_id: string }; Returns: string }
      unseen_event_count: { Args: never; Returns: number }
      unshare_knowledge: {
        Args: { _id: string; _kind: string; _with: string }
        Returns: undefined
      }
      unshare_knowledge_from_team: {
        Args: { _id: string; _kind: string; _team: string }
        Returns: undefined
      }
      withdraw_knowledge_approval: {
        Args: { _id: string; _kind: string }
        Returns: undefined
      }
      withdraw_review: { Args: { _approval: string }; Returns: undefined }
      workspaces_i_administer: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
    }
    Enums: {
      analysis_source: "ai" | "human"
      app_role: "owner" | "admin" | "lawyer" | "viewer"
      approval_status:
        | "Not required"
        | "Requested"
        | "In review"
        | "Changes requested"
        | "Approved"
        | "Rejected"
      clause_change: "Modified" | "Added" | "Deleted"
      clause_risk: "Low" | "Medium" | "High"
      clause_status: "Accepted" | "Open" | "For discussion" | "Escalated"
      comment_kind: "note" | "instruction"
      doc_kind:
        | "contract"
        | "amendment"
        | "transcript"
        | "playbook"
        | "letter"
        | "resolution"
        | "minutes"
        | "proposal"
        | "research"
        | "reference"
      drafting_status: "Draft" | "Open" | "Escalated"
      feedback_kind: "bug" | "idea" | "other"
      feedback_status: "unread" | "read" | "resolved"
      invite_status:
        | "pending"
        | "accepted"
        | "revoked"
        | "expired"
        | "superseded"
      knowledge_visibility: "private" | "shared" | "firm"
      matter_role: "lead" | "editor" | "reviewer" | "viewer"
      parse_status: "pending" | "parsing" | "parsed" | "failed"
      playbook_status: "Active" | "Draft" | "Archived"
      research_draft_state: "pending" | "accepted" | "rejected"
      research_kind: "simple" | "comprehensive"
      resolution_status: "Accepted" | "Open" | "Escalated"
      review_state:
        | "aligned"
        | "review"
        | "high-risk"
        | "missing"
        | "deviation"
        | "approval"
      seg_kind: "n" | "d" | "i"
      source_kind:
        | "clause"
        | "transcript"
        | "playbook"
        | "precedent"
        | "document"
        | "matter"
        | "manual"
        | "flow"
        | "research"
        | "corporate"
        | "review"
        | "task"
        | "deliverable"
        | "flow_phase"
        | "research_finding"
        | "request"
        | "org_obligation"
        | "org_licence"
      task_status: "Open" | "In progress" | "Blocked" | "Done" | "Waiting"
      template_status: "Draft" | "Active" | "Retired"
      verdict: "Consistent" | "Fallback" | "Red flag" | "Escalate"
      workspace_kind: "personal" | "firm"
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
      analysis_source: ["ai", "human"],
      app_role: ["owner", "admin", "lawyer", "viewer"],
      approval_status: [
        "Not required",
        "Requested",
        "In review",
        "Changes requested",
        "Approved",
        "Rejected",
      ],
      clause_change: ["Modified", "Added", "Deleted"],
      clause_risk: ["Low", "Medium", "High"],
      clause_status: ["Accepted", "Open", "For discussion", "Escalated"],
      comment_kind: ["note", "instruction"],
      doc_kind: [
        "contract",
        "amendment",
        "transcript",
        "playbook",
        "letter",
        "resolution",
        "minutes",
        "proposal",
        "research",
        "reference",
      ],
      drafting_status: ["Draft", "Open", "Escalated"],
      feedback_kind: ["bug", "idea", "other"],
      feedback_status: ["unread", "read", "resolved"],
      invite_status: [
        "pending",
        "accepted",
        "revoked",
        "expired",
        "superseded",
      ],
      knowledge_visibility: ["private", "shared", "firm"],
      matter_role: ["lead", "editor", "reviewer", "viewer"],
      parse_status: ["pending", "parsing", "parsed", "failed"],
      playbook_status: ["Active", "Draft", "Archived"],
      research_draft_state: ["pending", "accepted", "rejected"],
      research_kind: ["simple", "comprehensive"],
      resolution_status: ["Accepted", "Open", "Escalated"],
      review_state: [
        "aligned",
        "review",
        "high-risk",
        "missing",
        "deviation",
        "approval",
      ],
      seg_kind: ["n", "d", "i"],
      source_kind: [
        "clause",
        "transcript",
        "playbook",
        "precedent",
        "document",
        "matter",
        "manual",
        "flow",
        "research",
        "corporate",
        "review",
        "task",
        "deliverable",
        "flow_phase",
        "research_finding",
        "request",
        "org_obligation",
        "org_licence",
      ],
      task_status: ["Open", "In progress", "Blocked", "Done", "Waiting"],
      template_status: ["Draft", "Active", "Retired"],
      verdict: ["Consistent", "Fallback", "Red flag", "Escalate"],
      workspace_kind: ["personal", "firm"],
    },
  },
} as const
