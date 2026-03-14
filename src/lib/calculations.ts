/**
 * src/lib/calculations.ts
 *
 * Balance-calculation logic for the hostel expense app.
 *
 * "Pure" means: no Supabase calls, no React, no side effects.
 * Every function takes plain data in and returns plain data out.
 *
 * Money arithmetic (rounding, splitting) lives in src/utils/splitExpense.ts
 * and is imported here so there is exactly one source of truth for those
 * operations across the whole codebase.
 *
 * ─────────────────────────────────────────────────────────────────
 * BALANCE FORMULA (with settlements)
 * ─────────────────────────────────────────────────────────────────
 *
 *   balance = (total_paid_expenses + total_settlements_received)
 *           - (total_owed_expenses  + total_settlements_made)
 *
 *   balance > 0  → others owe this member  (creditor)
 *   balance < 0  → this member owes others (debtor)
 *   balance = 0  → fully even
 *
 * WHY settlements work this way:
 *   Giver (positive balance) gives cash to Receiver (negative balance):
 *     Giver's    settlements_made     += amount → balance DECREASES (giver gave away credit)
 *     Receiver's settlements_received += amount → balance INCREASES (receiver's debt reduced)
 *   Net effect across all members: 0  (settlements are zero-sum)
 *
 * ─────────────────────────────────────────────────────────────────
 * WORKED EXAMPLE (4 members, 2 expenses, 1 settlement)
 * ─────────────────────────────────────────────────────────────────
 *
 * Members:  Rafi, Sabbir, Tanvir, Jibon
 *
 * Expense A — Groceries ৳1,200, paid by Rafi, split among all 4
 *   share = ৳300 each
 *
 * Expense B — Electricity ৳600, paid by Tanvir, split among Rafi & Tanvir
 *   share = ৳300 each
 *
 * Before settlements:
 *   Member   paid    owed    balance
 *   Rafi     1200    600     +600
 *   Sabbir      0    300     -300
 *   Tanvir    600    600        0
 *   Jibon       0    300     -300
 *
 * Settlement: Sabbir pays Rafi ৳300 cash
 *   Sabbir: settlements_made=300     → balance: -300 + 300 = 0  ✓
 *   Rafi:   settlements_received=300 → balance: +600 - 300 = +300
 *
 * After settlement:
 *   Member   balance   meaning
 *   Rafi     +300      Jibon still owes Rafi ৳300
 *   Sabbir      0      fully settled
 *   Tanvir      0      settled
 *   Jibon    -300      Jibon still owes ৳300
 *   ───────────────
 *   Sum:        0      money conserved ✓
 * ─────────────────────────────────────────────────────────────────
 */

import { roundMoney, computeShareAmount } from "@/utils/splitExpense";
import type { Member, Expense, ExpenseParticipant, Settlement, CoverBill, MemberBalance } from "@/types";

// Re-export so callers that already import these from calculations.ts continue
// to work without changes (expenseService.ts imports computeShareAmount here).
export { roundMoney, computeShareAmount };

// ─────────────────────────────────────────────────────────────────────────────
// Per-member aggregation helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sum of every expense amount where this member was the payer.
 *
 * @example
 *   getTotalPaidByMember("A", [{ paid_by:"A", amount:1200 }, { paid_by:"B", amount:600 }])
 *   → 1200
 */
export function getTotalPaidByMember(
  memberId: string,
  expenses: Expense[]
): number {
  const total = expenses
    .filter((e) => e.paid_by === memberId)
    .reduce((sum, e) => sum + e.amount, 0);

  return roundMoney(total);
}

/**
 * Sum of every share_amount this member owes across all expense_participants.
 * Shares are stored at insert time so we only need to sum, never re-divide.
 *
 * @example
 *   getTotalOwedByMember("A", [
 *     { member_id:"A", share_amount:300 },
 *     { member_id:"A", share_amount:300 },
 *   ])
 *   → 600
 */
export function getTotalOwedByMember(
  memberId: string,
  participants: ExpenseParticipant[]
): number {
  const total = participants
    .filter((p) => p.member_id === memberId)
    .reduce((sum, p) => sum + p.share_amount, 0);

  return roundMoney(total);
}

/**
 * Sum of cash this member paid to others via settlements.
 * Increases the member's balance (they have paid off more debt).
 *
 * @example
 *   getTotalSettlementsMade("A", [{ paid_by:"A", amount:300 }])
 *   → 300
 */
export function getTotalSettlementsMade(
  memberId: string,
  settlements: Settlement[]
): number {
  const total = settlements
    .filter((s) => s.paid_by === memberId)
    .reduce((sum, s) => sum + s.amount, 0);

  return roundMoney(total);
}

/**
 * Sum of cash this member received from others via settlements.
 * Decreases the member's balance (others have repaid them).
 *
 * @example
 *   getTotalSettlementsReceived("B", [{ paid_to:"B", amount:300 }])
 *   → 300
 */
export function getTotalSettlementsReceived(
  memberId: string,
  settlements: Settlement[]
): number {
  const total = settlements
    .filter((s) => s.paid_to === memberId)
    .reduce((sum, s) => sum + s.amount, 0);

  return roundMoney(total);
}

/**
 * Credit this member gave away via cover bills (no cash — balance transfer).
 * Decreases the helper's balance (their credit is consumed).
 *
 * @example
 *   getTotalCoverBillsGiven("Aizaz", [{ helper_id:"Aizaz", amount:500 }])
 *   → 500
 */
export function getTotalCoverBillsGiven(
  memberId: string,
  coverBills: CoverBill[]
): number {
  const total = coverBills
    .filter((cb) => cb.helper_id === memberId)
    .reduce((sum, cb) => sum + cb.amount, 0);

  return roundMoney(total);
}

/**
 * Credit this member received from others via cover bills (no cash — balance transfer).
 * Increases the beneficiary's balance (their debt is reduced).
 *
 * @example
 *   getTotalCoverBillsReceived("KhanG", [{ beneficiary_id:"KhanG", amount:500 }])
 *   → 500
 */
export function getTotalCoverBillsReceived(
  memberId: string,
  coverBills: CoverBill[]
): number {
  const total = coverBills
    .filter((cb) => cb.beneficiary_id === memberId)
    .reduce((sum, cb) => sum + cb.amount, 0);

  return roundMoney(total);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main calculation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate the running balance for every member.
 *
 *   balance = (total_paid + total_settlements_received + total_cover_bills_received)
 *           - (total_owed + total_settlements_made    + total_cover_bills_given)
 *
 * All three transaction types are zero-sum — the sum of all member balances = 0.
 * Result is sorted highest-first so creditors appear at the top of any list.
 *
 * @param settlements  - pass [] if none exist (backwards-compatible)
 * @param coverBills   - pass [] if none exist (backwards-compatible)
 */
export function calculateMemberBalances(
  members: Member[],
  expenses: Expense[],
  participants: ExpenseParticipant[],
  settlements: Settlement[] = [],
  coverBills: CoverBill[]   = []
): MemberBalance[] {
  const balances: MemberBalance[] = members.map((member) => {
    const total_paid                   = getTotalPaidByMember(member.id, expenses);
    const total_owed                   = getTotalOwedByMember(member.id, participants);
    const total_settlements_made       = getTotalSettlementsMade(member.id, settlements);
    const total_settlements_received   = getTotalSettlementsReceived(member.id, settlements);
    const total_cover_bills_given      = getTotalCoverBillsGiven(member.id, coverBills);
    const total_cover_bills_received   = getTotalCoverBillsReceived(member.id, coverBills);

    const balance = roundMoney(
      (total_paid + total_settlements_received + total_cover_bills_received) -
      (total_owed + total_settlements_made     + total_cover_bills_given)
    );

    return {
      member,
      total_paid,
      total_owed,
      total_settlements_made,
      total_settlements_received,
      total_cover_bills_given,
      total_cover_bills_received,
      balance,
    };
  });

  balances.sort((a, b) => b.balance - a.balance);
  return balances;
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helper
// ─────────────────────────────────────────────────────────────────────────────

export type BalanceStatus = "creditor" | "debtor" | "settled";

export interface BalanceDisplay {
  status:    BalanceStatus;
  label:     string;   // "Gets back" | "Owes" | "Settled"
  textClass: string;   // Tailwind text colour
  bgClass:   string;   // Tailwind background colour (for badges)
}

/**
 * Map a balance number to display metadata so components contain
 * no conditional colour logic.
 *
 * @example  getBalanceDisplay(600)   → { status:"creditor", label:"Gets back", ... }
 * @example  getBalanceDisplay(-300)  → { status:"debtor",   label:"Owes", ...      }
 * @example  getBalanceDisplay(0)     → { status:"settled",  label:"Settled", ...   }
 */
export function getBalanceDisplay(balance: number): BalanceDisplay {
  if (balance > 0) {
    return { status: "creditor", label: "Gets back", textClass: "text-green-700", bgClass: "bg-green-50"  };
  }
  if (balance < 0) {
    return { status: "debtor",   label: "Owes",       textClass: "text-red-600",   bgClass: "bg-red-50"   };
  }
  return   { status: "settled",  label: "Settled",    textClass: "text-gray-500",  bgClass: "bg-gray-100" };
}
