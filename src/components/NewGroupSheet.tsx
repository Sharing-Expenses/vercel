"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { sync } from "@/lib/sync";
import { useT } from "@/lib/i18n";
import { PrimaryButton, Sheet } from "./ui";

const CURRENCIES = ["EUR", "USD", "GBP", "CHF", "MXN", "CAD", "AUD", "JPY"];

export function NewGroupSheet({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { t, lang } = useT();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    const { data, error } = await supabase().rpc("create_group", { p_name: name.trim(), p_currency: currency, p_lang: lang });
    if (error) {
      setError(navigator.onLine ? error.message : t("You need to be online to create a group."));
      setBusy(false);
      return;
    }
    await sync();
    onCreated(data as string);
  }

  return (
    <Sheet title={t("New group")} onClose={onClose}>
      <div className="space-y-4 p-4">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Group name, e.g. November 2026 or Lisbon trip")} className="w-full rounded-xl bg-surface2 px-4 py-3.5 text-lg outline-none placeholder:text-white/30" />
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className="w-full rounded-xl bg-surface2 px-4 py-3.5 outline-none">
          {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        {error && <p className="text-sm text-bad">{error}</p>}
        <PrimaryButton onClick={create} disabled={!name.trim() || busy}>{t("Create group")}</PrimaryButton>
      </div>
    </Sheet>
  );
}
