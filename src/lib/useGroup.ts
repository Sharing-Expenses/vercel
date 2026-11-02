"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./db";
import { categoryTotals, memberTotals, simplifyDebts } from "./balances";

/** Everything the UI needs for one group, derived from the local IndexedDB cache. */
export function useGroup(groupId: string | null) {
  return useLiveQuery(async () => {
    if (!groupId) return null;
    const group = await db.groups.get(groupId);
    if (!group) return null;
    const [members, categories, expenses] = await Promise.all([
      db.members.where("group_id").equals(groupId).toArray(),
      db.categories.where("group_id").equals(groupId).sortBy("sort"),
      db.expenses.where("group_id").equals(groupId).toArray(),
    ]);
    const ids = new Set(expenses.map((e) => e.id));
    const allShares = await db.shares.toArray();
    const shares = allShares.filter((s) => ids.has(s.expense_id));
    const pending = new Set((await db.outbox.toArray()).map((o) => o.expense_id));

    expenses.sort((a, b) => b.spent_at.localeCompare(a.spent_at));
    const withShares = expenses.map((e) => ({
      ...e,
      shares: shares.filter((s) => s.expense_id === e.id).map((s) => ({ memberId: s.member_id, cents: s.cents, inputValue: s.input_value })),
    }));
    const forBalance = withShares.map((e) => ({
      paidBy: e.paid_by,
      amount: e.amount_cents,
      shares: e.shares,
      category: e.is_transfer ? null : e.category_id,
    }));
    const totals = memberTotals(members.map((m) => m.id), forBalance);
    const spending = withShares.filter((e) => !e.is_transfer);
    return {
      group,
      members,
      categories,
      expenses: withShares,
      pending,
      totals,
      debts: simplifyDebts(totals),
      spendingByCategory: categoryTotals(
        spending.map((e) => ({ paidBy: e.paid_by, amount: e.amount_cents, shares: e.shares, category: e.category_id })),
      ),
      totalSpent: spending.reduce((a, e) => a + e.amount_cents, 0),
      spentCount: spending.length,
    };
  }, [groupId]);
}
