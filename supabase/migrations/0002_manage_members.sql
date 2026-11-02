-- Manage members: merge one member into another, and allow removing account-less members.

-- Merge p_remove into p_keep. All expenses paid by, and shares owed by, p_remove move to p_keep.
-- If p_remove is linked to a Google account (and p_keep is not), the account moves to p_keep.
create function public.merge_members(p_keep uuid, p_remove uuid) returns void
language plpgsql security definer set search_path = public as $$
declare k public.members; r public.members;
begin
  select * into k from public.members where id = p_keep;
  select * into r from public.members where id = p_remove;
  if k.id is null or r.id is null or k.id = r.id or k.group_id <> r.group_id then
    raise exception 'invalid members';
  end if;
  if not public.is_member(k.group_id) then raise exception 'not allowed'; end if;
  if k.user_id is not null and r.user_id is not null then
    raise exception 'both members have accounts';
  end if;

  update public.expenses set paid_by = k.id where paid_by = r.id;

  -- Expenses where both members have a share: add the removed member's share to the kept one.
  update public.expense_shares s
  set cents = s.cents + o.cents,
      input_value = case when s.input_value is null and o.input_value is null then null
                         else coalesce(s.input_value, 0) + coalesce(o.input_value, 0) end
  from public.expense_shares o
  where s.member_id = k.id and o.member_id = r.id and s.expense_id = o.expense_id;

  delete from public.expense_shares o using public.expense_shares s
  where o.member_id = r.id and s.member_id = k.id and s.expense_id = o.expense_id;

  update public.expense_shares set member_id = k.id where member_id = r.id;

  if r.user_id is not null then
    update public.members set user_id = null where id = r.id; -- free the (group_id, user_id) slot
    update public.members
    set user_id = r.user_id, avatar_url = coalesce(r.avatar_url, avatar_url)
    where id = k.id;
  end if;

  delete from public.members where id = r.id;
end $$;
grant execute on function public.merge_members to authenticated;

-- Members without an account can be removed (the foreign keys block it if they have expenses).
create policy members_delete on public.members for delete
  using (public.is_member(group_id) and user_id is null);
