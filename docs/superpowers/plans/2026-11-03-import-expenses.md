# Import Expenses (Amex CSV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a group member import an American Express activity CSV as expenses paid by a chosen member and split equally, flagged "to review", with confirm/delete buttons in the expense list.

**Architecture:** Pure parsing/keying/building functions in `src/lib/amexImport.ts` (unit tested). A new `ImportSheet` writes expenses through the existing `saveExpenseLocal` outbox. Two new columns on `expenses` (`needs_review`, `import_key`) and a changed `save_expense` RPC make dedupe a server guarantee.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching routing or components), Tailwind, Supabase migrations, Dexie, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-import-expenses-design.md`

## Global Constraints

- Money is integer cents; equal split via `splitEqually` in `src/lib/split.ts` (largest remainder).
- UI strings go through `t()` with Spanish entries added to the `es` map in `src/lib/i18n.ts`.
- Negative and zero amounts are skipped; they are never imported.
- Owner must be a member of the selected group, otherwise the import is refused.
- Imported expense: `split_mode = 'shares'`, one share per group member with `input_value = 1`, `paid_by` = owner, `is_transfer = false`, `needs_review = true`.
- `spent_at` = the CSV date at 12:00 local time (`new Date(y, m - 1, d, 12).toISOString()`).
- CSV header must be exactly `Fecha,Descripción,Importe`; files decode as UTF-8 (BOM stripped), or UTF-16 when a UTF-16 BOM is present.
- No exported or real financial data in the repo: tests use synthetic rows only.
- Migrations are numbered files in `supabase/migrations/`. Do not apply to the remote database; `--dry-run` only, and only the user decides when to `db push --remote`.
- Checks: `npx tsc --noEmit && npx eslint src && npx vitest run`.
- `.superpowers/` must be added to `.gitignore` (Task 1).

## Review Focus

- A quoted description containing a comma (`"SAN SEBASTIAN DE LOS RE AGUILA, EL (C"`) must stay one field (Task 2).
- Two identical same-day charges in one file must get distinct keys, and parsing the same file twice must give identical keys (Task 2).
- Amounts like `"-1227,79"`, `"1.227,79"` and `"0,00"` parse correctly; zero and negative are skipped (Task 2).
- Empty file, header-only file, wrong header, BOM, UTF-16 BOM produce a clear error or correct text, never a crash (Task 2).
- An owner id that is not among the group's member ids is refused (Task 3).

---

### Task 1: Schema, types and repo hygiene

**Files:**
- Create: `supabase/migrations/0005_import_review.sql`
- Modify: `src/lib/db.ts:7-20` (the `Expense` type)
- Modify: `.gitignore`

**Interfaces:**
- Produces: `Expense.needs_review?: boolean`, `Expense.import_key?: string | null` (optional so existing code that builds an `Expense` still compiles). The server returns both columns to `pull()` automatically (`select *`).

- [ ] **Step 1: Write the migration `0005_import_review.sql`**
  - `alter table public.expenses add column needs_review boolean not null default false, add column import_key text;`
  - `create unique index expenses_import_key_idx on public.expenses (group_id, import_key) where import_key is not null;`
  - `create or replace function public.save_expense(p_expense jsonb, p_shares jsonb) returns void` with the same signature, language and `security invoker`/`search_path` as in `0001_init.sql`, plus these changes:
    - at the top, if `p_expense->>'import_key'` is non-null and a row with the same `group_id`, the same `import_key` and a different `id` exists (deleted or not), `return` without writing anything and without raising;
    - the insert also writes `needs_review` (`coalesce((p_expense->>'needs_review')::boolean, false)`) and `import_key` (`nullif(p_expense->>'import_key','')`);
    - the `on conflict (id) do update` also sets `needs_review = excluded.needs_review` and never touches `import_key`.
  - Keep `grant execute on function public.save_expense to authenticated;`.

- [ ] **Step 2: Add the two optional fields to the `Expense` type in `src/lib/db.ts`**; no Dexie version bump (nothing is indexed on them).

- [ ] **Step 3: Add `.superpowers/` to `.gitignore`.**

- [ ] **Step 4: Verify**
  Run: `npx tsc --noEmit && npx eslint src && npx vitest run` → all pass.
  Run: `npx supabase db push --remote --dry-run` → lists `0005_import_review.sql` and errors on nothing. Do **not** run it without `--dry-run`.

- [ ] **Step 5: Commit** `git add supabase/migrations/0005_import_review.sql src/lib/db.ts .gitignore docs/ && git commit -m "Add needs_review and import_key to expenses"`

---

### Task 2: CSV parsing, keys and dedupe partition

**Files:**
- Create: `src/lib/amexImport.ts`
- Test: `src/lib/amexImport.test.ts`

**Interfaces:**
- Produces:
  - `type AmexRow = { date: string; title: string; cents: number; key: string }` (`date` is `yyyy-mm-dd`; `title` is trimmed with whitespace runs collapsed to one space; `key` is `` `${date}|${title}|${cents}|${n}` `` where `n` counts identical `(date,title,cents)` rows from 1 in file order).
  - `type ParsedCsv = { rows: AmexRow[]; skipped: number; invalid: number[] }` (`skipped` counts zero/negative rows; `invalid` holds 1-based line numbers of rows whose date or amount cannot be parsed; those rows are excluded).
  - `class ImportFormatError extends Error`
  - `decodeCsv(buf: ArrayBuffer): string` — UTF-16 LE/BE when a UTF-16 BOM is present, else UTF-8; strips the BOM.
  - `parseAmexCsv(text: string): ParsedCsv` — throws `ImportFormatError` when the text is empty or the header is not `Fecha,Descripción,Importe`.
  - `partitionRows(rows: AmexRow[], knownKeys: Set<string>): { fresh: AmexRow[]; duplicates: AmexRow[] }`

- [ ] **Step 1: Write failing tests in `amexImport.test.ts`** (synthetic rows only), named and asserting:
  - `parses a normal row`: `26/10/2026,SHOP A  CITY,"51,69"` → `{date:"2026-10-26", title:"SHOP A CITY", cents:5169}`.
  - `keeps a quoted description with a comma as one field`: `20/10/2026,"CLUB X, EL (C","70,00"` → title `CLUB X, EL (C`, cents 7000.
  - `skips negative and zero amounts and counts them`: rows `"-1227,79"` and `"0,00"` → `rows` empty, `skipped` 2.
  - `parses a thousands separator`: `"1.227,79"` → 122779.
  - `gives identical same-day charges distinct keys, stable across parses`: two identical rows → keys end `|1` and `|2`; a second `parseAmexCsv` of the same text yields equal keys.
  - `reports unparsable rows by line number`: a row with date `31/02/2026x` or amount `abc` → `invalid` contains its 1-based line number (header is line 1), and no row is returned for it.
  - `rejects an empty file and a wrong header` → both throw `ImportFormatError`; a header-only file returns `rows: []`.
  - `decodeCsv strips a UTF-8 BOM and decodes UTF-16 with BOM`: build both buffers in the test and assert the decoded text equals the original string.
  - `partitionRows splits by known keys`.

- [ ] **Step 2: Run** `npx vitest run src/lib/amexImport.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement the interfaces above in `src/lib/amexImport.ts`.** Hand-written CSV tokenizer (quotes, `""` escape, CRLF) — no new dependency. Amount parsing: strip `.` thousands separators, replace `,` with `.`, round to cents via integer arithmetic on the string parts (not float multiplication). Validate day/month by round-tripping through `Date`.

- [ ] **Step 4: Run** `npx vitest run src/lib/amexImport.test.ts` → PASS.

- [ ] **Step 5: Commit** `git add src/lib/amexImport.ts src/lib/amexImport.test.ts && git commit -m "Add Amex CSV parser with dedupe keys"`

---

### Task 3: Building imported expenses

**Files:**
- Modify: `src/lib/amexImport.ts`
- Test: `src/lib/amexImport.test.ts`

**Interfaces:**
- Consumes: `AmexRow`, `splitEqually` from `src/lib/split.ts`, `Expense`/`ExpenseShare` from `src/lib/db.ts`.
- Produces: `buildImportedExpense(row: AmexRow, ctx: { groupId: string; ownerMemberId: string; memberIds: string[]; categoryId: string | null; userId: string }): { expense: Expense; shares: ExpenseShare[] }` — throws `Error("owner is not a member of the group")` when `ownerMemberId` is not in `memberIds`.

- [ ] **Step 1: Write failing tests:**
  - `builds a flagged, equally split expense paid by the owner`: row cents 4309, members `["a","b"]`, owner `"a"` → `expense.paid_by === "a"`, `amount_cents === 4309`, `split_mode === "shares"`, `needs_review === true`, `import_key === row.key`, `is_transfer === false`; shares `[2155, 2154]` summing to 4309, all `input_value === 1`.
  - `stores the date at 12:00 local`: `new Date(expense.spent_at)` has `getFullYear/getMonth/getDate/getHours` equal to 2026/9/26/12 for row date `2026-10-26`.
  - `refuses an owner who is not a member`: owner `"z"` with members `["a","b"]` → throws.
  - `works for a one-member group`: one member gets all cents.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `buildImportedExpense` (id from `crypto.randomUUID()`, `created_by: ctx.userId`, `updated_at` now, `deleted_at: null`). **Step 4: Run** → PASS.

- [ ] **Step 5: Commit** `git commit -am "Build imported expenses with owner check"`

---

### Task 4: Import sheet and menu entry

**Files:**
- Create: `src/components/ImportSheet.tsx`
- Modify: `src/components/Home.tsx` (the `SheetState` union, the `MenuSheet` `go` type and items, sheet rendering block)
- Modify: `src/lib/i18n.ts` (Spanish strings for every new `t()` call)

**Interfaces:**
- Consumes: `decodeCsv`, `parseAmexCsv`, `partitionRows`, `buildImportedExpense`, `ImportFormatError` (Tasks 2–3); `saveExpenseLocal` (`src/lib/sync.ts`); `suggestCategory(title, categories, past)` (`src/lib/autoCategory.ts`); `Sheet`, `PrimaryButton` (`src/components/ui.tsx`); `GroupData` shape from `useGroup`; `supabase()` client.
- Produces: `ImportSheet({ data, meUserId, onClose }: { data: GroupData; meUserId: string; onClose: () => void })`; menu item "Import expenses" (shown when a group exists) that opens it.

- [ ] **Step 1: Add the `"import"` sheet kind and a menu item "Import expenses" after "Spending by category"**, rendering `<ImportSheet data={data} meUserId={session.user.id} onClose=… />` like the other sheets.

- [ ] **Step 2: Implement `ImportSheet`** following the approved mockup (`.superpowers/brainstorm/*/content/import-flow.html`):
  - file input (`accept=".csv,text/csv"`); on choose, read `file.arrayBuffer()`, `decodeCsv`, `parseAmexCsv`; show `ImportFormatError` messages inline.
  - owner `<select>` listing only `data.members`; preselect the member whose `user_id === meUserId`; if the group has no members, show a message and keep the button disabled.
  - known keys = `import_key` of `data.expenses` plus, when online, `import_key` values returned by `supabase().from("expenses").select("import_key").eq("group_id", data.group.id).not("import_key", "is", null)` (includes soft-deleted rows); on error or offline, use local keys only and show a note that duplicates are filtered after the next sync.
  - preview: counts of rows to import / skipped (negative or zero) / already imported / unreadable (line numbers), the owner, "split equally between all members", and the first rows with amount.
  - "Import N expenses" button disabled when N = 0 or no owner; on click, for each fresh row call `saveExpenseLocal(...buildImportedExpense(row, ctx))` with `categoryId = suggestCategory(row.title, data.categories, data.expenses)`, then `onClose()`.

- [ ] **Step 3: Add Spanish translations** for each new string.

- [ ] **Step 4: Verify**
  Run: `npx tsc --noEmit && npx eslint src && npx vitest run` → pass.
  Manual (needs a Google login, so the user does it): `npm run dev`, import `exports/activity-october2026.csv` into a throwaway group; expect the 3 negative rows (a refund, an Amazon credit and the bank payment) to be reported as skipped and every other row as importable; importing it a second time reports all of those rows as already imported.

- [ ] **Step 5: Commit** `git add src/components/ImportSheet.tsx src/components/Home.tsx src/lib/i18n.ts && git commit -m "Add the import sheet"`

---

### Task 5: Review in the list (badge, count, confirm, delete)

**Files:**
- Modify: `src/components/Home.tsx` (`GroupBody` transactions list)
- Modify: `src/lib/sync.ts` (add `markReviewedLocal`)
- Modify: `src/lib/i18n.ts`

**Interfaces:**
- Consumes: `deleteExpenseLocal`, `saveExpenseLocal`, `data.expenses[i].needs_review`.
- Produces: `markReviewedLocal(expenseId: string): Promise<void>` in `src/lib/sync.ts` — loads the expense and its shares from Dexie, saves them back through `saveExpenseLocal` with `needs_review: false` and a fresh `updated_at`; does nothing if the expense is missing.

- [ ] **Step 1: Implement `markReviewedLocal`.**

- [ ] **Step 2: In `GroupBody`, turn each row into a flex container** holding the existing tap-to-edit `<button>` (flex-1; buttons must not be nested) and, for rows with `needs_review`, an "Imported" chip on the title line plus two round buttons: ✓ (`aria-label` "Mark as reviewed", calls `markReviewedLocal`) and 🗑 (`aria-label` "Delete", `confirm(t("Delete this expense?"))` then `deleteExpenseLocal`). Manual and confirmed rows show neither.

- [ ] **Step 3: Show "N to review" in the Transactions section title** when N > 0 (N = non-transfer expenses with `needs_review`); tapping it calls `setShowAll(true)` because the list shows only 3 rows by default (my call, not in the spec: otherwise imported rows are hidden).

- [ ] **Step 4: Add Spanish strings.**

- [ ] **Step 5: Verify**
  Run: `npx tsc --noEmit && npx eslint src && npx vitest run` → pass.
  Manual: imported rows show the chip and both buttons, ✓ removes them and decrements the count, 🗑 asks once then removes the row; manual rows have no buttons.

- [ ] **Step 6: Commit** `git commit -am "Review imported expenses from the list"`

---

### Task 6: Edit sheet clears the review flag

**Files:**
- Modify: `src/components/ExpenseSheet.tsx` (`save()` around line 126–131 and the footer button around line 165)
- Modify: `src/lib/i18n.ts`

**Interfaces:**
- Consumes: `existing?.needs_review`, `existing?.import_key`.

- [ ] **Step 1: In `save()`, put `needs_review: false` and `import_key: existing?.import_key ?? null` on the expense object** so editing never drops the key and always clears the flag.

- [ ] **Step 2: When `existing?.needs_review` is true, label the footer button "Save and mark as reviewed"** instead of "Save"; add the Spanish string.

- [ ] **Step 3: Verify** `npx tsc --noEmit && npx eslint src && npx vitest run` → pass. Manual: open an imported expense, save → badge disappears; a manually created expense still shows "Save".

- [ ] **Step 4: Commit** `git commit -am "Clear the review flag when saving an imported expense"`

---

## Self-review notes

- Spec coverage: owner validation (Tasks 3, 4), equal split (3), skip negatives (2), badge/count/✓/🗑 (5), preview counts (4), re-import dedupe including soft-deleted (1, 4), shared flag (1, via column), "Save and mark as reviewed" (6), encoding/header (2), noon-local date (3), autoCategory (4).
- The final remote step (`npx supabase db push --remote`) is deliberately absent: the migration must be applied before the app version that sends `import_key` is used in production, and only the user decides when.
