# Import expenses from an American Express CSV — design

## Intent and why

The user has one credit card used only for expenses shared with their wife. Today they re-type those charges into the app by hand (some are already there). They want to import the card's monthly activity export so every charge lands in the shared group, then check them one by one against what is already in the app.

This is deliberately narrow: it serves a single couple's group and a single card. It is not a general bank-import feature for travel groups or friends.

## Goals

- Import an Amex activity CSV into a chosen group from within the app (client side, works with the existing offline-first outbox).
- Every imported expense is paid by one chosen group member (the card owner) and split equally between all group members.
- Imported expenses are flagged "to review" and show an **Imported** badge in the normal expense list, next to manually created expenses.
- From the list, without opening the row, the user can **confirm** (clears the flag) or **delete** (for duplicates of manually entered expenses) each imported expense.
- Re-importing the same file, or an export that overlaps an earlier one, never creates duplicates.

## Non-goals

- No import for other banks or formats, no column mapping UI.
- No negative amounts: refunds and card payments ("RECIBO ENVIADO A SU BANCO.") are skipped. The app has no use for negative expenses.
- No automatic matching/merging with manually entered expenses. The user spots duplicates during review.
- No per-row choice of payer or split in the import flow. (The user can edit an expense afterwards like any other.)
- No multi-currency handling: amounts are in the group's currency.

## Anti-goals (a failure even if it technically works)

- Silently creating duplicates on re-import.
- Importing into a group using a "payer" who is not a member of that group.
- Any exported financial data, example CSVs or real merchant names committed to the repo (project rule). Tests use synthetic rows.

## What the user decided

1. The import asks who owns the data. It must be one of the selected group's members; otherwise the import cannot proceed.
2. All expenses are created as paid by that member.
3. Split: equally among **all** group members.
4. Negative rows are skipped.
5. Imported expenses are marked so they can be verified one by one in the same list as manual ones.
6. In the list, each imported row has always-visible **✓ (confirm)** and **🗑 (delete)** buttons (mockup option A). Manual rows have none. Delete asks for one confirmation.
7. A preview step shows, before saving: rows to import, rows skipped (negative), rows already imported, and the owner.
8. The expense list header shows how many expenses are still to review.

## Input format (from the example export)

`Fecha,Descripción,Importe` — three columns, header row, comma-separated, fields quoted when they contain commas.
- Date `dd/mm/yyyy`; amount with comma decimal, quoted (`"51,69"`, `"-1227,79"`); negative = credit/payment.
- Descriptions are the raw merchant strings with runs of spaces (`WWW.AMAZON*B23SG3LB4    AMZN.COM/BILL`).
- Rows are newest first. Two example files exist outside the repo in `/Users/ebguilbert/claude/pwa/exports/`; they may have been exported at different moments and cover adjacent ranges (e.g. one ends 28/09, the other covers 28/10–01/11). Encoding of real files should be handled defensively (UTF-8, possibly with BOM; check the example for the actual encoding).

## Constraints

- Stack and conventions per `CLAUDE.md`/`AGENTS.md`: Next.js (read `node_modules/next/dist/docs/` first), Tailwind, Supabase with numbered migrations, Dexie + outbox. Money is integer cents; splits use `src/lib/split.ts` (largest remainder).
- UI strings go through `src/lib/i18n.ts` (Spanish and English).
- Database changes are a new numbered migration, applied with `--dry-run` first, then `npx supabase db push --remote`, only when the user asks. Checks: `npx tsc --noEmit && npx eslint src && npx vitest run`.
- Server deletes are soft (`deleted_at`), which the re-import dedupe must account for.

## Design

### Data

New migration adds to `expenses`:
- `needs_review boolean not null default false`
- `import_key text null`, with a unique index on `(group_id, import_key) where import_key is not null`. Soft-deleted rows keep their key, so deleting a duplicate means it is not re-created by a later import.

`save_expense` (the RPC the outbox calls) and the Dexie `Expense` type must carry both fields. Dexie schema version bump if an index is needed.

### Parsing and keys (pure functions, unit tested)

- Parse CSV robustly (quoted fields, BOM), convert `dd/mm/yyyy` and comma-decimal amounts to integer cents.
- Normalise the description by trimming and collapsing whitespace; use that as the title.
- `import_key` = date + normalised description + cents + occurrence number within the file (so two identical same-day charges in one file stay distinct and a re-import yields the same keys).
- Skip rows with amount ≤ 0.
- Category suggested with the existing `autoCategory` helper from the title.

### Import flow (UI)

New sheet entry point from the group menu: pick a file → choose owner (members of the current group only; blocked with a message otherwise or if the group has no members) → preview with counts and a sample of rows → "Import N expenses". Rows are written with `saveExpenseLocal`, so it works offline and syncs through the outbox. Layout as in the approved mockup (`.superpowers/brainstorm/…/content/import-flow.html`, `row-actions.html`).

### List and review

Rows with `needs_review` show an **Imported** badge and the ✓/🗑 buttons; the list header shows the to-review count. ✓ sets `needs_review = false` (saved through the outbox). 🗑 uses `deleteExpenseLocal` after a confirmation. Opening an imported expense uses the normal edit sheet with "Save and mark as reviewed".

## My calls (not discussed with the user — check these)

- Date has no time; I'd store it at 12:00 local time to avoid date shifts across timezones.
- Title = the cleaned raw description (no merchant-name prettifying).
- Category from `autoCategory`; unknown stays empty.
- The import key includes an occurrence index; this can mis-dedupe only if the same charge is split across two overlapping exports in a different order, which I accept.
- Editing an imported expense in the edit sheet also clears the review flag via "Save and mark as reviewed".
- Import is client-side only (no new server endpoint); the unique index is the safety net.

## Decisions from the builder check (answered by the codebase, or my calls)

- **Soft-deleted keys are invisible to the client.** `pull()` in `src/lib/sync.ts` skips rows with `deleted_at`, so Dexie never holds them. Therefore dedupe is enforced on the server and checked in the client:
  - `save_expense` is changed (new migration, `create or replace`) to write `needs_review` and `import_key` on insert. If `import_key` is not null and another row (deleted or not, different id) in the same group already has that key, the function returns without writing anything, and does not raise, so the outbox is never blocked. On the update path it never changes `import_key` but does update `needs_review` (this is how ✓ is saved).
  - The preview counts "already imported" from Dexie (non-deleted rows) and, when online, also from a query of that group's `import_key` values, which includes soft-deleted ones. Offline, the preview can under-count; the server still drops the duplicates. After the next pull the locally written duplicate disappears, because pull rebuilds from the server. Say so in the offline preview.
- **Who may import and who sees the flag:** any member of the group. `needs_review` is a shared per-expense flag, so the partner sees the badge, the count and the ✓/🗑 buttons too. No RLS change beyond what `save_expense` already uses. Archived groups are not listed (the pull already excludes them).
- **Review semantics:** every save of an imported expense from the edit sheet clears `needs_review` (the button is labelled "Save and mark as reviewed"); there is no way to save an edit and keep the flag. ✓ is a re-save of the same expense with the flag off. A confirmed expense loses its buttons and is deleted via the normal edit sheet, like any other.
- **Truncated-day overlap:** Amex activity exports are whole days, so the per-file occurrence index is accepted. If a future export splits a day, duplicates are caught at review.
- **Encoding:** the example files are plain UTF-8 text with comma separators. Decode as UTF-8 and strip a BOM; if the file starts with a UTF-16 BOM, decode as UTF-16. Reject files whose header is not `Fecha,Descripción,Importe` with a clear message.
- **Date:** stored at 12:00 in the device's local time zone, which is how the existing edit sheet derives `spent_at` (`new Date(date).toISOString()`).

## Left to the builder

File structure, component naming, where exactly the menu entry lives, exact i18n wording, migration number, visual styling consistent with the existing sheets, test layout.
