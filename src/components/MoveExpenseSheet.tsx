"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Expense, type Group } from "@/lib/db";
import { planMove, type MovePlan } from "@/lib/moveExpense";
import { moveExpenseRemote } from "@/lib/sync";
import type { useGroup } from "@/lib/useGroup";
import { useT } from "@/lib/i18n";
import { Sheet } from "./ui";

type GroupData = NonNullable<ReturnType<typeof useGroup>>;

/** Pick another group to move an expense to. Only groups with the very same members can take it. */
export function MoveExpenseSheet({ data, expense, onClose, onMoved }: { data: GroupData; expense: Expense; onClose: () => void; onMoved: () => void }) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useLiveQuery(async () => {
    const groups = (await db.groups.toArray()).filter((g) => g.id !== data.group.id);
    return Promise.all(
      groups.map(async (g) => {
        const [members, categories, expenses] = await Promise.all([
          db.members.where("group_id").equals(g.id).toArray(),
          db.categories.where("group_id").equals(g.id).toArray(),
          db.expenses.where("group_id").equals(g.id).toArray(),
        ]);
        const importKeys = new Set(expenses.map((e) => e.import_key).filter((k): k is string => !!k));
        return { group: g, plan: planMove(data, { members, categories, importKeys }, expense) };
      }),
    );
  }, [data.group.id, data.members, data.categories, expense]);

  const online = typeof navigator === "undefined" || navigator.onLine;
  const pending = data.pending.has(expense.id);
  const why = (plan: MovePlan) =>
    plan.ok ? "" : plan.reason === "members" ? t("Different members") : plan.reason === "category" ? t("Category missing there") : t("Already imported there");

  async function move(group: Group, plan: Extract<MovePlan, { ok: true }>) {
    if (group.closed && !confirm(t("\"{name}\" is already marked as paid. Move the expense there anyway?", { name: group.name }))) return;
    setBusy(true);
    setError(null);
    try {
      await moveExpenseRemote(expense.id, group.id, plan);
      onMoved();
    } catch {
      setError(t("Could not move the expense."));
      setBusy(false);
    }
  }

  return (
    <Sheet title={t("Move to another group")} onClose={onClose}>
      <div className="space-y-2 px-4 py-4">
        {!online && <p className="text-bad">{t("You need to be online to move an expense.")}</p>}
        {pending && <p className="text-bad">{t("Some changes are still syncing. Try again in a moment.")}</p>}
        {error && <p className="text-bad">{error}</p>}
        {options?.length === 0 && <p className="text-muted">{t("There is no other group.")}</p>}
        {options?.map(({ group, plan }) => (
          <button
            key={group.id}
            disabled={!plan.ok || !online || pending || busy}
            onClick={() => plan.ok && void move(group, plan)}
            className="flex w-full items-center justify-between rounded-xl bg-surface2 px-4 py-3.5 text-left disabled:opacity-40"
          >
            <span className="text-lg">{group.name}</span>
            {plan.ok ? group.closed && <span className="text-sm text-muted">{t("Paid")}</span> : <span className="text-sm text-muted">{why(plan)}</span>}
          </button>
        ))}
      </div>
    </Sheet>
  );
}
