import { useState } from "react";
import Button from "@/components/ui/Button";
import { formatCurrency } from "@/utils/formatters";
import type { Member, NewSettlementInput } from "@/types";

interface SettlementFormProps {
  members: Member[];
  /** memberId → current balance; used to filter eligible givers/receivers */
  balanceMap: Record<string, number>;
  onSubmit: (input: NewSettlementInput) => Promise<void>;
  onCancel: () => void;
}

interface FormFields {
  paid_by: string;
  paid_to: string;
  amount: string;
  date: string;
  note: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyFields(): FormFields {
  return { paid_by: "", paid_to: "", amount: "", date: today(), note: "" };
}

function validate(
  fields: FormFields,
  balanceMap: Record<string, number>
): string | null {
  if (!fields.paid_by) return "Select the giver (member with positive balance).";
  if (!fields.paid_to) return "Select the receiver (member with negative balance).";
  if (fields.paid_by === fields.paid_to) return "Giver and receiver must be different people.";

  const giverBalance = balanceMap[fields.paid_by] ?? 0;
  const receiverBalance = balanceMap[fields.paid_to] ?? 0;

  if (giverBalance <= 0) return "Giver must have a positive balance.";
  if (receiverBalance >= 0) return "Receiver must have a negative balance.";

  const amount = parseFloat(fields.amount);
  if (isNaN(amount) || amount <= 0) return "Amount must be a positive number.";
  if (amount > giverBalance) {
    return `Amount cannot exceed the giver's balance (${formatCurrency(giverBalance)}).`;
  }
  return null;
}

export default function SettlementForm({
  members,
  balanceMap,
  onSubmit,
  onCancel,
}: SettlementFormProps) {
  const [fields,  setFields]  = useState<FormFields>(emptyFields);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Only members with positive balance can be givers
  const eligibleGivers    = members.filter((m) => (balanceMap[m.id] ?? 0) > 0);
  // Only members with negative balance can be receivers
  const eligibleReceivers = members.filter((m) => (balanceMap[m.id] ?? 0) < 0);

  const giverBalance   = fields.paid_by ? (balanceMap[fields.paid_by] ?? 0) : null;

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    setFields((prev) => ({ ...prev, [name]: value }));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validationError = validate(fields, balanceMap);
    if (validationError) { setError(validationError); return; }

    setLoading(true);
    try {
      await onSubmit({
        paid_by: fields.paid_by,
        paid_to: fields.paid_to,
        amount:  parseFloat(fields.amount),
        date:    fields.date,
        note:    fields.note.trim() || undefined,
      });
      setFields(emptyFields());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const noGivers    = eligibleGivers.length === 0;
  const noReceivers = eligibleReceivers.length === 0;

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="bg-green-50 border border-green-200 rounded-xl p-5 space-y-4"
    >
      <h2 className="text-base font-semibold text-gray-800">Record Settlement</h2>

      {/* Warning if no eligible members */}
      {(noGivers || noReceivers) && (
        <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 text-yellow-700 text-sm rounded-lg px-4 py-3">
          <span className="mt-0.5 flex-shrink-0">ℹ</span>
          <span>
            {noGivers && noReceivers
              ? "All balances are settled — no payments needed."
              : noGivers
              ? "No member currently has a positive balance."
              : "No member currently has a negative balance."}
          </span>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{error}</span>
        </div>
      )}

      {/* Giver → Receiver on the same row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="paid_by" className="block text-sm font-medium text-gray-700 mb-1">
            Giver <span className="text-gray-400 font-normal">(positive balance)</span>{" "}
            <span className="text-red-500">*</span>
          </label>
          <select
            id="paid_by"
            name="paid_by"
            value={fields.paid_by}
            onChange={handleChange}
            disabled={loading || noGivers}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          >
            <option value="">Select giver…</option>
            {eligibleGivers.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nickname ?? m.name} ({formatCurrency(balanceMap[m.id] ?? 0)})
              </option>
            ))}
          </select>
          {giverBalance !== null && (
            <p className="mt-1 text-xs text-gray-500">
              Max: {formatCurrency(giverBalance)}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="paid_to" className="block text-sm font-medium text-gray-700 mb-1">
            Receiver <span className="text-gray-400 font-normal">(negative balance)</span>{" "}
            <span className="text-red-500">*</span>
          </label>
          <select
            id="paid_to"
            name="paid_to"
            value={fields.paid_to}
            onChange={handleChange}
            disabled={loading || noReceivers}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          >
            <option value="">Select receiver…</option>
            {eligibleReceivers.map((m) => (
              <option
                key={m.id}
                value={m.id}
                disabled={m.id === fields.paid_by}
              >
                {m.nickname ?? m.name} ({formatCurrency(balanceMap[m.id] ?? 0)})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Amount + Date */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
            Amount (₨) <span className="text-red-500">*</span>
          </label>
          <input
            id="amount"
            name="amount"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="0.00"
            value={fields.amount}
            onChange={handleChange}
            disabled={loading}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>

        <div>
          <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-1">
            Date <span className="text-red-500">*</span>
          </label>
          <input
            id="date"
            name="date"
            type="date"
            value={fields.date}
            onChange={handleChange}
            disabled={loading}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                       focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Note */}
      <div>
        <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-1">
          Note <span className="text-gray-400 font-normal">(optional)</span>
        </label>
        <input
          id="note"
          name="note"
          type="text"
          placeholder='e.g. "via Easypaisa", "cash in hand"'
          value={fields.note}
          onChange={handleChange}
          disabled={loading}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        <Button type="submit" loading={loading} disabled={noGivers || noReceivers}>
          Record Settlement
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
