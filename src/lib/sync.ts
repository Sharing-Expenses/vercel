import { db, type Expense, type ExpenseShare } from "./db";
import { supabase } from "./supabase/client";

let running: Promise<void> | null = null;
let again = false;

/** Push queued offline changes, then pull fresh server state. Safe to call often. */
export function sync(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await pushOutbox();
        await pull();
      } while (again);
    } catch {
      // Offline or server error: local data stays as is, outbox is retried next time.
    } finally {
      running = null;
    }
  })();
  return running;
}

async function pushOutbox() {
  const sb = supabase();
  const items = await db.outbox.orderBy("id").toArray();
  for (const item of items) {
    if (item.kind === "upsert_expense") {
      const expense = await db.expenses.get(item.expense_id);
      if (expense) {
        const shares = await db.shares.where("expense_id").equals(expense.id).toArray();
        const { error } = await sb.rpc("save_expense", { p_expense: expense, p_shares: shares });
        if (error) throw error;
      }
    } else {
      const { error } = await sb
        .from("expenses")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", item.expense_id);
      if (error) throw error;
    }
    await db.outbox.delete(item.id!);
  }
}

type PulledExpense = Expense & { expense_shares: ExpenseShare[] };

async function pull() {
  const { data, error } = await supabase()
    .from("groups")
    .select("*, members(*), categories(*), expenses(*, expense_shares(*))")
    .eq("archived", false);
  if (error) throw error;

  const pendingIds = new Set((await db.outbox.toArray()).map((o) => o.expense_id));

  await db.transaction("rw", [db.groups, db.members, db.categories, db.expenses, db.shares], async () => {
    const keepExpenses = (await db.expenses.bulkGet([...pendingIds])).filter(Boolean) as Expense[];
    const keepShares = await db.shares.where("expense_id").anyOf([...pendingIds]).toArray();
    await Promise.all([db.groups.clear(), db.members.clear(), db.categories.clear(), db.expenses.clear(), db.shares.clear()]);

    for (const g of data ?? []) {
      const { members, categories, expenses, ...group } = g as typeof g & {
        members: never[];
        categories: never[];
        expenses: PulledExpense[];
      };
      await db.groups.put(group);
      await db.members.bulkPut(members);
      await db.categories.bulkPut(categories);
      for (const e of expenses) {
        if (e.deleted_at || pendingIds.has(e.id)) continue;
        const { expense_shares, ...expense } = e;
        await db.expenses.put(expense);
        await db.shares.bulkPut(expense_shares);
      }
    }
    await db.expenses.bulkPut(keepExpenses);
    await db.shares.bulkPut(keepShares);
  });
}

export async function saveExpenseLocal(expense: Expense, shares: ExpenseShare[]) {
  await db.transaction("rw", [db.expenses, db.shares, db.outbox], async () => {
    await db.expenses.put(expense);
    await db.shares.where("expense_id").equals(expense.id).delete();
    await db.shares.bulkPut(shares);
    await db.outbox.add({ kind: "upsert_expense", expense_id: expense.id });
  });
  void sync();
}

export async function deleteExpenseLocal(expenseId: string) {
  await db.transaction("rw", [db.expenses, db.shares, db.outbox], async () => {
    await db.expenses.delete(expenseId);
    await db.shares.where("expense_id").equals(expenseId).delete();
    await db.outbox.where("expense_id").equals(expenseId).delete();
    await db.outbox.add({ kind: "delete_expense", expense_id: expenseId });
  });
  void sync();
}
