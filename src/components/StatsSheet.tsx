"use client";

import { useMemo, useState } from "react";
import { formatMoney } from "@/lib/money";
import type { useGroup } from "@/lib/useGroup";
import { useT } from "@/lib/i18n";
import { Avatar, Sheet } from "./ui";
import { ExpenseSheet } from "./ExpenseSheet";

type GroupData = NonNullable<ReturnType<typeof useGroup>>;

/** Spending grouped by category, biggest first. Tap a category to see its expenses, tap an expense to edit it. */
export function StatsSheet({ data, meUserId, onClose }: { data: GroupData; meUserId: string; onClose: () => void }) {
  const { t, lang } = useT();
  const [month, setMonth] = useState<string>("all");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const fmt = (c: number) => formatMoney(c, data.group.currency, lang);
  const count = (n: number) => (n === 1 ? t("1 expense") : t("{n} expenses", { n }));

  const spending = useMemo(() => data.expenses.filter((e) => !e.is_transfer), [data.expenses]);
  const months = useMemo(() => [...new Set(spending.map((e) => e.spent_at.slice(0, 7)))].sort().reverse(), [spending]);

  const { total, rows } = useMemo(() => {
    const known = new Set(data.categories.map((c) => c.id));
    const inPeriod = spending.filter((e) => month === "all" || e.spent_at.startsWith(month));
    const byKey = new Map<string, { key: string; cents: number; items: typeof inPeriod }>();
    for (const e of inPeriod) {
      const key = e.category_id && known.has(e.category_id) ? e.category_id : "none";
      const row = byKey.get(key) ?? { key, cents: 0, items: [] };
      row.cents += e.amount_cents;
      row.items.push(e); // already newest first
      byKey.set(key, row);
    }
    return {
      total: inPeriod.reduce((a, e) => a + e.amount_cents, 0),
      rows: [...byKey.values()].sort((a, b) => b.cents - a.cents),
    };
  }, [spending, month, data.categories]);

  const nameOf = (id: string) => data.members.find((m) => m.id === id);

  return (
    <Sheet title={t("Spending by category")} onClose={onClose}>
      <div className="px-4 pb-6 pt-3">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="text-3xl font-bold text-owe">{fmt(total)}</div>
            <div className="text-sm text-muted">{count(rows.reduce((a, r) => a + r.items.length, 0))}</div>
          </div>
          {months.length > 1 && (
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="rounded-xl bg-surface2 px-3 py-2 text-base outline-none">
              <option value="all">{t("All time")}</option>
              {months.map((m) => (
                <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString(lang, { month: "long", year: "numeric" })}</option>
              ))}
            </select>
          )}
        </div>

        {rows.length === 0 && <p className="text-muted">{t("No expenses in this period.")}</p>}

        {rows.map((r) => {
          const cat = data.categories.find((c) => c.id === r.key);
          const pct = total ? (r.cents / total) * 100 : 0;
          const isOpen = open === r.key;
          return (
            <div key={r.key} className="border-b border-white/10 last:border-0">
              <button onClick={() => setOpen(isOpen ? null : r.key)} aria-expanded={isOpen} className="block w-full py-3 text-left active:opacity-70">
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-lg">
                    {cat ? `${cat.emoji} ${cat.name}` : t("∅ Uncategorised")}
                    <span className="ml-2 text-sm text-muted">{count(r.items.length)}</span>
                  </span>
                  <span className="whitespace-nowrap font-semibold">
                    {fmt(r.cents)} <span className="text-sm font-normal text-muted">{pct.toFixed(0)}%</span>
                  </span>
                  <span className={`text-muted transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface2">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(pct, 1)}%` }} />
                </div>
              </button>

              {isOpen && (
                <div className="mb-3 overflow-hidden rounded-xl bg-black/40">
                  {r.items.map((e) => {
                    const payer = nameOf(e.paid_by);
                    return (
                      <button key={e.id} onClick={() => setEditing(e.id)} className="flex w-full items-center gap-3 border-b border-white/5 px-3 py-2.5 text-left last:border-0 active:bg-surface2">
                        <Avatar member={payer} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{e.title}</span>
                          <span className="block text-xs text-muted">{new Date(e.spent_at).toLocaleDateString(lang)} · {payer?.name}</span>
                        </span>
                        <span className="font-semibold text-owe">{fmt(e.amount_cents)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {editing && <ExpenseSheet data={data} meUserId={meUserId} expenseId={editing} onClose={() => setEditing(null)} />}
    </Sheet>
  );
}
