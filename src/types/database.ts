export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type TransactionKind = 'receita' | 'despesa' | 'reserva';
export type ImportSource = 'manual' | 'csv' | 'ofx';
export type ImportStatus = 'pending' | 'processed' | 'failed';
export type CategoryGroup = 'necessidades' | 'construcao' | 'estilo' | 'livre';
export type PlanningRecurrence = 'none' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
export type ExpenseNature = 'fixa' | 'variavel';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          currency: string;
          timezone: string;
          onboarded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          currency?: string;
          timezone?: string;
          onboarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          currency?: string;
          timezone?: string;
          onboarded_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          kind: TransactionKind;
          color: string;
          icon: string | null;
          sort_order: number;
          archived: boolean;
          group: CategoryGroup | null;
          planned_amount: number | null;
          recurrence: PlanningRecurrence;
          day_of_month: number | null;
          expense_nature: ExpenseNature | null;
          include_in_budget: boolean;
          planning_notes: string | null;
          default_reserve_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          kind: TransactionKind;
          color?: string;
          icon?: string | null;
          sort_order?: number;
          archived?: boolean;
          group?: CategoryGroup | null;
          planned_amount?: number | null;
          recurrence?: PlanningRecurrence;
          day_of_month?: number | null;
          expense_nature?: ExpenseNature | null;
          include_in_budget?: boolean;
          planning_notes?: string | null;
          default_reserve_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          kind?: TransactionKind;
          color?: string;
          icon?: string | null;
          sort_order?: number;
          archived?: boolean;
          group?: CategoryGroup | null;
          planned_amount?: number | null;
          recurrence?: PlanningRecurrence;
          day_of_month?: number | null;
          expense_nature?: ExpenseNature | null;
          include_in_budget?: boolean;
          planning_notes?: string | null;
          default_reserve_id?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      subcategories: {
        Row: {
          id: string;
          category_id: string;
          user_id: string;
          name: string;
          sort_order: number;
          archived: boolean;
          group_override: CategoryGroup | null;
          planned_amount: number | null;
          recurrence: PlanningRecurrence;
          day_of_month: number | null;
          expense_nature: ExpenseNature | null;
          include_in_budget: boolean;
          planning_notes: string | null;
          default_reserve_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          category_id: string;
          user_id: string;
          name: string;
          sort_order?: number;
          archived?: boolean;
          group_override?: CategoryGroup | null;
          planned_amount?: number | null;
          recurrence?: PlanningRecurrence;
          day_of_month?: number | null;
          expense_nature?: ExpenseNature | null;
          include_in_budget?: boolean;
          planning_notes?: string | null;
          default_reserve_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string;
          user_id?: string;
          name?: string;
          sort_order?: number;
          archived?: boolean;
          group_override?: CategoryGroup | null;
          planned_amount?: number | null;
          recurrence?: PlanningRecurrence;
          day_of_month?: number | null;
          expense_nature?: ExpenseNature | null;
          include_in_budget?: boolean;
          planning_notes?: string | null;
          default_reserve_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'subcategories_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          occurred_on: string;
          amount: number;
          kind: TransactionKind;
          category_id: string | null;
          subcategory_id: string | null;
          description: string;
          notes: string | null;
          source: ImportSource;
          import_id: string | null;
          reserve_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          occurred_on: string;
          amount: number;
          kind: TransactionKind;
          category_id?: string | null;
          subcategory_id?: string | null;
          description: string;
          notes?: string | null;
          source?: ImportSource;
          import_id?: string | null;
          reserve_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          occurred_on?: string;
          amount?: number;
          kind?: TransactionKind;
          category_id?: string | null;
          subcategory_id?: string | null;
          description?: string;
          notes?: string | null;
          source?: ImportSource;
          import_id?: string | null;
          reserve_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'transactions_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_subcategory_id_fkey';
            columns: ['subcategory_id'];
            isOneToOne: false;
            referencedRelation: 'subcategories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_import';
            columns: ['import_id'];
            isOneToOne: false;
            referencedRelation: 'imports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transactions_reserve_id_fkey';
            columns: ['reserve_id'];
            isOneToOne: false;
            referencedRelation: 'reserves';
            referencedColumns: ['id'];
          },
        ];
      };
      budgets: {
        Row: {
          id: string;
          user_id: string;
          category_id: string;
          year: number;
          month: number;
          planned_amount: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          category_id: string;
          year: number;
          month: number;
          planned_amount: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          category_id?: string;
          year?: number;
          month?: number;
          planned_amount?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'budgets_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      reserves: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          target_amount: number;
          current_amount: number;
          starting_amount: number;
          target_date: string | null;
          color: string;
          archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          target_amount: number;
          current_amount?: number;
          starting_amount?: number;
          target_date?: string | null;
          color?: string;
          archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          target_amount?: number;
          current_amount?: number;
          starting_amount?: number;
          target_date?: string | null;
          color?: string;
          archived?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      monthly_balances: {
        Row: {
          id: string;
          user_id: string;
          year: number;
          month: number;
          opening_balance: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          year: number;
          month: number;
          opening_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          year?: number;
          month?: number;
          opening_balance?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      imports: {
        Row: {
          id: string;
          user_id: string;
          source: ImportSource;
          filename: string | null;
          status: ImportStatus;
          transactions_count: number;
          error_message: string | null;
          created_at: string;
          processed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          source: ImportSource;
          filename?: string | null;
          status?: ImportStatus;
          transactions_count?: number;
          error_message?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          source?: ImportSource;
          filename?: string | null;
          status?: ImportStatus;
          transactions_count?: number;
          error_message?: string | null;
          created_at?: string;
          processed_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      monthly_summary: {
        Row: {
          user_id: string;
          month: string;
          year: number;
          month_num: number;
          total_receita: number;
          total_despesa: number;
          total_reserva: number;
          resultado_liquido: number;
          transactions_count: number;
          resultado_operacional: number;
        };
        Relationships: [];
      };
      category_breakdown: {
        Row: {
          user_id: string;
          month: string;
          category_id: string | null;
          category_name: string | null;
          category_color: string | null;
          kind: TransactionKind | null;
          total: number;
          transactions_count: number;
        };
        Relationships: [];
      };
      nce_distribution: {
        Row: {
          user_id: string;
          month: string;
          group_name: CategoryGroup | null;
          total: number;
          transactions_count: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      seed_default_categories: {
        Args: { target_user: string };
        Returns: undefined;
      };
      get_monthly_financial_summary: {
        Args: { target_year: number; target_month: number };
        Returns: {
          month: string;
          saldo_inicial: number;
          total_receita: number;
          total_despesa: number;
          resultado_operacional: number;
          total_aportes: number;
          disponivel_antes_aportes: number;
          saldo_final: number;
          transactions_count: number;
        }[];
      };
    };
    Enums: {
      transaction_kind: TransactionKind;
      import_source: ImportSource;
      import_status: ImportStatus;
      category_group: CategoryGroup;
    };
    CompositeTypes: Record<never, never>;
  };
};

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type Category = Database['public']['Tables']['categories']['Row'];
export type Subcategory = Database['public']['Tables']['subcategories']['Row'];
export type Transaction = Database['public']['Tables']['transactions']['Row'];
export type Budget = Database['public']['Tables']['budgets']['Row'];
export type Reserve = Database['public']['Tables']['reserves']['Row'];
export type MonthlyBalance = Database['public']['Tables']['monthly_balances']['Row'];
export type Import = Database['public']['Tables']['imports']['Row'];
