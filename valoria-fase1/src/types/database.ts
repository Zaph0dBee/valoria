export type TransactionKind = 'receita' | 'despesa' | 'reserva';
export type ImportSource = 'manual' | 'csv' | 'ofx';
export type ImportStatus = 'pending' | 'processed' | 'failed';
export type CategoryGroup = 'necessidades' | 'construcao' | 'estilo' | 'livre';

export interface Profile {
  id: string;
  full_name: string | null;
  currency: string;
  timezone: string;
  onboarded_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  user_id: string;
  name: string;
  kind: TransactionKind;
  color: string;
  icon: string | null;
  sort_order: number;
  archived: boolean;
  group: CategoryGroup | null;
  created_at: string;
}

export interface Subcategory {
  id: string;
  category_id: string;
  user_id: string;
  name: string;
  sort_order: number;
  archived: boolean;
  created_at: string;
}

export interface Transaction {
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
  created_at: string;
  updated_at: string;
}

export interface Budget {
  id: string;
  user_id: string;
  category_id: string;
  year: number;
  month: number;
  planned_amount: number;
  created_at: string;
  updated_at: string;
}

export interface Reserve {
  id: string;
  user_id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  color: string;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Import {
  id: string;
  user_id: string;
  source: ImportSource;
  filename: string | null;
  status: ImportStatus;
  transactions_count: number;
  error_message: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile>; Update: Partial<Profile> };
      categories: { Row: Category; Insert: Partial<Category>; Update: Partial<Category> };
      subcategories: { Row: Subcategory; Insert: Partial<Subcategory>; Update: Partial<Subcategory> };
      transactions: { Row: Transaction; Insert: Partial<Transaction>; Update: Partial<Transaction> };
      budgets: { Row: Budget; Insert: Partial<Budget>; Update: Partial<Budget> };
      reserves: { Row: Reserve; Insert: Partial<Reserve>; Update: Partial<Reserve> };
      imports: { Row: Import; Insert: Partial<Import>; Update: Partial<Import> };
    };
    Views: {
      monthly_summary: {
        Row: {
          user_id: string;
          month: string;
          year: number;
          month_num: number;
          total_receita: number | null;
          total_despesa: number | null;
          total_reserva: number | null;
          resultado_liquido: number | null;
          transactions_count: number;
        };
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
      };
      nce_distribution: {
        Row: {
          user_id: string;
          month: string;
          group_name: CategoryGroup | null;
          total: number;
          transactions_count: number;
        };
      };
    };
    Functions: {
      seed_default_categories: {
        Args: { target_user: string };
        Returns: void;
      };
    };
  };
}
