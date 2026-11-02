-- Each group gets its own color set. Existing groups stay orange.
alter table public.groups
  add column color text not null default 'orange'
  check (color in ('orange', 'green', 'blue', 'purple', 'pink', 'teal', 'red', 'yellow'));

-- Replace create_group with a version that takes the color (dropping the old signature
-- so there is no ambiguous overload).
drop function public.create_group(text, text, text);

create function public.create_group(
  p_name text, p_currency text default 'EUR', p_lang text default 'en', p_color text default 'orange'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; prof public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into prof from public.profiles where id = auth.uid();
  insert into public.groups (name, currency, color, created_by) values (p_name, p_currency, p_color, auth.uid()) returning id into gid;
  insert into public.members (group_id, user_id, name, avatar_url) values (gid, auth.uid(), prof.name, prof.avatar_url);
  if p_lang = 'es' then
    insert into public.categories (group_id, name, emoji, sort) values
      (gid, 'Comida', '🍜', 1), (gid, 'Bebida', '🍺', 2), (gid, 'Alojamiento', '🛏️', 3),
      (gid, 'Transporte', '🚌', 4), (gid, 'Billetes', '🎫', 5), (gid, 'La compra', '🛒', 6),
      (gid, 'Alquiler y gastos', '🏠', 7);
  else
    insert into public.categories (group_id, name, emoji, sort) values
      (gid, 'Food', '🍜', 1), (gid, 'Drinks', '🍺', 2), (gid, 'Lodging', '🛏️', 3),
      (gid, 'Transport', '🚌', 4), (gid, 'Tickets', '🎫', 5), (gid, 'Groceries', '🛒', 6),
      (gid, 'Rent & bills', '🏠', 7);
  end if;
  return gid;
end $$;
grant execute on function public.create_group(text, text, text, text) to authenticated;
