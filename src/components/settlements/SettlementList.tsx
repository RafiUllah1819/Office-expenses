import { Fragment, useState } from "react";
import Button from "@/components/ui/Button";
import { formatCurrency, formatDate, getInitials } from "@/utils/formatters";
import type { SettlementWithMembers } from "@/services/settlementService";

interface SettlementListProps {
  settlements: SettlementWithMembers[];
  onDelete: (id: string) => Promise<void>;
}

export default function SettlementList({
  settlements,
  onDelete,
}: SettlementListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [rowError, setRowError]     = useState<Record<string, string>>({});

  async function handleDelete(id: string) {
    const confirmed = window.confirm(
      "Undo this settlement?\n\nThe balances will revert to before this payment was recorded."
    );
    if (!confirmed) return;

    setDeletingId(id);
    setRowError((prev) => ({ ...prev, [id]: "" }));
    try {
      await onDelete(id);
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Could not delete.",
      }));
    } finally {
      setDeletingId(null);
    }
  }

  if (settlements.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center text-gray-400 text-sm">
        No settlements recorded yet. Use the form above to record a payment.
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {["Date", "Giver", "", "Receiver", "Amount", "Note", ""].map((h, i) => (
                <th
                  key={i}
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {settlements.map((s) => {
              const giverName    = s.giver.nickname    ?? s.giver.name;
              const receiverName = s.receiver.nickname ?? s.receiver.name;
              const isDeleting   = deletingId === s.id;
              const err          = rowError[s.id];

              return (
                <Fragment key={s.id}>
                  <tr className="hover:bg-gray-50 transition-colors">
                    {/* Date */}
                    <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(s.date)}
                    </td>

                    {/* Giver avatar + name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {getInitials(giverName)}
                        </div>
                        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                          {giverName}
                        </span>
                      </div>
                    </td>

                    {/* Arrow */}
                    <td className="px-2 py-3 text-gray-400 text-sm select-none">
                      →
                    </td>

                    {/* Receiver avatar + name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          {getInitials(receiverName)}
                        </div>
                        <span className="text-sm font-medium text-gray-900 whitespace-nowrap">
                          {receiverName}
                        </span>
                      </div>
                    </td>

                    {/* Amount */}
                    <td className="px-4 py-3 text-sm font-semibold text-green-700 whitespace-nowrap">
                      {formatCurrency(s.amount)}
                    </td>

                    {/* Note */}
                    <td className="px-4 py-3 text-sm text-gray-400 max-w-[160px] truncate">
                      {s.note ?? <span className="italic">—</span>}
                    </td>

                    {/* Delete */}
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="danger"
                        size="sm"
                        loading={isDeleting}
                        onClick={() => handleDelete(s.id)}
                      >
                        Undo
                      </Button>
                    </td>
                  </tr>

                  {/* Inline error row */}
                  {err && (
                    <tr className="bg-red-50">
                      <td colSpan={7} className="px-4 py-2 text-sm text-red-600">
                        {err}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
