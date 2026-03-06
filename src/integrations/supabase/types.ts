export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      cartoes: {
        Row: {
          id: string
          usuario_id: string
          nome: string
          limite: number
          fechamento: number
          vencimento: number
          created_at: string
        }
        Insert: {
          id?: string
          usuario_id: string
          nome: string
          limite?: number
          fechamento?: number
          vencimento?: number
          created_at?: string
        }
        Update: {
          id?: string
          usuario_id?: string
          nome?: string
          limite?: number
          fechamento?: number
          vencimento?: number
          created_at?: string
        }
        Relationships: []
      }
      faturas: {
        Row: {
          id: string
          usuario_id: string
          cartao_id: string
          mes: number
          ano: number
          valor_total: number
          status: 'pago' | 'pendente'
          created_at: string
        }
        Insert: {
          id?: string
          usuario_id: string
          cartao_id: string
          mes: number
          ano: number
          valor_total?: number
          status?: 'pago' | 'pendente'
          created_at?: string
        }
        Update: {
          id?: string
          usuario_id?: string
          cartao_id?: string
          mes?: number
          ano?: number
          valor_total?: number
          status?: 'pago' | 'pendente'
          created_at?: string
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
          id: string
          usuario_id: string
          descricao: string
          valor: number
          data: string
          categoria: string
          fixa: boolean
          cartao_id: string | null
          parcela_atual: number | null
          parcelas: number | null
          loja: string | null
          merchant_id: string | null
          merchant_logo_url: string | null
          created_at: string
        }
        Insert: {
          id?: string
          usuario_id: string
          descricao?: string
          valor?: number
          data?: string
          categoria?: string
          fixa?: boolean
          cartao_id?: string | null
          parcela_atual?: number | null
          parcelas?: number | null
          loja?: string | null
          merchant_id?: string | null
          merchant_logo_url?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          usuario_id?: string
          descricao?: string
          valor?: number
          data?: string
          categoria?: string
          fixa?: boolean
          cartao_id?: string | null
          parcela_atual?: number | null
          parcelas?: number | null
          loja?: string | null
          merchant_id?: string | null
          merchant_logo_url?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_cartao_id_fkey"
            columns: ["cartao_id"]
            isOneToOne: false
            referencedRelation: "cartoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          id: string
          name: string
          normalized_name: string
          domain: string | null
          logo_url: string | null
          logo_storage_path: string | null
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          normalized_name: string
          domain?: string | null
          logo_url?: string | null
          logo_storage_path?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          normalized_name?: string
          domain?: string | null
          logo_url?: string | null
          logo_storage_path?: string | null
          created_at?: string
        }
        Relationships: []
      }
      usuarios: {
        Row: {
          id: string
          nome: string
          email: string
          created_at: string
        }
        Insert: {
          id?: string
          nome?: string
          email?: string
          created_at?: string
        }
        Update: {
          id?: string
          nome?: string
          email?: string
          created_at?: string
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

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof Database
}
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
