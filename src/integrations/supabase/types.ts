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
      cartoes: {
        Row: {
          bandeira: string
          cor: string
          created_at: string
          dia_fechamento: number
          dia_vencimento: number
          final_cartao: string
          id: string
          instituicao: string
          limite: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bandeira?: string
          cor?: string
          created_at?: string
          dia_fechamento?: number
          dia_vencimento?: number
          final_cartao?: string
          id?: string
          instituicao?: string
          limite?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bandeira?: string
          cor?: string
          created_at?: string
          dia_fechamento?: number
          dia_vencimento?: number
          final_cartao?: string
          id?: string
          instituicao?: string
          limite?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      faturas: {
        Row: {
          ano: number
          cartao_id: string
          comprovante_url: string | null
          created_at: string
          data_pagamento: string | null
          id: string
          mes: number
          pago: boolean
          updated_at: string
          user_id: string
          valor_pago: number | null
        }
        Insert: {
          ano: number
          cartao_id: string
          comprovante_url?: string | null
          created_at?: string
          data_pagamento?: string | null
          id?: string
          mes: number
          pago?: boolean
          updated_at?: string
          user_id: string
          valor_pago?: number | null
        }
        Update: {
          ano?: number
          cartao_id?: string
          comprovante_url?: string | null
          created_at?: string
          data_pagamento?: string | null
          id?: string
          mes?: number
          pago?: boolean
          updated_at?: string
          user_id?: string
          valor_pago?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "faturas_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
        ]
      }
      lancamentos: {
        Row: {
          cartao_id: string | null
          categoria: string
          comprovante_url: string | null
          created_at: string
          data: string
          data_compra: string | null
          descricao: string
          fixo: boolean
          id: string
          loja: string | null
          merchant_logo_url: string | null
          metodo: string
          parcela_atual: number | null
          parcela_grupo_id: string | null
          tipo: string
          total_parcelas: number | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          cartao_id?: string | null
          categoria?: string
          comprovante_url?: string | null
          created_at?: string
          data?: string
          data_compra?: string | null
          descricao?: string
          fixo?: boolean
          id?: string
          loja?: string | null
          merchant_logo_url?: string | null
          metodo?: string
          parcela_atual?: number | null
          parcela_grupo_id?: string | null
          tipo?: string
          total_parcelas?: number | null
          updated_at?: string
          user_id: string
          valor?: number
        }
        Update: {
          cartao_id?: string | null
          categoria?: string
          comprovante_url?: string | null
          created_at?: string
          data?: string
          data_compra?: string | null
          descricao?: string
          fixo?: boolean
          id?: string
          loja?: string | null
          merchant_logo_url?: string | null
          metodo?: string
          parcela_atual?: number | null
          parcela_grupo_id?: string | null
          tipo?: string
          total_parcelas?: number | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
        ]
      }
      objetivos_globais: {
        Row: {
          created_at: string
          data_limite: string | null
          id: string
          tipo: string
          updated_at: string
          user_id: string
          valor_atual: number
          valor_meta: number
        }
        Insert: {
          created_at?: string
          data_limite?: string | null
          id?: string
          tipo?: string
          updated_at?: string
          user_id: string
          valor_atual?: number
          valor_meta?: number
        }
        Update: {
          created_at?: string
          data_limite?: string | null
          id?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          valor_atual?: number
          valor_meta?: number
        }
        Relationships: []
      }
      objetivos_lista: {
        Row: {
          concluido: boolean
          created_at: string
          data_prevista: string | null
          id: string
          nome: string
          tipo: string
          updated_at: string
          user_id: string
          valor_previsto: number
        }
        Insert: {
          concluido?: boolean
          created_at?: string
          data_prevista?: string | null
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
          user_id: string
          valor_previsto?: number
        }
        Update: {
          concluido?: boolean
          created_at?: string
          data_prevista?: string | null
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          valor_previsto?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string
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
      [_ in never]: never
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
