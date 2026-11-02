"use client";

import { useState } from "react";
import { db, type Member } from "@/lib/db";
import { supabase } from "@/lib/supabase/client";
import { useT } from "@/lib/i18n";
import { sync } from "@/lib/sync";
import type { useGroup } from "@/lib/useGroup";
import { Avatar, PrimaryButton, SectionTitle, Sheet } from "./ui";

type GroupData = NonNullable<ReturnType<typeof useGroup>>;

/** Rename, merge into another member, or remove one member of the group. */
export function MemberSheet({ data, member, onClose }: { data: GroupData; member: Member; onClose: () => void }) {
  const { t } = useT();
  const [name, setName] = useState(member.name);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const others = data.members.filter((m) => m.id !== member.id);
  const hasActivity = data.expenses.some((e) => e.paid_by === member.id || e.shares.some((s) => s.memberId === member.id));
  const canRemove = !member.user_id && !hasActivity;

  async function run(action: () => PromiseLike<{ error: { message: string } | null }>) {
    if (!navigator.onLine) return setError(t("You need to be online to manage members."));
    setBusy(true);
    setError(null);
    // Queued offline expenses could point at a member that is about to disappear.
    await sync();
    if ((await db.outbox.count()) > 0) {
      setBusy(false);
      return setError(t("Some changes are still syncing. Try again in a moment."));
    }
    const { error } = await action();
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    await sync();
    onClose();
  }

  const rename = () => run(() => supabase().from("members").update({ name: name.trim() }).eq("id", member.id));

  const mergeInto = (target: Member) => {
    const message = t("Merge {from} into {to}? All of {from}'s expenses and balance move to {to}. This can't be undone.", { from: member.name, to: target.name });
    if (!confirm(message)) return;
    return run(() => supabase().rpc("merge_members", { p_keep: target.id, p_remove: member.id }));
  };

  const remove = () => {
    if (!confirm(t("Remove {name} from the group?", { name: member.name }))) return;
    return run(() => supabase().from("members").delete().eq("id", member.id));
  };

  return (
    <Sheet title={member.name} onClose={onClose}>
      <SectionTitle>{t("Name")}</SectionTitle>
      <div className="flex items-center gap-3 bg-surface px-4 py-3">
        <Avatar member={member} size={40} />
        <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-xl bg-surface2 px-3 py-3 outline-none" />
      </div>
      <div className="px-4 py-3">
        <PrimaryButton onClick={rename} disabled={busy || !name.trim() || name.trim() === member.name}>{t("Save")}</PrimaryButton>
      </div>

      {others.length > 0 && (
        <>
          <SectionTitle>{t("Merge into…")}</SectionTitle>
          <p className="bg-surface px-4 pt-3 text-sm text-muted">
            {t("Use this when the same person appears twice. Pick the member to keep.")}
          </p>
          {others.map((m) => (
            <button
              key={m.id}
              disabled={busy || (!!m.user_id && !!member.user_id)}
              onClick={() => mergeInto(m)}
              className="flex w-full items-center gap-3 border-b border-white/10 bg-surface px-4 py-3 text-left active:bg-surface2 disabled:opacity-40"
            >
              <Avatar member={m} size={36} />
              <span className="flex-1">{m.name}</span>
              <span className="text-xs text-muted">{m.user_id ? t("has an account") : t("no account yet")}</span>
            </button>
          ))}
        </>
      )}

      {canRemove && (
        <button onClick={remove} disabled={busy} className="mt-4 w-full px-4 py-4 text-left text-bad">
          {t("Remove from group")}
        </button>
      )}
      {error && <p className="px-4 py-3 text-sm text-bad">{error}</p>}
    </Sheet>
  );
}
