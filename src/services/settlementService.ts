import { supabase } from "@/lib/supabase";
import { TABLES } from "@/lib/constants";
import type { Settlement, NewSettlementInput } from "@/types";

// ── Joined type returned by getSettlementsWithMembers ────────────────────────

export interface SettlementWithMembers extends Settlement {
  giver: { id: string; name: string; nickname: string | null };
  receiver: { id: string; name: string; nickname: string | null };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all settlements, newest first, with payer and receiver names joined.
 */
export async function getSettlementsWithMembers(): Promise<SettlementWithMembers[]> {
  const { data, error } = await supabase
    .from(TABLES.SETTLEMENTS)
    .select(`
      id, group_id, paid_by, paid_to, amount, date, note, created_at,
      giver:members!paid_by(id, name, nickname),
      receiver:members!paid_to(id, name, nickname)
    `)
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  // Supabase returns nested objects for the FK joins
  return (data ?? []) as unknown as SettlementWithMembers[];
}

/**
 * Record a new settlement.
 * Validates that paid_by !== paid_to before hitting the database.
 */
export async function addSettlement(
  input: NewSettlementInput
): Promise<Settlement> {
  if (input.paid_by === input.paid_to) {
    throw new Error("A member cannot settle with themselves.");
  }

  const { data, error } = await supabase
    .from(TABLES.SETTLEMENTS)
    .insert({
      paid_by:  input.paid_by,
      paid_to:  input.paid_to,
      amount:   input.amount,
      date:     input.date,
      note:     input.note ?? null,
      group_id: input.group_id ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as Settlement;
}

/**
 * Delete a settlement by id.
 * This reverses the balance effect of the settlement.
 */
export async function deleteSettlement(id: string): Promise<void> {
  const { error } = await supabase
    .from(TABLES.SETTLEMENTS)
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
}
