"use client";

import { useMemo, useState } from "react";
import { buildImportedExpense, decodeCsv, ImportFormatError, parseAmexCsv, partitionRows, type ParsedCsv } from "@/lib/amexImport";
import { suggestCategory } from "@/lib/autoCategory";
import { formatMoney } from "@/lib/money";
import { saveExpenseLocal } from "@/lib/sync";
import { supabase } from "@/lib/supabase/client";
import type { useGroup } from "@/lib/useGroup";
import { useT } from "@/lib/i18n";
import { PrimaryButton, Sheet } from "./ui";

type GroupData = NonNullable<ReturnType<typeof useGroup>>;

/** Import an American Express CSV: every charge becomes an expense paid by the card owner, split equally, flagged to review. */
export function ImportSheet({ data, meUserId, onClose }: { data: GroupData; meUserId: string; onClose: () => void }) {
  const { t, lang } = useT();
  const fmt = (c: number) => formatMoney(c, data.group.currency, lang);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverKeys, setServerKeys] = useState<Set<string> | null>(null);
  const [ownerId, setOwnerId] = useState(data.members.find((m) => m.user_id === meUserId)?.id ?? data.members[0]?.id ?? "");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    setParsed(null);
    setError(null);
    setServerKeys(null);
    if (!file) return;
    let result: ParsedCsv;
    try {
      result = parseAmexCsv(decodeCsv(await file.arrayBuffer()));
    } catch (e) {
      setError(e instanceof ImportFormatError ? t(e.message) : t("Could not read this file."));
      return;
    }
    setParsed(result);
    // Includes soft-deleted expenses, which the local cache never holds. Offline we fall back to the local ones.
    try {
      const { data: remote, error: err } = await supabase()
        .from("expenses")
        .select("import_key")
        .eq("group_id", data.group.id)
        .not("import_key", "is", null);
      if (!err && remote) setServerKeys(new Set(remote.map((r) => r.import_key as string)));
    } catch {
      // offline: the notice below explains it
    }
  }

  const { fresh, duplicates } = useMemo(() => {
    if (!parsed) return { fresh: [], duplicates: [] };
    const known = new Set(serverKeys ?? []);
    for (const e of data.expenses) if (e.import_key) known.add(e.import_key);
    return partitionRows(parsed.rows, known);
  }, [parsed, serverKeys, data.expenses]);

  const owner = data.members.find((m) => m.id === ownerId);
  const canImport = !!owner && fresh.length > 0 && !busy;

  async function run() {
    if (!canImport) return;
    setBusy(true);
    const ctx = { groupId: data.group.id, ownerMemberId: ownerId, memberIds: data.members.map((m) => m.id), userId: meUserId };
    for (const row of fresh) {
      const categoryId = suggestCategory(row.title, data.categories, data.expenses);
      const { expense, shares } = buildImportedExpense(row, { ...ctx, categoryId });
      await saveExpenseLocal(expense, shares);
    }
    onClose();
  }

  return (
    <Sheet
      title={t("Import expenses")}
      onClose={onClose}
      footer={
        <div className="px-4 py-3">
          <PrimaryButton onClick={run} disabled={!canImport} className="!py-3">
            {t("Import {n} expenses", { n: fresh.length })}
          </PrimaryButton>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-4">
        <p className="text-sm text-muted">{t("Choose the CSV exported from American Express (Fecha, Descripción, Importe).")}</p>
        <input type="file" accept=".csv,text/csv" onChange={(e) => void onFile(e.target.files?.[0])} className="w-full text-sm" />
        {error && <p className="text-bad">{error}</p>}

        {data.members.length === 0 ? (
          <p className="text-bad">{t("This group has no members to import for.")}</p>
        ) : (
          <label className="block">
            <span className="text-sm text-muted">{t("Whose card is this?")}</span>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="mt-1 w-full rounded-xl bg-surface2 px-3 py-3 text-base outline-none">
              {data.members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <span className="mt-1 block text-sm text-muted">{t("Paid by this member, split equally between all members.")}</span>
          </label>
        )}

        {parsed && (
          <div className="space-y-2">
            <p className="text-sm">
              {t("{n} to import · {s} skipped (negative or zero) · {d} already imported", { n: fresh.length, s: parsed.skipped, d: duplicates.length })}
            </p>
            {parsed.invalid.length > 0 && (
              <p className="text-sm text-bad">{t("Unreadable rows (line numbers): {lines}", { lines: parsed.invalid.join(", ") })}</p>
            )}
            {!serverKeys && <p className="text-sm text-muted">{t("Offline: duplicates are filtered after the next sync.")}</p>}
            <div className="overflow-hidden rounded-xl bg-surface2">
              {fresh.slice(0, 8).map((r) => (
                <div key={r.key} className="flex items-center gap-3 border-b border-white/10 px-3 py-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{r.title}</div>
                    <div className="text-xs text-muted">{new Date(r.date + "T12:00:00").toLocaleDateString(lang)}</div>
                  </div>
                  <div className="font-semibold text-owe">{fmt(r.cents)}</div>
                </div>
              ))}
              {fresh.length > 8 && <div className="px-3 py-2 text-sm text-muted">{t("… {n} more", { n: fresh.length - 8 })}</div>}
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
