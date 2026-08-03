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
      bots: {
        Row: {
          account_id: string
          created_at: string
          id: string
          last_error: string | null
          last_tick_at: string | null
          max_daily_loss: number
          max_position: number
          name: string
          params: Json
          started_at: string | null
          status: Database["public"]["Enums"]["bot_status"]
          strategy: Database["public"]["Enums"]["strategy_kind"]
          symbol: string
          timeframe: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_tick_at?: string | null
          max_daily_loss?: number
          max_position?: number
          name: string
          params?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["bot_status"]
          strategy: Database["public"]["Enums"]["strategy_kind"]
          symbol: string
          timeframe?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          last_tick_at?: string | null
          max_daily_loss?: number
          max_position?: number
          name?: string
          params?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["bot_status"]
          strategy?: Database["public"]["Enums"]["strategy_kind"]
          symbol?: string
          timeframe?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bots_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "exchange_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      equity_snapshots: {
        Row: {
          bot_id: string
          equity: number
          id: string
          pnl: number
          ts: string
          user_id: string
        }
        Insert: {
          bot_id: string
          equity: number
          id?: string
          pnl?: number
          ts?: string
          user_id: string
        }
        Update: {
          bot_id?: string
          equity?: number
          id?: string
          pnl?: number
          ts?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equity_snapshots_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_accounts: {
        Row: {
          api_key_enc: string
          api_secret_enc: string
          created_at: string
          exchange: Database["public"]["Enums"]["exchange_kind"]
          id: string
          label: string
          last_verified_at: string | null
          mode: Database["public"]["Enums"]["exchange_mode"]
          passphrase_enc: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_enc: string
          api_secret_enc: string
          created_at?: string
          exchange: Database["public"]["Enums"]["exchange_kind"]
          id?: string
          label: string
          last_verified_at?: string | null
          mode?: Database["public"]["Enums"]["exchange_mode"]
          passphrase_enc?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_enc?: string
          api_secret_enc?: string
          created_at?: string
          exchange?: Database["public"]["Enums"]["exchange_kind"]
          id?: string
          label?: string
          last_verified_at?: string | null
          mode?: Database["public"]["Enums"]["exchange_mode"]
          passphrase_enc?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      health_checks: {
        Row: {
          base_url: string
          checked_at: string
          duration_ms: number
          failed_count: number
          id: string
          ok: boolean
          results: Json
        }
        Insert: {
          base_url: string
          checked_at?: string
          duration_ms?: number
          failed_count?: number
          id?: string
          ok: boolean
          results?: Json
        }
        Update: {
          base_url?: string
          checked_at?: string
          duration_ms?: number
          failed_count?: number
          id?: string
          ok?: boolean
          results?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      signals: {
        Row: {
          bot_id: string
          id: string
          kind: Database["public"]["Enums"]["signal_kind"]
          price: number | null
          reason: string | null
          ts: string
          user_id: string
        }
        Insert: {
          bot_id: string
          id?: string
          kind: Database["public"]["Enums"]["signal_kind"]
          price?: number | null
          reason?: string | null
          ts?: string
          user_id: string
        }
        Update: {
          bot_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["signal_kind"]
          price?: number | null
          reason?: string | null
          ts?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          provider: string | null
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          tier: Database["public"]["Enums"]["plan_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          tier?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          provider?: string | null
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          tier?: Database["public"]["Enums"]["plan_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          bot_id: string
          fee: number
          id: string
          order_id: string | null
          price: number
          qty: number
          raw: Json | null
          side: Database["public"]["Enums"]["trade_side"]
          status: Database["public"]["Enums"]["trade_status"]
          ts: string
          user_id: string
        }
        Insert: {
          bot_id: string
          fee?: number
          id?: string
          order_id?: string | null
          price: number
          qty: number
          raw?: Json | null
          side: Database["public"]["Enums"]["trade_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          ts?: string
          user_id: string
        }
        Update: {
          bot_id?: string
          fee?: number
          id?: string
          order_id?: string | null
          price?: number
          qty?: number
          raw?: Json | null
          side?: Database["public"]["Enums"]["trade_side"]
          status?: Database["public"]["Enums"]["trade_status"]
          ts?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
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
          role?: Database["public"]["Enums"]["app_role"]
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
    }
    Enums: {
      app_role: "admin" | "user"
      bot_status: "stopped" | "running" | "error"
      exchange_kind: "binance" | "coinbase" | "alpaca"
      exchange_mode: "live" | "demo"
      plan_tier: "starter" | "trader" | "pro" | "elite"
      signal_kind: "buy" | "sell" | "hold"
      strategy_kind: "sma_crossover" | "rsi_reversion" | "grid" | "dca"
      trade_side: "buy" | "sell"
      trade_status: "pending" | "filled" | "cancelled" | "rejected"
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
      app_role: ["admin", "user"],
      bot_status: ["stopped", "running", "error"],
      exchange_kind: ["binance", "coinbase", "alpaca"],
      exchange_mode: ["live", "demo"],
      plan_tier: ["starter", "trader", "pro", "elite"],
      signal_kind: ["buy", "sell", "hold"],
      strategy_kind: ["sma_crossover", "rsi_reversion", "grid", "dca"],
      trade_side: ["buy", "sell"],
      trade_status: ["pending", "filled", "cancelled", "rejected"],
    },
  },
} as const
