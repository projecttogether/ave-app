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
            indicator_data: {
                Row: {
                    bananas_spend: number | null
                    cocoa_spend: number | null
                    coffee_spend: number | null
                    created_at: string | null
                    created_by: string | null
                    dairy_spend: number | null
                    egg_spend: number | null
                    fair_trade_bananas_spend: number | null
                    fair_trade_cocoa_spend: number | null
                    fair_trade_coffee_spend: number | null
                    fish_spend: number | null
                    food_waste_amount: number | null
                    food_waste_measure_type: string | null
                    guest_satisfaction_score: number | null
                    id: string
                    meat_spend: number | null
                    organic_spend: number | null
                    organization_id: string
                    regional_score: number | null
                    reporting_month: number
                    reporting_year: number
                    seasonal_score: number | null
                    status: string | null
                    sub_organization_id: string
                    total_food_spend: number | null
                    updated_at: string | null
                    updated_by: string | null
                }
                Insert: {
                    bananas_spend?: number | null
                    cocoa_spend?: number | null
                    coffee_spend?: number | null
                    created_at?: string | null
                    created_by?: string | null
                    dairy_spend?: number | null
                    egg_spend?: number | null
                    fair_trade_bananas_spend?: number | null
                    fair_trade_cocoa_spend?: number | null
                    fair_trade_coffee_spend?: number | null
                    fish_spend?: number | null
                    food_waste_amount?: number | null
                    food_waste_measure_type?: string | null
                    guest_satisfaction_score?: number | null
                    id?: string
                    meat_spend?: number | null
                    organic_spend?: number | null
                    organization_id: string
                    regional_score?: number | null
                    reporting_month: number
                    reporting_year: number
                    seasonal_score?: number | null
                    status?: string | null
                    sub_organization_id: string
                    total_food_spend?: number | null
                    updated_at?: string | null
                    updated_by?: string | null
                }
                Update: {
                    bananas_spend?: number | null
                    cocoa_spend?: number | null
                    coffee_spend?: number | null
                    created_at?: string | null
                    created_by?: string | null
                    dairy_spend?: number | null
                    egg_spend?: number | null
                    fair_trade_bananas_spend?: number | null
                    fair_trade_cocoa_spend?: number | null
                    fair_trade_coffee_spend?: number | null
                    fish_spend?: number | null
                    food_waste_amount?: number | null
                    food_waste_measure_type?: string | null
                    guest_satisfaction_score?: number | null
                    id?: string
                    meat_spend?: number | null
                    organic_spend?: number | null
                    organization_id?: string
                    regional_score?: number | null
                    reporting_month?: number
                    reporting_year?: number
                    seasonal_score?: number | null
                    status?: string | null
                    sub_organization_id?: string
                    total_food_spend?: number | null
                    updated_at?: string | null
                    updated_by?: string | null
                }
                Relationships: [
                    {
                        foreignKeyName: "indicator_data_created_by_fkey"
                        columns: ["created_by"]
                        isOneToOne: false
                        referencedRelation: "users"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "indicator_data_organization_id_fkey"
                        columns: ["organization_id"]
                        isOneToOne: false
                        referencedRelation: "organizations"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "indicator_data_sub_organization_id_fkey"
                        columns: ["sub_organization_id"]
                        isOneToOne: false
                        referencedRelation: "sub_organizations"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "indicator_data_updated_by_fkey"
                        columns: ["updated_by"]
                        isOneToOne: false
                        referencedRelation: "users"
                        referencedColumns: ["id"]
                    },
                ]
            }
            organizations: {
                Row: {
                    created_at: string | null
                    id: string
                    name: string
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    name: string
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    name?: string
                }
                Relationships: []
            }
            profiles: {
                Row: {
                    created_at: string
                    email: string | null
                    id: string
                    organization_id: string | null
                    role: Database["public"]["Enums"]["app_role"]
                }
                Insert: {
                    created_at?: string
                    email?: string | null
                    id: string
                    organization_id?: string | null
                    role?: Database["public"]["Enums"]["app_role"]
                }
                Update: {
                    created_at?: string
                    email?: string | null
                    id?: string
                    organization_id?: string | null
                    role?: Database["public"]["Enums"]["app_role"]
                }
                Relationships: [
                    {
                        foreignKeyName: "profiles_organization_id_fkey"
                        columns: ["organization_id"]
                        isOneToOne: false
                        referencedRelation: "organizations"
                        referencedColumns: ["id"]
                    },
                ]
            }
            sub_organization_members: {
                Row: {
                    created_at: string | null
                    id: string
                    role: string
                    sub_organization_id: string
                    user_id: string
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    role: string
                    sub_organization_id: string
                    user_id: string
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    role?: string
                    sub_organization_id?: string
                    user_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "sub_organization_members_sub_organization_id_fkey"
                        columns: ["sub_organization_id"]
                        isOneToOne: false
                        referencedRelation: "sub_organizations"
                        referencedColumns: ["id"]
                    },
                    {
                        foreignKeyName: "sub_organization_members_user_id_fkey"
                        columns: ["user_id"]
                        isOneToOne: false
                        referencedRelation: "profiles"
                        referencedColumns: ["id"]
                    },
                ]
            }
            sub_organizations: {
                Row: {
                    created_at: string | null
                    id: string
                    name: string
                    organization_id: string
                }
                Insert: {
                    created_at?: string | null
                    id?: string
                    name: string
                    organization_id: string
                }
                Update: {
                    created_at?: string | null
                    id?: string
                    name?: string
                    organization_id?: string
                }
                Relationships: [
                    {
                        foreignKeyName: "sub_organizations_organization_id_fkey"
                        columns: ["organization_id"]
                        isOneToOne: false
                        referencedRelation: "organizations"
                        referencedColumns: ["id"]
                    },
                ]
            }
        }
        Views: {
            [_ in never]: never
        }
        Functions: {
            get_dashboard_stats: {
                Args: {
                    p_organization_id?: string
                    p_sub_organization_id?: string
                    p_year?: number
                    p_granularity?: 'monthly' | 'yearly' | null
                }
                Returns: {
                    fair_trade_percentage: number | null
                    food_waste: number | null
                    guest_satisfaction_scoring_result: number | null
                    organic_percentage: number | null
                    plant_based_percentage: number | null
                    regional_scoring_result: number | null
                    seasonal_scoring_result: number | null
                    total_spend: number | null
                    plant_based_scoring_result: number | null
                    organic_scoring_result: number | null
                    fair_trade_scoring_result: number | null
                    food_waste_scoring_result: number | null
                }
            }
        }
        Enums: {
            app_role: "super_admin" | "admin" | "organization_manager" | "organization_user"
        }
        CompositeTypes: {
            [_ in never]: never
        }
    }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

export type Tables<
    PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
            Row: infer R
        }
    ? R
    : never
    : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
            Row: infer R
        }
    ? R
    : never
    : never

export type TablesInsert<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Insert: infer I
    }
    ? I
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
    }
    ? I
    : never
    : never

export type TablesUpdate<
    PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
    TableName extends PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
        Update: infer U
    }
    ? U
    : never
    : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
    }
    ? U
    : never
    : never

export type Enums<
    PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
    EnumName extends PublicEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
    | keyof PublicSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals
    }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
    ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof PublicSchema["CompositeTypes"]
    ? PublicSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never
