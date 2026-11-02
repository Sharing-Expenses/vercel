"use client";

import { useMemo, useRef, useState } from "react";
import type { Expense, SplitModeName } from "@/lib/db";
import { suggestCategory } from "@/lib/autoCategory";
import { computeSplit, distribute, type SplitInput } from "@/lib/split";
import { formatMoney, parseMoney } from "@/lib/money";
import { deleteExpenseLocal, saveExpenseLocal } from "@/lib/sync";
import { useT } from "@/lib/i18n";
import type { useGroup } from "@/lib/useGroup";
import { Avatar, PrimaryButton, Sheet } from "./ui";

type GroupData = NonNullable<ReturnType<typeof useGroup>>;

const MODES: { id: SplitModeName; label: string }[] = [
  { id: "amounts", label: "Amounts" },
  { id: "percent", label: "%" },
  { id: "shares", label: "Shares" },
];

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const num = (s: string) => parseFloat(s.replace(",", "."));
const centsToStr = (c: number) => (c / 100).toFixed(2);

/** Default per-member values for a mode, splitting the total equally. */
function equalValues(mode: SplitModeName, ids: string[], totalCents: number): Record<string, string> {
  const out: Record<string, string> = {};
  if (mode === "shares") ids.forEach((id) => (out[id] = "1"));
  else if (mode === "percent") {
    const parts = distribute(10000, ids.map(() => 1));
    ids.forEach((id, i) => (out[id] = String(parts[i] / 100)));
  } else {
    const parts = distribute(totalCents, ids.map(() => 1));
    ids.forEach((id, i) => (out[id] = centsToStr(parts[i])));
  }
  return out;
}

export function ExpenseSheet({
  data, meUserId, expenseId, onClose,
}: {
  data: GroupData;
  meUserId: string;
  expenseId?: string;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const existing = expenseId ? data.expenses.find((e) => e.id === expenseId) : undefined;
  const me = data.members.find((m) => m.user_id === meUserId);
  const currency = data.group.currency;

  const [title, setTitle] = useState(existing?.title ?? "");
  const [amountStr, setAmountStr] = useState(existing ? centsToStr(existing.amount_cents) : "");
  const [paidBy, setPaidBy] = useState(existing?.paid_by ?? me?.id ?? data.members[0]?.id);
  const [categoryId, setCategoryId] = useState<string | null>(existing?.category_id ?? null);
  const [date, setDate] = useState(toLocalInput(existing?.spent_at ?? new Date().toISOString()));
  const [mode, setMode] = useState<SplitModeName>(existing?.split_mode ?? "shares");
  const [saving, setSaving] = useState(false);
  // the category was picked by hand: never overwrite it with a guess
  const pickedByHand = useRef(!!existing?.category_id);

  const [included, setIncluded] = useState<Set<string>>(
    new Set(existing ? existing.shares.filter((s) => s.cents > 0 || existing.shares.length === 1).map((s) => s.memberId) : data.members.map((m) => m.id)),
  );
  const [vals, setVals] = useState<Record<string, string>>(() => {
    if (!existing) return equalValues("shares", data.members.map((m) => m.id), 0);
    // Re-open with what was originally typed (amounts are re-derived from cents).
    const out: Record<string, string> = {};
    for (const s of existing.shares) {
      out[s.memberId] = existing.split_mode === "amounts" || s.inputValue == null ? centsToStr(s.cents) : String(s.inputValue);
    }
    return out;
  });
  const [dirty, setDirty] = useState(!!existing);

  const total = parseMoney(amountStr) ?? 0;
  const ids = data.members.map((m) => m.id).filter((id) => included.has(id));

  const result = useMemo(() => {
    const inputs: SplitInput[] = ids.map((id) => {
      const raw = vals[id] ?? "";
      const value = mode === "amounts" ? parseMoney(raw) ?? 0 : isNaN(num(raw)) ? 0 : num(raw);
      return { memberId: id, value };
    });
    return computeSplit(total, mode, inputs);
  }, [ids, vals, mode, total]);

  const changeMode = (m: SplitModeName) => {
    setMode(m);
    setVals(equalValues(m, ids, total));
    setDirty(false);
  };

  const toggle = (id: string) => {
    const next = new Set(included);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setIncluded(next);
    const nextIds = data.members.map((m) => m.id).filter((x) => next.has(x));
    setVals(equalValues(mode, nextIds, total));
    setDirty(false);
  };

  /** When leaving the subject field, tag the expense from its description (own history first, then keywords). */
  const autoCategory = () => {
    if (pickedByHand.current) return;
    const guess = suggestCategory(title, data.categories, data.expenses.filter((e) => !e.is_transfer && e.id !== existing?.id));
    if (guess) setCategoryId(guess);
  };

  const onAmount = (v: string) => {
    setAmountStr(v);
    if (mode === "amounts" && !dirty) setVals(equalValues("amounts", ids, parseMoney(v) ?? 0));
  };

  const canSave = !!title.trim() && total > 0 && !!paidBy && result.ok && !saving;

  async function save() {
    if (!canSave || !result.ok) return;
    setSaving(true);
    const id = existing?.id ?? crypto.randomUUID();
    const expense: Expense = {
      id, group_id: data.group.id, title: title.trim(), amount_cents: total, paid_by: paidBy!, category_id: categoryId,
      spent_at: new Date(date).toISOString(), split_mode: mode, is_transfer: false,
      created_by: existing?.created_by ?? meUserId, updated_at: new Date().toISOString(), deleted_at: null,
    };
    await saveExpenseLocal(
      expense,
      result.shares.map((s) => ({
        expense_id: id, member_id: s.memberId, cents: s.cents,
        input_value: mode === "amounts" ? null : num(vals[s.memberId] ?? "0"),
      })),
    );
    onClose();
  }

  async function remove() {
    if (!existing || !confirm(t("Delete this expense?"))) return;
    await deleteExpenseLocal(existing.id);
    onClose();
  }

  const centsFor = (id: string) => (result.ok ? result.shares.find((s) => s.memberId === id)?.cents : undefined);

  const currencySymbol = new Intl.NumberFormat(lang, { style: "currency", currency }).formatToParts(0).find((p) => p.type === "currency")?.value ?? currency;

  return (
    <Sheet
      title={t("Expense details")}
      onClose={onClose}
      right={
        existing && (
          <button onClick={remove} aria-label={t("Delete expense")} className="h-8 w-8 rounded-full bg-surface2 text-base">
            🗑️
          </button>
        )
      }
      footer={
        <div className="px-4 pb-1 pt-2.5">
          <PrimaryButton onClick={save} disabled={!canSave} className="!py-3">{t("Save")}</PrimaryButton>
        </div>
      }
    >
      <div className="space-y-3 px-4 py-3">
        {/* subject + amount on one row */}
        <div className="flex items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={autoCategory} placeholder={t("What was it for?")} aria-label={t("Subject")} className="min-w-0 flex-1 rounded-xl bg-surface2 px-3 py-2.5 text-base outline-none placeholder:text-white/30" />
          <label className="flex w-[6.25rem] shrink-0 items-center rounded-xl bg-surface2 px-2.5 py-2.5">
            <input value={amountStr} onChange={(e) => onAmount(e.target.value)} inputMode="decimal" placeholder="0,00" aria-label={t("Amount ({currency})", { currency })} className="w-full min-w-0 bg-transparent text-right text-base font-semibold tabular-nums text-owe outline-none placeholder:text-white/20" />
            <span className="ml-1 text-sm text-muted">{currencySymbol}</span>
          </label>
        </div>

        {/* one row of categories that scrolls sideways, to save vertical space */}
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {data.categories.map((c) => (
            <button key={c.id} onClick={() => { pickedByHand.current = true; setCategoryId(categoryId === c.id ? null : c.id); }} className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${categoryId === c.id ? "bg-accent text-black" : "bg-surface2"}`}>
              {c.emoji} {c.name}
            </button>
          ))}
        </div>

        <div>
          <div className="mb-1 text-xs text-muted">{t("Who paid")}</div>
          <div className="flex flex-wrap gap-1.5">
            {data.members.map((m) => (
              <button key={m.id} onClick={() => setPaidBy(m.id)} className={`flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-3 text-sm ${paidBy === m.id ? "bg-accent text-black" : "bg-surface2"}`}>
                <Avatar member={m} size={24} /> {m.name}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-xs text-muted">{t("For whom")}</div>
          <div className="mb-1 grid grid-cols-3 rounded-xl bg-surface2 p-0.5">
            {MODES.map((m) => (
              <button key={m.id} onClick={() => changeMode(m.id)} className={`rounded-[10px] py-1 text-sm font-medium ${mode === m.id ? "bg-accent text-black" : "text-accent"}`}>
                {t(m.label)}
              </button>
            ))}
          </div>
          {data.members.map((m) => {
            const on = included.has(m.id);
            const c = centsFor(m.id);
            return (
              <div key={m.id} className="flex items-center gap-2.5 border-b border-white/10 py-1.5 last:border-0">
                <button onClick={() => toggle(m.id)} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm ${on ? "border-accent bg-accent text-black" : "border-white/30"}`} aria-label={t("Include {name}", { name: m.name })}>
                  {on && "✓"}
                </button>
                <Avatar member={m} size={28} />
                <div className={`min-w-0 flex-1 truncate ${on ? "" : "text-white/40"}`}>
                  {m.name}
                  {on && c !== undefined && mode !== "amounts" && <span className="ml-1.5 text-xs text-muted">{formatMoney(c, currency, lang)}</span>}
                </div>
                {on && (
                  <div className="flex items-center gap-1 text-owe">
                    <input
                      value={vals[m.id] ?? ""}
                      onChange={(e) => { setVals({ ...vals, [m.id]: e.target.value }); setDirty(true); }}
                      inputMode="decimal"
                      aria-label={m.name}
                      className="w-[4.5rem] rounded-lg bg-surface2 px-2 py-1 text-right text-base font-semibold outline-none"
                    />
                    <span className="w-4 text-sm text-muted">{mode === "percent" ? "%" : mode === "amounts" ? "" : "×"}</span>
                  </div>
                )}
              </div>
            );
          })}
          {!result.ok && total > 0 && <p className="pt-1 text-sm text-bad">{t(result.error)}</p>}
        </div>

        <label className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">{t("Date and time")}</span>
          <input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg bg-surface2 px-2 py-1.5 text-base outline-none [color-scheme:dark]" />
        </label>
      </div>
    </Sheet>
  );
}
