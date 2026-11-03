import Dexie, { type Table } from "dexie";

export type Group = { id: string; name: string; currency: string; invite_code: string; archived: boolean; color?: string };
export type Member = { id: string; group_id: string; user_id: string | null; name: string; avatar_url: string | null };
export type Category = { id: string; group_id: string; name: string; emoji: string; sort: number };
export type SplitModeName = "amounts" | "percent" | "shares";
export type Expense = {
  id: string;
  group_id: string;
  title: string;
  amount_cents: number;
  paid_by: string;
  category_id: string | null;
  spent_at: string;
  split_mode: SplitModeName;
  is_transfer: boolean;
  created_by: string;
  updated_at: string;
  deleted_at: string | null;
  /** Imported from a bank CSV and not yet checked by a person. */
  needs_review?: boolean;
  /** Identifies the CSV row this came from, so re-importing never duplicates it. */
  import_key?: string | null;
};
export type ExpenseShare = { expense_id: string; member_id: string; cents: number; input_value: number | null };
export type OutboxItem = { id?: number; kind: "upsert_expense" | "delete_expense"; expense_id: string };

class SharingDB extends Dexie {
  groups!: Table<Group, string>;
  members!: Table<Member, string>;
  categories!: Table<Category, string>;
  expenses!: Table<Expense, string>;
  shares!: Table<ExpenseShare, [string, string]>;
  outbox!: Table<OutboxItem, number>;

  constructor() {
    super("sharing");
    this.version(1).stores({
      groups: "id",
      members: "id, group_id",
      categories: "id, group_id",
      expenses: "id, group_id, spent_at",
      shares: "[expense_id+member_id], expense_id",
      outbox: "++id, expense_id",
    });
  }
}

export const db = new SharingDB();
