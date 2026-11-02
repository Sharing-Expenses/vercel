import type { Share } from "./split";

export type ExpenseForBalance = {
  paidBy: string;
  amount: number; // cents
  shares: Share[];
  category?: string | null;
};

export type MemberTotals = {
  memberId: string;
  paid: number; // total cents this member paid out
  owed: number; // total cents this member consumed
  balance: number; // paid - owed; positive means they are owed money
};

export function memberTotals(memberIds: string[], expenses: ExpenseForBalance[]): MemberTotals[] {
  const map = new Map<string, MemberTotals>(
    memberIds.map((id) => [id, { memberId: id, paid: 0, owed: 0, balance: 0 }]),
  );
  const get = (id: string) => {
    let t = map.get(id);
    if (!t) map.set(id, (t = { memberId: id, paid: 0, owed: 0, balance: 0 }));
    return t;
  };
  for (const e of expenses) {
    get(e.paidBy).paid += e.amount;
    for (const s of e.shares) get(s.memberId).owed += s.cents;
  }
  for (const t of map.values()) t.balance = t.paid - t.owed;
  return [...map.values()];
}

export type Debt = { from: string; to: string; cents: number };

/** Greedy minimisation: biggest debtor pays biggest creditor. */
export function simplifyDebts(totals: MemberTotals[]): Debt[] {
  const debtors = totals
    .filter((t) => t.balance < 0)
    .map((t) => ({ id: t.memberId, left: -t.balance }))
    .sort((a, b) => b.left - a.left);
  const creditors = totals
    .filter((t) => t.balance > 0)
    .map((t) => ({ id: t.memberId, left: t.balance }))
    .sort((a, b) => b.left - a.left);

  const debts: Debt[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const cents = Math.min(debtors[d].left, creditors[c].left);
    if (cents > 0) debts.push({ from: debtors[d].id, to: creditors[c].id, cents });
    debtors[d].left -= cents;
    creditors[c].left -= cents;
    if (debtors[d].left === 0) d++;
    if (creditors[c].left === 0) c++;
  }
  return debts;
}

export type CategoryTotal = { category: string; cents: number };

/** Spending per category, excluding settlement transfers (caller filters those). */
export function categoryTotals(expenses: ExpenseForBalance[]): CategoryTotal[] {
  const map = new Map<string, number>();
  for (const e of expenses) {
    const key = e.category ?? "none";
    map.set(key, (map.get(key) ?? 0) + e.amount);
  }
  return [...map.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);
}
