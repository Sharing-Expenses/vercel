import type { Expense } from "./db";

/**
 * An imported expense deleted before its insert reached the server must still be written there (and then
 * soft-deleted), otherwise the server never learns its import key and a later overlapping import brings it back.
 */
export function needsTombstone(expense: Pick<Expense, "import_key">, hasPendingUpsert: boolean): boolean {
  return !!expense.import_key && hasPendingUpsert;
}
