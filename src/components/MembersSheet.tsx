"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/money";
import { sync } from "@/lib/sync";
import { useT } from "@/lib/i18n";
import type { useGroup } from "@/lib/useGroup";
import { Avatar, Sheet } from "./ui";

type GroupData = NonNullable<ReturnType<typeof useGroup>>;

export function MembersSheet({ data, onClose, onInvite }: { data: GroupData; onClose: () => void; onInvite: () => void }) {
  const { t, lang } = useT();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const fmt = (c: number) => formatMoney(c, data.group.currency, lang);

  async function addPlaceholder() {
    if (!name.trim()) return;
    const { error } = await supabase().from("members").insert({ group_id: data.group.id, name: name.trim() });
    if (error) {
      setError(navigator.onLine ? error.message : t("You need to be online to add members."));
      return;
    }
    setName("");
    setError(null);
    await sync();
  }

  return (
    <Sheet title={t("Members")} onClose={onClose}>
      {data.members.map((m) => {
        const tot = data.totals.find((x) => x.memberId === m.id)!;
        return (
          <div key={m.id} className="flex items-center gap-4 border-b border-white/10 px-4 py-4">
            <Avatar member={m} size={48} />
            <div className="flex-1">
              <div className="text-xl">{m.name}{!m.user_id && <span className="ml-2 text-xs text-muted">{t("(no account yet)")}</span>}</div>
              <div className="text-sm text-muted">{t("Paid: {amount}", { amount: fmt(tot.paid) })}</div>
            </div>
            <div className={`text-xl font-bold ${tot.balance < 0 ? "text-bad" : tot.balance > 0 ? "text-good" : "text-muted"}`}>{fmt(tot.balance)}</div>
          </div>
        );
      })}
      <div className="flex items-center gap-3 px-4 py-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Add someone without an account")} className="flex-1 rounded-xl bg-surface2 px-3 py-3 outline-none placeholder:text-white/30" />
        <button onClick={addPlaceholder} className="rounded-xl bg-accent px-4 py-3 font-semibold text-black">{t("Add")}</button>
      </div>
      {error && <p className="px-4 text-sm text-bad">{error}</p>}
      <button onClick={onInvite} className="w-full px-4 py-4 text-left text-accent">{t("Invite people with a link or QR →")}</button>
    </Sheet>
  );
}
