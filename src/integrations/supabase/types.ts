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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      daily_expenses: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          description: string
          id: string
          restaurant_id: string
          source: string | null
          staff_id: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          description: string
          id?: string
          restaurant_id: string
          source?: string | null
          staff_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          description?: string
          id?: string
          restaurant_id?: string
          source?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_expenses_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_reports: {
        Row: {
          created_at: string | null
          id: string
          payment_methods: Json | null
          report_date: string
          restaurant_id: string | null
          staff_id: string
          total_orders: number
          total_revenue: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          payment_methods?: Json | null
          report_date: string
          restaurant_id?: string | null
          staff_id: string
          total_orders: number
          total_revenue: number
        }
        Update: {
          created_at?: string | null
          id?: string
          payment_methods?: Json | null
          report_date?: string
          restaurant_id?: string | null
          staff_id?: string
          total_orders?: number
          total_revenue?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_reports_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      debtors: {
        Row: {
          amount_owed: number
          created_at: string
          currency: string
          customer_name: string
          id: string
          is_resolved: boolean
          notes: string | null
          resolved_at: string | null
          restaurant_id: string
          staff_id: string
          updated_at: string
        }
        Insert: {
          amount_owed?: number
          created_at?: string
          currency?: string
          customer_name: string
          id?: string
          is_resolved?: boolean
          notes?: string | null
          resolved_at?: string | null
          restaurant_id: string
          staff_id: string
          updated_at?: string
        }
        Update: {
          amount_owed?: number
          created_at?: string
          currency?: string
          customer_name?: string
          id?: string
          is_resolved?: boolean
          notes?: string | null
          resolved_at?: string | null
          restaurant_id?: string
          staff_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          quantity: number | null
          restaurant_id: string
          status: Database["public"]["Enums"]["inventory_status"]
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          quantity?: number | null
          restaurant_id: string
          status?: Database["public"]["Enums"]["inventory_status"]
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          quantity?: number | null
          restaurant_id?: string
          status?: Database["public"]["Enums"]["inventory_status"]
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          base_price: number
          category: string | null
          created_at: string
          currency: string
          description: string | null
          id: string
          is_available: boolean
          is_inventory_item: boolean
          is_public: boolean
          name: string
          per_unit_price: number | null
          pricing_unit: string | null
          restaurant_id: string | null
          staff_id: string
          stock_qty: number
          updated_at: string
        }
        Insert: {
          base_price?: number
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_available?: boolean
          is_inventory_item?: boolean
          is_public?: boolean
          name: string
          per_unit_price?: number | null
          pricing_unit?: string | null
          restaurant_id?: string | null
          staff_id: string
          stock_qty?: number
          updated_at?: string
        }
        Update: {
          base_price?: number
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_available?: boolean
          is_inventory_item?: boolean
          is_public?: boolean
          name?: string
          per_unit_price?: number | null
          pricing_unit?: string | null
          restaurant_id?: string | null
          staff_id?: string
          stock_qty?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_tags: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          restaurant_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_tags_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          base_price_at_time: number
          extra_units: number
          id: string
          menu_item_id: string
          menu_item_name: string
          order_id: string
          per_unit_price_at_time: number | null
          price_at_time: number
          quantity: number
          subtotal: number
        }
        Insert: {
          base_price_at_time?: number
          extra_units?: number
          id?: string
          menu_item_id: string
          menu_item_name: string
          order_id: string
          per_unit_price_at_time?: number | null
          price_at_time: number
          quantity: number
          subtotal: number
        }
        Update: {
          base_price_at_time?: number
          extra_units?: number
          id?: string
          menu_item_id?: string
          menu_item_name?: string
          order_id?: string
          per_unit_price_at_time?: number | null
          price_at_time?: number
          quantity?: number
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          currency: string
          customer_email: string | null
          customer_location: string | null
          customer_name: string | null
          customer_phone: string | null
          discount_amount: number
          edited_at: string | null
          id: string
          is_public_order: boolean
          notes: string | null
          order_number: string
          payment_method: string
          payment_status: string
          restaurant_id: string | null
          staff_id: string
          status: string
          total: number
        }
        Insert: {
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_location?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number
          edited_at?: string | null
          id?: string
          is_public_order?: boolean
          notes?: string | null
          order_number?: string
          payment_method: string
          payment_status?: string
          restaurant_id?: string | null
          staff_id: string
          status?: string
          total: number
        }
        Update: {
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_location?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount_amount?: number
          edited_at?: string | null
          id?: string
          is_public_order?: boolean
          notes?: string | null
          order_number?: string
          payment_method?: string
          payment_status?: string
          restaurant_id?: string | null
          staff_id?: string
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string
          id: string
        }
        Insert: {
          created_at?: string
          full_name: string
          id: string
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
        }
        Relationships: []
      }
      restaurant_memberships: {
        Row: {
          created_at: string
          restaurant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          restaurant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          restaurant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_memberships_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_settings: {
        Row: {
          allow_public_orders: boolean
          created_at: string
          currency: string
          fixed_daily_bills: number
          fixed_monthly_expenses: number
          id: string
          monthly_bills: Json | null
          notify_low_margin: boolean
          notify_low_stock: boolean
          notify_new_order: boolean
          payment_methods: Json
          profit_margin_threshold: number
          restaurant_id: string | null
          restaurant_name: string
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          allow_public_orders?: boolean
          created_at?: string
          currency?: string
          fixed_daily_bills?: number
          fixed_monthly_expenses?: number
          id?: string
          monthly_bills?: Json | null
          notify_low_margin?: boolean
          notify_low_stock?: boolean
          notify_new_order?: boolean
          payment_methods?: Json
          profit_margin_threshold?: number
          restaurant_id?: string | null
          restaurant_name?: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          allow_public_orders?: boolean
          created_at?: string
          currency?: string
          fixed_daily_bills?: number
          fixed_monthly_expenses?: number
          id?: string
          monthly_bills?: Json | null
          notify_low_margin?: boolean
          notify_low_stock?: boolean
          notify_new_order?: boolean
          payment_methods?: Json
          profit_margin_threshold?: number
          restaurant_id?: string | null
          restaurant_name?: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      tab_items: {
        Row: {
          added_at: string
          base_price_at_time: number
          extra_units: number
          id: string
          menu_item_id: string
          menu_item_name: string
          per_unit_price_at_time: number | null
          quantity: number
          subtotal: number
          tab_id: string
        }
        Insert: {
          added_at?: string
          base_price_at_time: number
          extra_units?: number
          id?: string
          menu_item_id: string
          menu_item_name: string
          per_unit_price_at_time?: number | null
          quantity: number
          subtotal: number
          tab_id: string
        }
        Update: {
          added_at?: string
          base_price_at_time?: number
          extra_units?: number
          id?: string
          menu_item_id?: string
          menu_item_name?: string
          per_unit_price_at_time?: number | null
          quantity?: number
          subtotal?: number
          tab_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tab_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tab_items_tab_id_fkey"
            columns: ["tab_id"]
            isOneToOne: false
            referencedRelation: "tabs"
            referencedColumns: ["id"]
          },
        ]
      }
      tabs: {
        Row: {
          closed_at: string | null
          created_at: string
          currency: string
          customer_name: string | null
          id: string
          notes: string | null
          payment_method: string | null
          restaurant_id: string
          staff_id: string
          status: string
          total: number
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          currency?: string
          customer_name?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          restaurant_id: string
          staff_id: string
          status?: string
          total?: number
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          currency?: string
          customer_name?: string | null
          id?: string
          notes?: string | null
          payment_method?: string | null
          restaurant_id?: string
          staff_id?: string
          status?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "tabs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          restaurant_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          restaurant_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_public_order:
        | {
            Args: {
              _customer_email: string
              _customer_location: string
              _customer_name: string
              _customer_phone: string
              _items: Json
              _notes: string
              _payment_method: string
              _restaurant_id: string
            }
            Returns: {
              id: string
              order_number: string
            }[]
          }
        | {
            Args: {
              _customer_email: string
              _customer_name: string
              _items: Json
              _notes: string
              _payment_method: string
              _restaurant_id: string
            }
            Returns: {
              id: string
              order_number: string
            }[]
          }
      current_restaurant_id: { Args: { _user_id: string }; Returns: string }
      get_next_order_number: {
        Args: { _restaurant_id: string }
        Returns: string
      }
      get_public_receipt: { Args: { _order_id: string }; Returns: Json }
      has_role:
        | {
            Args: {
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
        | {
            Args: {
              _restaurant_id: string
              _role: Database["public"]["Enums"]["app_role"]
              _user_id: string
            }
            Returns: boolean
          }
      is_investor: {
        Args: { _restaurant_id: string; _user_id: string }
        Returns: boolean
      }
      is_manager:
        | { Args: { _user_id: string }; Returns: boolean }
        | {
            Args: { _restaurant_id: string; _user_id: string }
            Returns: boolean
          }
    }
    Enums: {
      app_role: "server" | "ops" | "counter" | "manager" | "investor"
      inventory_status: "available" | "almost_finished" | "finished"
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
      app_role: ["server", "ops", "counter", "manager", "investor"],
      inventory_status: ["available", "almost_finished", "finished"],
    },
  },
} as const
