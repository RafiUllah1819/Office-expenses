// ---------------------------------------------------------------------------
// Supabase Database type definition  (v2 — multi-group ready)
// Gives the Supabase client full type-safety for all table operations.
// Keep this in sync with supabase/schema.sql whenever you add/change tables.
// ---------------------------------------------------------------------------

export type Database = {
  public: {
    Tables: {

      // ── groups ─────────────────────────────────────────────────────────────
      groups: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          invite_code: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          invite_code?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          invite_code?: string | null;
          created_at?: string;
        };
      };

      // ── members ────────────────────────────────────────────────────────────
      members: {
        Row: {
          id: string;
          group_id: string | null;  // nullable during v1→v2 migration; becomes NOT NULL in Phase 3
          name: string;
          nickname: string | null;
          email: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id?: string | null; // optional until Phase 3 migration step
          name: string;
          nickname?: string | null;
          email?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string | null;
          name?: string;
          nickname?: string | null;
          email?: string | null;
          created_at?: string;
        };
      };

      // ── expenses ───────────────────────────────────────────────────────────
      expenses: {
        Row: {
          id: string;
          group_id: string | null;  // nullable during v1→v2 migration; becomes NOT NULL in Phase 3
          title: string;
          amount: number;
          paid_by: string;
          date: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id?: string | null; // optional until Phase 3 migration step
          title: string;
          amount: number;
          paid_by: string;
          date: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string | null;
          title?: string;
          amount?: number;
          paid_by?: string;
          date?: string;
          note?: string | null;
          created_at?: string;
        };
      };

      // ── settlements ───────────────────────────────────────────────────
      settlements: {
        Row: {
          id: string;
          group_id: string | null;
          paid_by: string;
          paid_to: string;
          amount: number;
          date: string;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id?: string | null;
          paid_by: string;
          paid_to: string;
          amount: number;
          date: string;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          group_id?: string | null;
          paid_by?: string;
          paid_to?: string;
          amount?: number;
          date?: string;
          note?: string | null;
          created_at?: string;
        };
      };

      // ── expense_participants ───────────────────────────────────────────────
      expense_participants: {
        Row: {
          id: string;
          expense_id: string;
          member_id: string;
          share_amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_id: string;
          member_id: string;
          share_amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          expense_id?: string;
          member_id?: string;
          share_amount?: number;
          created_at?: string;
        };
      };
    };

    Views: {
      member_balances: {
        Row: {
          member_id: string;
          member_name: string;
          email: string | null;
          group_id: string | null;
          total_paid: number;
          total_owed: number;
          total_settlements_made: number;
          total_settlements_received: number;
          balance: number;
        };
      };
    };

    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
