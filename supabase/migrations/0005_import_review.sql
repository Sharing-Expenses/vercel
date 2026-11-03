-- Expenses imported from a bank CSV: flagged until someone reviews them, and keyed so a re-import
-- (or an overlapping export) never creates the same expense twice.
alter table public.expenses
  add column needs_review boolean not null default false,
  add column import_key text;

-- Soft-deleted rows keep their key, so a duplicate the user deleted does not come back on re-import.
create unique index expenses_import_key_idx on public.expenses (group_id, import_key) where import_key is not null;

-- Same as 0001, plus the two columns. A different expense that already holds the import key is a
-- silent no-op (not an error), so a skipped duplicate never blocks the offline sync queue.
create or replace function public.save_expense(p_expense jsonb, p_shares jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare
  eid uuid := (p_expense->>'id')::uuid;
  gid uuid := (p_expense->>'group_id')::uuid;
  ikey text := nullif(p_expense->>'import_key', '');
begin
  if ikey is not null and exists (
    select 1 from public.expenses where group_id = gid and import_key = ikey and id <> eid
  ) then
    return;
  end if;

  insert into public.expenses (id, group_id, title, amount_cents, paid_by, category_id, spent_at, split_mode, is_transfer, needs_review, import_key)
  values (
    eid, gid, p_expense->>'title', (p_expense->>'amount_cents')::bigint,
    (p_expense->>'paid_by')::uuid, nullif(p_expense->>'category_id', '')::uuid,
    (p_expense->>'spent_at')::timestamptz, p_expense->>'split_mode', coalesce((p_expense->>'is_transfer')::boolean, false),
    coalesce((p_expense->>'needs_review')::boolean, false), ikey
  )
  on conflict (id) do update set
    title = excluded.title, amount_cents = excluded.amount_cents, paid_by = excluded.paid_by,
    category_id = excluded.category_id, spent_at = excluded.spent_at, split_mode = excluded.split_mode,
    is_transfer = excluded.is_transfer, needs_review = excluded.needs_review, deleted_at = null;
  delete from public.expense_shares where expense_id = eid;
  insert into public.expense_shares (expense_id, member_id, cents, input_value)
  select eid, (s->>'member_id')::uuid, (s->>'cents')::bigint, nullif(s->>'input_value', '')::numeric
  from jsonb_array_elements(p_shares) s;
end $$;
grant execute on function public.save_expense to authenticated;
