-- Move an expense to another group in one step. Only the group changes; the caller says which member of the
-- target group stands for each member of the source group (the app only offers groups with the same members).
-- security invoker: row-level security applies, so the caller must belong to both groups.
create function public.move_expense(
  p_expense_id uuid, p_target_group uuid, p_member_map jsonb, p_category_id uuid default null
) returns void
language plpgsql security invoker set search_path = public as $$
declare e public.expenses;
begin
  select * into e from public.expenses where id = p_expense_id and deleted_at is null;
  if not found then raise exception 'move_expense: expense not found'; end if;
  if e.group_id = p_target_group then raise exception 'move_expense: already in that group'; end if;
  if not public.is_member(p_target_group) then raise exception 'move_expense: not a member of the target group'; end if;

  -- the payer and everyone with a share must map to a member of the target group
  if exists (
    select 1 from (select e.paid_by as mid union select member_id from public.expense_shares where expense_id = e.id) x
    where not exists (
      select 1 from public.members t
      where t.group_id = p_target_group and t.id::text = p_member_map ->> x.mid::text
    )
  ) then raise exception 'move_expense: a member has no match in the target group'; end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories where id = p_category_id and group_id = p_target_group
  ) then raise exception 'move_expense: category is not in the target group'; end if;

  update public.expense_shares
    set member_id = (p_member_map ->> member_id::text)::uuid
    where expense_id = e.id;
  update public.expenses
    set group_id = p_target_group,
        paid_by = (p_member_map ->> e.paid_by::text)::uuid,
        category_id = p_category_id,
        updated_at = now()
    where id = e.id;
end $$;
grant execute on function public.move_expense to authenticated;
