"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type Expense } from "@/lib/db";
import { supabase } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/money";
import { deleteExpenseLocal, markReviewedLocal, saveExpenseLocal } from "@/lib/sync";
import { useGroup } from "@/lib/useGroup";
import { useT } from "@/lib/i18n";
import { THEME_COLORS, asTheme } from "@/lib/themes";
import { useAuth } from "./Providers";
import { Avatar, SectionTitle } from "./ui";
import { ExpenseSheet } from "./ExpenseSheet";
import { MembersSheet } from "./MembersSheet";
import { InviteSheet } from "./InviteSheet";
import { ScanSheet } from "./ScanSheet";
import { StatsSheet } from "./StatsSheet";
import { ImportSheet } from "./ImportSheet";
import { NewGroupSheet } from "./NewGroupSheet";

type SheetState =
  | { kind: "expense"; expenseId?: string }
  | { kind: "members" | "invite" | "scan" | "stats" | "import" | "newGroup" | "menu" }
  | null;

export function Home() {
  const { t } = useT();
  const router = useRouter();
  const { session, loading } = useAuth();
  const groups = useLiveQuery(() => db.groups.toArray(), []);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, session, router]);

  // Derived selection: the chosen group if it still exists, else the remembered one, else the first.
  const activeId = useMemo(() => {
    if (!groups) return null;
    const saved = typeof window === "undefined" ? null : localStorage.getItem("sharing:group");
    return [groupId, saved].map((id) => groups.find((g) => g.id === id)?.id).find(Boolean) ?? groups[0]?.id ?? null;
  }, [groups, groupId]);

  const data = useGroup(activeId);
  const me = data?.members.find((m) => m.user_id === session?.user.id);
  const theme = asTheme(data?.group.color);

  // Tint the browser/status bar to match the group.
  useEffect(() => {
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme].header);
  }, [theme]);

  const selectGroup = (id: string) => {
    setGroupId(id);
    localStorage.setItem("sharing:group", id);
  };

  if (loading || !session || groups === undefined) {
    return <p className="p-8 text-center text-muted">{t("Loading…")}</p>;
  }

  return (
    <div data-theme={theme} className="mx-auto flex min-h-dvh max-w-xl flex-col pb-28">
      <Header
        data={data}
        groups={groups}
        groupId={activeId}
        onSelect={selectGroup}
        onNew={() => setSheet({ kind: "newGroup" })}
        onMenu={() => setSheet({ kind: "menu" })}
        avatar={me ?? { name: session.user.user_metadata?.full_name ?? "Me", avatar_url: session.user.user_metadata?.avatar_url ?? null }}
      />

      {!data ? (
        <EmptyHome onNew={() => setSheet({ kind: "newGroup" })} onScan={() => setSheet({ kind: "scan" })} />
      ) : (
        <GroupBody data={data} showAll={showAll} setShowAll={setShowAll} onEdit={(id) => setSheet({ kind: "expense", expenseId: id })} onStats={() => setSheet({ kind: "stats" })} />
      )}

      {data && (
        <button
          onClick={() => setSheet({ kind: "expense" })}
          aria-label={t("Add expense")}
          className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-1/2 z-30 flex h-16 w-16 -translate-x-1/2 items-center justify-center rounded-full bg-accent pb-1 text-4xl font-light leading-none text-black shadow-lg active:scale-95"
        >
          +
        </button>
      )}

      {sheet?.kind === "expense" && data && (
        <ExpenseSheet data={data} meUserId={session.user.id} expenseId={sheet.expenseId} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === "members" && data && <MembersSheet data={data} onClose={() => setSheet(null)} onInvite={() => setSheet({ kind: "invite" })} />}
      {sheet?.kind === "invite" && data && <InviteSheet code={data.group.invite_code} name={data.group.name} onClose={() => setSheet(null)} />}
      {sheet?.kind === "stats" && data && <StatsSheet data={data} meUserId={session.user.id} onClose={() => setSheet(null)} />}
      {sheet?.kind === "import" && data && <ImportSheet data={data} meUserId={session.user.id} onClose={() => setSheet(null)} />}
      {sheet?.kind === "scan" && <ScanSheet onClose={() => setSheet(null)} />}
      {sheet?.kind === "newGroup" && (
        <NewGroupSheet
          onClose={() => setSheet(null)}
          onCreated={(id) => {
            selectGroup(id);
            setSheet(null);
          }}
        />
      )}
      {sheet?.kind === "menu" && (
        <MenuSheet
          hasGroup={!!data}
          onClose={() => setSheet(null)}
          go={(kind) => setSheet({ kind })}
          onArchive={async () => {
            if (!data || !confirm(t("Archive \"{name}\"?", { name: data.group.name }))) return;
            await supabase().from("groups").update({ archived: true }).eq("id", data.group.id);
            await db.groups.delete(data.group.id);
            setSheet(null);
          }}
          onSignOut={async () => {
            await supabase().auth.signOut();
            await Promise.all([db.groups, db.members, db.categories, db.expenses, db.shares, db.outbox].map((t) => t.clear()));
            router.replace("/login");
          }}
        />
      )}
    </div>
  );
}

type GroupData = NonNullable<ReturnType<typeof useGroup>>;

function Header({
  data, groups, groupId, onSelect, onNew, onMenu, avatar,
}: {
  data: GroupData | null | undefined;
  groups: { id: string; name: string; color?: string }[];
  groupId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onMenu: () => void;
  avatar: { name: string; avatar_url: string | null };
}) {
  const { t, lang } = useT();
  const maxAbs = Math.max(1, ...(data?.totals.map((t) => Math.abs(t.balance)) ?? [0]));
  return (
    <header className="safe-top bg-gradient-to-b from-header to-header-end">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="rounded-full ring-2 ring-white"><Avatar member={avatar} size={36} /></div>
        <button onClick={onMenu} aria-label={t("Menu")} className="h-9 w-9 rounded-full ring-2 ring-white">•••</button>
      </div>

      <div className="flex min-h-64 flex-wrap items-center justify-center gap-4 px-6 py-6">
        {data?.members.map((m) => {
          const tot = data.totals.find((x) => x.memberId === m.id)!;
          const d = 78 + 150 * Math.sqrt(Math.abs(tot.balance) / maxAbs);
          const debtor = tot.balance < 0;
          return (
            <div
              key={m.id}
              style={{ width: d, height: d }}
              className={`flex flex-col items-center justify-center rounded-full text-center ${debtor ? "bg-accent text-header" : "bg-accent-dim/80 text-white/90"}`}
            >
              <span className="max-w-[80%] truncate text-xs opacity-80">{m.name}</span>
              <span className={`font-bold ${d > 140 ? "text-2xl" : "text-sm"}`}>
                {formatMoney(tot.balance, data.group.currency, lang)}
              </span>
              {debtor && d > 140 && <span className="text-sm opacity-80">{t("owes")}</span>}
            </div>
          );
        })}
        {!data && <p className="text-muted">{t("No group yet")}</p>}
      </div>

      <nav className="no-scrollbar flex gap-6 overflow-x-auto px-4 pb-3 text-lg font-semibold">
        {groups.map((g) => (
          <button key={g.id} onClick={() => onSelect(g.id)} className={`flex items-center gap-2 whitespace-nowrap ${g.id === groupId ? "text-white" : "text-white/40"}`}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: THEME_COLORS[asTheme(g.color)].accent }} />
            {g.name}
          </button>
        ))}
        <button onClick={onNew} aria-label={t("New group")} className="text-white/70">＋</button>
      </nav>
    </header>
  );
}

function EmptyHome({ onNew, onScan }: { onNew: () => void; onScan: () => void }) {
  const { t } = useT();
  return (
    <div className="flex flex-1 flex-col gap-3 px-6 py-10 text-center">
      <p className="text-muted">
        {t("Sharing works with groups. Create one for a month, a trip or a flat, or join a friend's by scanning their QR code or opening their link.")}
      </p>
      <button onClick={onScan} className="py-3 font-medium text-accent">{t("Scan QR code")}</button>
      <button onClick={onNew} className="mt-auto rounded-full bg-accent py-3.5 text-lg font-semibold text-black">{t("Create a new group")}</button>
    </div>
  );
}

function GroupBody({
  data, showAll, setShowAll, onEdit, onStats,
}: {
  data: GroupData;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  onEdit: (id: string) => void;
  onStats: () => void;
}) {
  const { t, lang } = useT();
  const nameOf = (id: string) => data.members.find((m) => m.id === id)?.name ?? "?";
  const memberOf = (id: string) => data.members.find((m) => m.id === id);
  const fmt = (c: number) => formatMoney(c, data.group.currency, lang);
  const toReview = data.expenses.filter((e) => e.needs_review && !e.is_transfer).length;
  const payments = data.expenses.filter((e) => e.is_transfer);
  const shown = useMemo(() => (showAll ? data.expenses : data.expenses.slice(0, 3)), [showAll, data.expenses]);

  async function remove(id: string) {
    if (!confirm(t("Delete this expense?"))) return;
    await deleteExpenseLocal(id);
  }

  async function settle(from: string, to: string, cents: number) {
    if (!confirm(t("Record {amount} paid from {from} to {to}?", { amount: fmt(cents), from: nameOf(from), to: nameOf(to) }))) return;
    const id = crypto.randomUUID();
    const expense: Expense = {
      id, group_id: data.group.id, title: t("Payment"), amount_cents: cents, paid_by: from, category_id: null,
      spent_at: new Date().toISOString(), split_mode: "amounts", is_transfer: true, created_by: "", updated_at: new Date().toISOString(), deleted_at: null,
    };
    await saveExpenseLocal(expense, [{ expense_id: id, member_id: to, cents, input_value: null }]);
  }

  return (
    <div>
      <SectionTitle
        right={
          toReview > 0 && (
            <button onClick={() => setShowAll(true)} className="rounded-full bg-yellow-300 px-3 py-0.5 text-xs font-semibold text-black">
              {t("{n} to review", { n: toReview })}
            </button>
          )
        }
      >
        {t("Transactions")}
      </SectionTitle>
      {data.expenses.length === 0 && <p className="bg-surface px-4 py-6 text-center text-muted">{t("No expenses yet. Tap + to add the first one.")}</p>}
      {shown.map((e) => {
        const payer = memberOf(e.paid_by);
        const cat = data.categories.find((c) => c.id === e.category_id);
        return (
          <div key={e.id} className="flex items-center border-b border-white/10 bg-surface active:bg-surface2">
            <button onClick={() => !e.is_transfer && onEdit(e.id)} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-4 text-left">
              <Avatar member={payer} size={48} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-1.5 text-base leading-snug">
                  {e.needs_review && (
                    <span title={t("Imported")} aria-label={t("Imported")} className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-yellow-300 text-[10px] font-bold leading-none text-black">↓</span>
                  )}
                  <span className="line-clamp-2 break-words">{cat?.emoji} {e.title}</span>
                </div>
                <div className="text-sm text-muted">{new Date(e.spent_at).toLocaleDateString(lang)} {data.pending.has(e.id) && `· ${t("syncing…")}`}</div>
                <div className="text-sm text-muted"><b className="text-white/80">{payer?.name}</b> {e.is_transfer ? t("paid back") : t("paid")}</div>
              </div>
              <div className="text-xl font-semibold text-owe">{fmt(e.amount_cents)}</div>
            </button>
            {e.needs_review && (
              <div className="flex gap-2 pr-3">
                <button onClick={() => void markReviewedLocal(e.id)} aria-label={t("Mark as reviewed")} className="h-9 w-9 rounded-full bg-surface2 text-accent">✓</button>
                <button onClick={() => remove(e.id)} aria-label={t("Delete")} className="h-9 w-9 rounded-full bg-surface2">🗑</button>
              </div>
            )}
          </div>
        );
      })}
      {data.expenses.length > 3 && (
        <button onClick={() => setShowAll(!showAll)} className="w-full bg-surface py-4 text-center">{showAll ? t("Show less") : t("Show all")}</button>
      )}

      <SectionTitle>{t("Debts")}</SectionTitle>
      {data.debts.length === 0 && <p className="bg-surface px-4 py-4 text-muted">{t("Everyone is settled up 🎉")}</p>}
      {data.debts.map((d) => (
        <div key={d.from + d.to} className="flex items-center gap-3 border-b border-white/10 bg-surface px-4 py-3">
          <Avatar member={memberOf(d.from)} size={40} />
          <div className="flex-1">
            <div>{nameOf(d.from)} → {nameOf(d.to)}</div>
            <div className="font-semibold text-owe">{fmt(d.cents)}</div>
          </div>
          <button onClick={() => settle(d.from, d.to, d.cents)} className="rounded-full bg-surface2 px-4 py-2 text-sm text-accent">{t("Mark paid")}</button>
        </div>
      ))}

      {payments.length > 0 && (
        <>
          <SectionTitle>{t("Paid")}</SectionTitle>
          {payments.map((e) => {
            const to = e.shares[0]?.memberId;
            return (
              <div key={e.id} className="flex items-center gap-3 border-b border-white/10 bg-surface px-4 py-3">
                <Avatar member={memberOf(e.paid_by)} size={40} />
                <div className="flex-1">
                  <div>{nameOf(e.paid_by)} → {to ? nameOf(to) : "?"}</div>
                  <div className="text-sm text-muted">{new Date(e.spent_at).toLocaleDateString(lang)}</div>
                </div>
                <div className="font-semibold text-accent">{fmt(e.amount_cents)}</div>
              </div>
            );
          })}
        </>
      )}

      <SectionTitle>{t("Total spent")}</SectionTitle>
      <button onClick={onStats} className="flex w-full items-center gap-4 bg-surface px-4 py-4 text-left active:bg-surface2">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent font-bold text-black">$</span>
        <span className="flex-1 text-xl">{data.spentCount === 1 ? t("1 expense") : t("{n} expenses", { n: data.spentCount })}</span>
        <span className="text-xl font-semibold text-owe">{fmt(data.totalSpent)}</span>
        <span className="text-xl text-muted">›</span>
      </button>

      <SectionTitle>{t("Recent activity")}</SectionTitle>
      {data.expenses.slice(0, 5).map((e) => {
        const who = data.members.find((m) => m.user_id === e.created_by) ?? memberOf(e.paid_by);
        return (
          <div key={e.id} className="flex items-center gap-4 border-b border-white/10 bg-surface px-4 py-3">
            <Avatar member={who} size={40} />
            <div>
              <div className="text-sm text-muted">{new Date(e.updated_at).toLocaleString(lang)}</div>
              <div><b>{who?.name}</b> {e.is_transfer ? t("recorded a payment") : t("added an expense")}: <b>{e.title}</b> ({fmt(e.amount_cents)})</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MenuSheet({
  hasGroup, onClose, go, onArchive, onSignOut,
}: {
  hasGroup: boolean;
  onClose: () => void;
  go: (k: "members" | "invite" | "scan" | "stats" | "import" | "newGroup") => void;
  onArchive: () => void;
  onSignOut: () => void;
}) {
  const { t } = useT();
  const items: [string, () => void, boolean?][] = [
    ...(hasGroup
      ? ([
          [t("Members & balances"), () => go("members")],
          [t("Spending by category"), () => go("stats")],
          [t("Import expenses"), () => go("import")],
          [t("Invite (link / QR)"), () => go("invite")],
        ] as [string, () => void][])
      : []),
    [t("Scan a QR to join"), () => go("scan")],
    [t("New group"), () => go("newGroup")],
    ...(hasGroup ? ([[t("Archive this group"), onArchive, true]] as [string, () => void, boolean][]) : []),
    [t("Sign out"), onSignOut, true],
  ];
  return (
    <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose}>
      <div className="safe-top absolute right-3 top-16 w-64 overflow-hidden rounded-2xl bg-surface2 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {items.map(([label, fn, danger]) => (
          <button key={label} onClick={fn} className={`block w-full border-b border-white/10 px-4 py-3.5 text-left last:border-0 active:bg-white/10 ${danger ? "text-bad" : ""}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

