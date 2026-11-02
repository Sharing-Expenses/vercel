"use client";

import { useMemo, useState } from "react";
import { categoryTotals } from "@/lib/balances";
import { formatMoney } from "@/lib/money";
import type { useGroup } from "@/lib/useGroup";
import { useT } from "@/lib/i18n";
import { Sheet } from "./ui";

type GroupData = NonNullable<ReturnType<typeof useGroup>>;

export function StatsSheet({ data, onClose }: { data: GroupData; onClose: () => void }) {
  const { t, lang } = useT();
  const spending = data.expenses.filter((e) => !e.is_transfer);
  const months = useMemo(() => [...new Set(spending.map((e) => e.spent_at.slice(0, 7)))].sort().reverse(), [spending]);
  const [month, setMonth] = useState<string>("all");
  const rows = useMemo(() => {
    const filtered = spending.filter((e) => month === "all" || e.spent_at.startsWith(month));
    const total = filtered.reduce((a, e) => a + e.amount_cents, 0);
    const cats = categoryTotals(filtered.map((e) => ({ paidBy: e.paid_by, amount: e.amount_cents, shares: e.shares, category: e.category_id })));
    return { total, cats };
  }, [spending, month]);
  const fmt = (c: number) => formatMoney(c, data.group.currency, lang);

  return (
    <Sheet title={t("Spending by category")} onClose={onClose}>
      <div className="p-4">
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="mb-4 w-full rounded-xl bg-surface2 px-3 py-3 outline-none">
          <option value="all">{t("All time")}</option>
          {months.map((m) => (
            <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString(lang, { month: "long", year: "numeric" })}</option>
          ))}
        </select>
        <div className="mb-4 text-3xl font-bold text-owe">{fmt(rows.total)}</div>
        {rows.cats.length === 0 && <p className="text-muted">{t("No expenses in this period.")}</p>}
        {rows.cats.map((c) => {
          const cat = data.categories.find((x) => x.id === c.category);
          const pct = rows.total ? (c.cents / rows.total) * 100 : 0;
          return (
            <div key={c.category} className="mb-4">
              <div className="mb-1 flex justify-between">
                <span>{cat ? `${cat.emoji} ${cat.name}` : t("∅ Uncategorised")}</span>
                <span className="font-semibold">{fmt(c.cents)} <span className="text-sm font-normal text-muted">{pct.toFixed(0)}%</span></span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-surface2">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Sheet>
  );
}
