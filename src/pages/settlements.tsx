import { useEffect, useState } from "react";
import MainLayout from "@/components/layout/MainLayout";
import Button from "@/components/ui/Button";
import SettlementForm from "@/components/settlements/SettlementForm";
import SettlementList from "@/components/settlements/SettlementList";
import {
  getSettlementsWithMembers,
  addSettlement,
  deleteSettlement,
  type SettlementWithMembers,
} from "@/services/settlementService";
import { getMembers } from "@/services/memberService";
import { fetchMemberBalances } from "@/services/balanceService";
import { formatCurrency } from "@/utils/formatters";
import type { Member, NewSettlementInput } from "@/types";

export default function SettlementsPage() {
  const [settlements, setSettlements] = useState<SettlementWithMembers[]>([]);
  const [members,     setMembers]     = useState<Member[]>([]);
  const [balanceMap,  setBalanceMap]  = useState<Record<string, number>>({});
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [showForm,    setShowForm]    = useState(false);
  const [successMsg,  setSuccessMsg]  = useState<string | null>(null);

  // ── Fetch on mount ───────────────────────────────────────────────────────
  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [s, m, balances] = await Promise.all([
        getSettlementsWithMembers(),
        getMembers(),
        fetchMemberBalances(),
      ]);
      setSettlements(s);
      setMembers(m);
      // Build memberId → balance lookup for the form
      const map: Record<string, number> = {};
      for (const b of balances) map[b.member.id] = b.balance;
      setBalanceMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }

  // ── Add settlement ───────────────────────────────────────────────────────
  async function handleAdd(input: NewSettlementInput) {
    await addSettlement(input); // throws on error — SettlementForm catches it
    // Reload everything so balances and list are fresh
    const [fresh, balances] = await Promise.all([
      getSettlementsWithMembers(),
      fetchMemberBalances(),
    ]);
    setSettlements(fresh);
    const map: Record<string, number> = {};
    for (const b of balances) map[b.member.id] = b.balance;
    setBalanceMap(map);
    setShowForm(false);

    // Success message
    const giver    = members.find((m) => m.id === input.paid_by);
    const receiver = members.find((m) => m.id === input.paid_to);
    const giverName    = giver    ? (giver.nickname    ?? giver.name)    : "Giver";
    const receiverName = receiver ? (receiver.nickname ?? receiver.name) : "Receiver";
    setSuccessMsg(
      `${giverName} gave ${receiverName} ${formatCurrency(input.amount)}.`
    );
    setTimeout(() => setSuccessMsg(null), 5000);
  }

  // ── Delete settlement ────────────────────────────────────────────────────
  async function handleDelete(id: string) {
    await deleteSettlement(id);
    // Reload balances too so form stays accurate
    const balances = await fetchMemberBalances();
    const map: Record<string, number> = {};
    for (const b of balances) map[b.member.id] = b.balance;
    setBalanceMap(map);
    setSettlements((prev) => prev.filter((s) => s.id !== id));
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  const totalSettled = settlements.reduce((sum, s) => sum + s.amount, 0);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <MainLayout>
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settlements</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {!loading && settlements.length > 0
              ? `${settlements.length} settlement${settlements.length !== 1 ? "s" : ""} · ${formatCurrency(totalSettled)} transferred`
              : "Record cash payments between members"}
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>+ Record Settlement</Button>
        )}
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="mb-4 flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
          <span className="flex-shrink-0">✓</span>
          <span>{successMsg} Balances updated.</span>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div className="mb-6">
          {members.length < 2 ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-700">
              You need at least 2 members to record a settlement.{" "}
              <a href="/members" className="underline font-medium">Add members →</a>
            </div>
          ) : (
            <SettlementForm
              members={members}
              balanceMap={balanceMap}
              onSubmit={handleAdd}
              onCancel={() => setShowForm(false)}
            />
          )}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
          <p className="text-sm text-red-600">{error}</p>
          <Button variant="secondary" size="sm" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {/* How settlements work — shown only when list is empty & loaded */}
      {!loading && !error && settlements.length === 0 && !showForm && (
        <div className="mb-6 bg-blue-50 border border-blue-100 rounded-xl p-4 text-sm text-blue-700 space-y-1">
          <p className="font-medium">How settlements work</p>
          <p>
            A member with a <strong>positive balance</strong> (the giver) hands cash to a
            member with a <strong>negative balance</strong> (the receiver). Record it here and
            both balances adjust instantly.
          </p>
          <p className="text-blue-500">
            Example: Rafi has +₨500. Sabbir has −₨500. Rafi gives Sabbir ₨500 cash → both go to ₨0.
          </p>
        </div>
      )}

      {/* Settlement list */}
      {!loading && !error && (
        <SettlementList
          settlements={settlements}
          onDelete={handleDelete}
        />
      )}
    </MainLayout>
  );
}
