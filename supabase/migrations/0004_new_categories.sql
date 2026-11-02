-- New default categories, in this order:
-- Groceries, Food, Drinks, House, Fuel, Kid, Insurance, Streaming, Lodging, Tickets, Transport
-- Applies to new groups (create_group) and to every existing group.

create function public.default_categories(p_lang text) returns table (name text, emoji text, sort int)
language sql immutable as $$
  select t.name, t.emoji, t.sort from (values
    (1,  case when p_lang = 'es' then 'La compra'    else 'Groceries' end, '🛒'),
    (2,  case when p_lang = 'es' then 'Comida'       else 'Food'      end, '🍜'),
    (3,  case when p_lang = 'es' then 'Bebida'       else 'Drinks'    end, '🍺'),
    (4,  case when p_lang = 'es' then 'Casa'         else 'House'     end, '🏠'),
    (5,  case when p_lang = 'es' then 'Gasolina'     else 'Fuel'      end, '⛽'),
    (6,  case when p_lang = 'es' then 'Niños'        else 'Kid'       end, '🧒'),
    (7,  case when p_lang = 'es' then 'Seguros'      else 'Insurance' end, '🛡️'),
    (8,  'Streaming', '📺'),
    (9,  case when p_lang = 'es' then 'Alojamiento'  else 'Lodging'   end, '🛏️'),
    (10, case when p_lang = 'es' then 'Billetes'     else 'Tickets'   end, '🎫'),
    (11, case when p_lang = 'es' then 'Transporte'   else 'Transport' end, '🚌')
  ) as t(sort, name, emoji);
$$;

-- New groups get the new list. Same signature as 0003, so this replaces it.
create or replace function public.create_group(
  p_name text, p_currency text default 'EUR', p_lang text default 'en', p_color text default 'orange'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; prof public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into prof from public.profiles where id = auth.uid();
  insert into public.groups (name, currency, color, created_by) values (p_name, p_currency, p_color, auth.uid()) returning id into gid;
  insert into public.members (group_id, user_id, name, avatar_url) values (gid, auth.uid(), prof.name, prof.avatar_url);
  insert into public.categories (group_id, name, emoji, sort)
    select gid, d.name, d.emoji, d.sort from public.default_categories(p_lang) d;
  return gid;
end $$;

-- Existing groups: rename the old categories in place (so expenses already tagged keep their category),
-- then add the ones that are new. The language of each group is read from its current category names.
create temp table _group_lang as
select g.id as group_id,
       case when exists (select 1 from public.categories c where c.group_id = g.id
                         and c.name in ('Comida', 'Bebida', 'La compra', 'Alojamiento', 'Billetes', 'Transporte', 'Alquiler y gastos', 'Casa'))
            then 'es' else 'en' end as lang
from public.groups g;

with legacy(old_en, old_es, pos) as (values
  ('Groceries', 'La compra', 1), ('Food', 'Comida', 2), ('Drinks', 'Bebida', 3), ('Rent & bills', 'Alquiler y gastos', 4),
  ('Lodging', 'Alojamiento', 9), ('Tickets', 'Billetes', 10), ('Transport', 'Transporte', 11))
update public.categories c
set name = d.name, emoji = d.emoji, sort = d.sort
from _group_lang gl
join legacy l on true
join lateral public.default_categories(gl.lang) d on d.sort = l.pos
where c.group_id = gl.group_id and c.name in (l.old_en, l.old_es);

insert into public.categories (group_id, name, emoji, sort)
select gl.group_id, d.name, d.emoji, d.sort
from _group_lang gl
cross join lateral public.default_categories(gl.lang) d
where not exists (select 1 from public.categories c where c.group_id = gl.group_id and lower(c.name) = lower(d.name));

drop table _group_lang;
