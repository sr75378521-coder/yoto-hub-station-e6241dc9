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
      checkpoints: {
        Row: {
          audio_duration: number | null
          audio_name: string | null
          audio_path: string | null
          audio_size: number | null
          auto_advance: boolean
          created_at: string
          icon: string | null
          id: string
          is_start: boolean
          left_action: string
          left_target: string | null
          loop_audio: boolean
          order_index: number
          pos_x: number
          pos_y: number
          project_id: string
          right_action: string
          right_target: string | null
          title: string
          updated_at: string
          user_id: string
          volume: number
        }
        Insert: {
          audio_duration?: number | null
          audio_name?: string | null
          audio_path?: string | null
          audio_size?: number | null
          auto_advance?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          is_start?: boolean
          left_action?: string
          left_target?: string | null
          loop_audio?: boolean
          order_index?: number
          pos_x?: number
          pos_y?: number
          project_id: string
          right_action?: string
          right_target?: string | null
          title?: string
          updated_at?: string
          user_id: string
          volume?: number
        }
        Update: {
          audio_duration?: number | null
          audio_name?: string | null
          audio_path?: string | null
          audio_size?: number | null
          auto_advance?: boolean
          created_at?: string
          icon?: string | null
          id?: string
          is_start?: boolean
          left_action?: string
          left_target?: string | null
          loop_audio?: boolean
          order_index?: number
          pos_x?: number
          pos_y?: number
          project_id?: string
          right_action?: string
          right_target?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "checkpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "studio_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      family_invites: {
        Row: {
          accepted_at: string | null
          can_edit: boolean
          created_at: string
          email: string
          family_id: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["family_role"]
        }
        Insert: {
          accepted_at?: string | null
          can_edit?: boolean
          created_at?: string
          email: string
          family_id: string
          id?: string
          invited_by: string
          role?: Database["public"]["Enums"]["family_role"]
        }
        Update: {
          accepted_at?: string | null
          can_edit?: boolean
          created_at?: string
          email?: string
          family_id?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["family_role"]
        }
        Relationships: [
          {
            foreignKeyName: "family_invites_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_members: {
        Row: {
          can_edit: boolean
          created_at: string
          display_name: string | null
          email: string | null
          family_id: string
          id: string
          role: Database["public"]["Enums"]["family_role"]
          user_id: string
        }
        Insert: {
          can_edit?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          family_id: string
          id?: string
          role?: Database["public"]["Enums"]["family_role"]
          user_id: string
        }
        Update: {
          can_edit?: boolean
          created_at?: string
          display_name?: string | null
          email?: string | null
          family_id?: string
          id?: string
          role?: Database["public"]["Enums"]["family_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      family_shared_playlists: {
        Row: {
          artwork: string | null
          can_edit: boolean
          card_id: string
          created_at: string
          family_id: string
          id: string
          shared_by: string
          title: string
        }
        Insert: {
          artwork?: string | null
          can_edit?: boolean
          card_id: string
          created_at?: string
          family_id: string
          id?: string
          shared_by: string
          title: string
        }
        Update: {
          artwork?: string | null
          can_edit?: boolean
          card_id?: string
          created_at?: string
          family_id?: string
          id?: string
          shared_by?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_shared_playlists_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          kind: string
          message: string
          page: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message: string
          page?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message?: string
          page?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      player_alarms: {
        Row: {
          created_at: string
          days: number[]
          device_id: string
          enabled: boolean
          id: string
          label: string
          sound_card_id: string | null
          sound_title: string | null
          sound_type: string
          time: string
          updated_at: string
          user_id: string
          volume: number
        }
        Insert: {
          created_at?: string
          days?: number[]
          device_id: string
          enabled?: boolean
          id?: string
          label?: string
          sound_card_id?: string | null
          sound_title?: string | null
          sound_type?: string
          time?: string
          updated_at?: string
          user_id: string
          volume?: number
        }
        Update: {
          created_at?: string
          days?: number[]
          device_id?: string
          enabled?: boolean
          id?: string
          label?: string
          sound_card_id?: string | null
          sound_title?: string | null
          sound_type?: string
          time?: string
          updated_at?: string
          user_id?: string
          volume?: number
        }
        Relationships: []
      }
      studio_projects: {
        Row: {
          created_at: string
          description: string | null
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
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
      yoto_connections: {
        Row: {
          access_token_ciphertext: string
          created_at: string
          expires_at: string
          id: string
          refresh_token_ciphertext: string
          scope: string | null
          token_type: string | null
          updated_at: string
          user_id: string
          yoto_user_id: string | null
        }
        Insert: {
          access_token_ciphertext: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token_ciphertext: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id: string
          yoto_user_id?: string | null
        }
        Update: {
          access_token_ciphertext?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token_ciphertext?: string
          scope?: string | null
          token_type?: string | null
          updated_at?: string
          user_id?: string
          yoto_user_id?: string | null
        }
        Relationships: []
      }
      yoto_oauth_states: {
        Row: {
          code_verifier: string
          created_at: string
          expires_at: string
          redirect_to: string | null
          state: string
          user_id: string
        }
        Insert: {
          code_verifier: string
          created_at?: string
          expires_at?: string
          redirect_to?: string | null
          state: string
          user_id: string
        }
        Update: {
          code_verifier?: string
          created_at?: string
          expires_at?: string
          redirect_to?: string | null
          state?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_family_admin: {
        Args: { _family_id: string; _user_id: string }
        Returns: boolean
      }
      is_family_member: {
        Args: { _family_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      family_role: "admin" | "member"
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
      app_role: ["admin", "user"],
      family_role: ["admin", "member"],
    },
  },
} as const
