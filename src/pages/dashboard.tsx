import { useEffect, useState } from "react";
import Link from "next/link";
import MainLayout from "@/components/layout/MainLayout";
import Button from "@/components/ui/Button";
import { fetchMemberBalances } from "@/services/balanceService";
import { getExpensesWithDetails } from "@/services/expenseService";
import { formatCurrency, formatDate, getInitials } from "@/utils/formatters";
import { getBalanceDisplay } from "@/lib/calculations";
import type { MemberBalance, ExpenseListItem } from "@/types";

// ─────────────────────────────────────────────────────────────────────────────
// Local sub-components — dashboard-specific, no need for separate files
// ─────────────────────────────────────────────────────────────────────────────

/** Plain metric card — label / big value / small sub-text */
function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

/**
 * Highlight card — draws attention to one member with a coloured left border.
 * Used for "top payer" and "biggest debtor".
 */
function HighlightCard({
  heading,
  name,
  detail,
  amount,
  amountLabel,
  accent,
}: {
  heading: string;
  name: string;
  detail: string;
  amount: string;
  amountLabel: string;
  accent: "green" | "red";
}) {
  const border = accent === "green" ? "border-l-green-400" : "border-l-red-400";
  const amountColor =
    accent === "green" ? "text-green-700" : "text-red-600";
  const initials = getInitials(name);
  const avatarBg = accent === "green" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600";

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 border-l-4 ${border}`}
    >
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {heading}
      </p>
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${avatarBg}`}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
          <p className="text-xs text-gray-400">{detail}</p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className={`text-base font-bold ${amountColor}`}>{amount}</p>
          <p className="text-xs text-gray-400">{amountLabel}</p>
        </div>
      </div>
    </div>
  );
}

/** One row in the "Recent Expenses" compact list */
function RecentExpenseRow({ expense }: { expense: ExpenseListItem }) {
  const payerName = expense.payer.nickname ?? expense.payer.name;
  const count = expense.expense_participants.length;

  return (
    <div className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-0">
      {/* Payer avatar */}
      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
        {getInitials(payerName)}
      </div>

      {/* Title + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {expense.title}
        </p>
        <p className="text-xs text-gray-400">
          {payerName} &middot; {count} member{count !== 1 ? "s" : ""} &middot;{" "}
          {formatDate(expense.date)}
        </p>
      </div>

      {/* Amount */}
      <p className="text-sm font-semibold text-gray-900 flex-shrink-0">
        {formatCurrency(expense.amount)}
      </p>
    </div>
  );
}

/** Skeleton block used while data is loading */
function Skeleton({ className }: { className: string }) {
  return <div className={`bg-gray-100 rounded animate-pulse ${className}`} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

const RECENT_COUNT = 5;

export default function DashboardPage() {
  const [balances,  setBalances]  = useState<MemberBalance[]>([]);
  const [expenses,  setExpenses]  = useState<ExpenseListItem[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      // Both fetches run at the same time — no waiting for one before the other
      const [bal, exp] = await Promise.all([
        fetchMemberBalances(),
        getExpensesWithDetails(),
      ]);
      setBalances(bal);
      setExpenses(exp);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  // ── Derived stats (computed only when data is ready) ────────────────────
  const totalMembers   = balances.length;
  const totalExpenses  = expenses.length;
  const totalSpent     = expenses.reduce((s, e) => s + e.amount, 0);
  const unsettled      = balances.filter((b) => b.balance !== 0).length;

  const todayStr  = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const monthStr  = todayStr.slice(0, 7);                  // "YYYY-MM"

  const todayExpenses  = expenses.filter((e) => e.date.slice(0, 10) === todayStr);
  const monthExpenses  = expenses.filter((e) => e.date.slice(0, 7) === monthStr);

  const todaySpent  = todayExpenses.reduce((s, e) => s + e.amount, 0);
  const monthSpent  = monthExpenses.reduce((s, e) => s + e.amount, 0);

  // Top payer = member with highest total_paid
  const topPayer = balances.length > 0
    ? balances.reduce((best, b) =>
        b.total_paid > best.total_paid ? b : best
      )
    : null;

  // Biggest debtor = member with most negative balance
  const debtors    = balances.filter((b) => b.balance < 0);
  const topDebtor  = debtors.length > 0
    ? debtors.reduce((worst, b) =>
        b.balance < worst.balance ? b : worst
      )
    : null;

  const recentExpenses = expenses.slice(0, RECENT_COUNT);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <Link href="/expenses/add">
          <Button>+ Add Expense</Button>
        </Link>
      </div>

      {/* ── Error ──────────────────────────────────────────────────────── */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between mb-6">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="secondary" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {/* ── Stat cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {loading ? (
          <>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <div key={n} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-24" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </>
        ) : (
          <>
            <StatCard
              label="Members"
              value={String(totalMembers)}
              sub={totalMembers === 0 ? "Add your first member" : "in the group"}
            />
            <StatCard
              label="Expenses"
              value={String(totalExpenses)}
              sub={totalExpenses === 0 ? "None recorded yet" : "recorded"}
            />
            <StatCard
              label="Total Spent"
              value={formatCurrency(totalSpent)}
              sub="all time"
            />
            <StatCard
              label="Unsettled"
              value={String(unsettled)}
              sub={
                unsettled === 0
                  ? "everyone is even"
                  : `member${unsettled !== 1 ? "s" : ""} with open balance`
              }
            />
            <StatCard
              label="Today's Expenses"
              value={formatCurrency(todaySpent)}
              sub={
                todayExpenses.length === 0
                  ? "no expenses today"
                  : `${todayExpenses.length} expense${todayExpenses.length !== 1 ? "s" : ""} today`
              }
            />
            <StatCard
              label="This Month"
              value={formatCurrency(monthSpent)}
              sub={
                monthExpenses.length === 0
                  ? "no expenses this month"
                  : `${monthExpenses.length} expense${monthExpenses.length !== 1 ? "s" : ""} this month`
              }
            />
          </>
        )}
      </div>

      {/* ── Highlight cards (top payer + biggest debtor) ───────────────── */}
      {!loading && (topPayer || topDebtor) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {topPayer && topPayer.total_paid > 0 && (
            <HighlightCard
              heading="Top Payer"
              name={topPayer.member.nickname ?? topPayer.member.name}
              detail="paid the most overall"
              amount={formatCurrency(topPayer.total_paid)}
              amountLabel="total paid"
              accent="green"
            />
          )}
          {topDebtor && (
            <HighlightCard
              heading="Biggest Debtor"
              name={topDebtor.member.nickname ?? topDebtor.member.name}
              detail={getBalanceDisplay(topDebtor.balance).label}
              amount={formatCurrency(Math.abs(topDebtor.balance))}
              amountLabel="owes the group"
              accent="red"
            />
          )}
        </div>
      )}

      {/* Highlight card skeletons */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          {[1, 2].map((n) => (
            <div key={n} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 border-l-4 border-l-gray-200">
              <Skeleton className="h-3 w-20 mb-3" />
              <div className="flex items-center gap-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Recent expenses ────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-800">
            Recent Expenses
          </h2>
          {!loading && expenses.length > RECENT_COUNT && (
            <Link
              href="/expenses"
              className="text-xs text-blue-600 hover:underline"
            >
              View all {expenses.length} →
            </Link>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4">
          {/* Loading skeleton rows */}
          {loading && (
            <div className="divide-y divide-gray-100">
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="flex items-center gap-3 py-3">
                  <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && expenses.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-sm text-gray-400 mb-3">No expenses yet.</p>
              <Link href="/expenses/add">
                <Button size="sm" variant="secondary">
                  Add the first one →
                </Button>
              </Link>
            </div>
          )}

          {/* Expense rows */}
          {!loading && recentExpenses.map((expense) => (
            <RecentExpenseRow key={expense.id} expense={expense} />
          ))}

          {/* Footer link if list is truncated */}
          {!loading && expenses.length > RECENT_COUNT && (
            <div className="py-3 text-center border-t border-gray-100">
              <Link
                href="/expenses"
                className="text-xs text-blue-600 hover:underline"
              >
                See all {expenses.length} expenses →
              </Link>
            </div>
          )}
        </div>
      </section>
    </MainLayout>
  );
}
