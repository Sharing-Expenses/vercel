-- Sharing: groups, members, categories, expenses with per-member splits.
-- Money is stored as integer cents. Ids are client-generated uuids so expenses
-- can be created offline and synced later.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text not null,
  avatar_url text
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  currency text not null default 'EUR',
  invite_code text not null unique default encode(gen_random_bytes(9), 'hex'),
  archived boolean not null default false,
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  user_id uuid references auth.users on delete set null,
  name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  unique (group_id, user_id)
);
create index on public.members (user_id);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  name text not null,
  emoji text not null default '🏷️',
  sort int not null default 0
);
create index on public.categories (group_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups on delete cascade,
  title text not null,
  amount_cents bigint not null check (amount_cents > 0),
  paid_by uuid not null references public.members,
  category_id uuid references public.categories on delete set null,
  spent_at timestamptz not null default now(),
  split_mode text not null default 'shares' check (split_mode in ('amounts', 'percent', 'shares')),
  is_transfer boolean not null default false, -- a settlement payment between members
  created_by uuid not null references auth.users default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index on public.expenses (group_id, spent_at desc);

create table public.expense_shares (
  expense_id uuid not null references public.expenses on delete cascade,
  member_id uuid not null references public.members,
  cents bigint not null check (cents >= 0),
  input_value numeric, -- what the user typed (percent or share count), for re-editing
  primary key (expense_id, member_id)
);

-- Keep updated_at fresh so clients can sync incrementally.
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- Membership helper. security definer avoids recursive RLS on members.
create function public.is_member(gid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where group_id = gid and user_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_shares enable row level security;

create policy profiles_read on public.profiles for select using (auth.uid() is not null);
create policy profiles_write on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

create policy groups_read on public.groups for select using (public.is_member(id));
create policy groups_update on public.groups for update using (public.is_member(id));

create policy members_read on public.members for select using (public.is_member(group_id));
create policy members_insert on public.members for insert with check (public.is_member(group_id) and user_id is null);
create policy members_update on public.members for update using (public.is_member(group_id));

create policy categories_all on public.categories for all
  using (public.is_member(group_id)) with check (public.is_member(group_id));

create policy expenses_all on public.expenses for all
  using (public.is_member(group_id)) with check (public.is_member(group_id));

create policy shares_all on public.expense_shares for all
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_member(e.group_id)))
  with check (exists (select 1 from public.expenses e where e.id = expense_id and public.is_member(e.group_id)));

-- Create a profile row on first sign-in with Google.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  ) on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Create a group, add the caller as first member and seed default categories.
create function public.create_group(p_name text, p_currency text default 'EUR', p_lang text default 'en') returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; prof public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select * into prof from public.profiles where id = auth.uid();
  insert into public.groups (name, currency, created_by) values (p_name, p_currency, auth.uid()) returning id into gid;
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

-- Preview a group from its invite code (before joining).
create function public.group_preview(p_code text) returns table (id uuid, name text, member_count bigint)
language sql stable security definer set search_path = public as $$
  select g.id, g.name, (select count(*) from public.members m where m.group_id = g.id)
  from public.groups g where g.invite_code = p_code and not g.archived;
$$;

-- Join via invite code. Optionally claim an existing placeholder member (user_id is null).
create function public.join_group(p_code text, p_claim_member uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare gid uuid; prof public.profiles;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into gid from public.groups where invite_code = p_code and not archived;
  if gid is null then raise exception 'invalid invite'; end if;
  if exists (select 1 from public.members where group_id = gid and user_id = auth.uid()) then return gid; end if;
  select * into prof from public.profiles where id = auth.uid();
  if p_claim_member is not null then
    update public.members set user_id = auth.uid(), avatar_url = coalesce(avatar_url, prof.avatar_url)
    where id = p_claim_member and group_id = gid and user_id is null;
    if found then return gid; end if;
  end if;
  insert into public.members (group_id, user_id, name, avatar_url) values (gid, auth.uid(), prof.name, prof.avatar_url);
  return gid;
end $$;

-- Placeholder members (no account yet) the joiner may claim.
create function public.unclaimed_members(p_code text) returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select m.id, m.name from public.members m join public.groups g on g.id = m.group_id
  where g.invite_code = p_code and m.user_id is null;
$$;

grant execute on function public.create_group, public.group_preview, public.join_group, public.unclaimed_members to authenticated;

-- Atomic upsert of an expense and its shares (used by the offline sync queue).
create function public.save_expense(p_expense jsonb, p_shares jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare eid uuid := (p_expense->>'id')::uuid;
begin
  insert into public.expenses (id, group_id, title, amount_cents, paid_by, category_id, spent_at, split_mode, is_transfer)
  values (
    eid, (p_expense->>'group_id')::uuid, p_expense->>'title', (p_expense->>'amount_cents')::bigint,
    (p_expense->>'paid_by')::uuid, nullif(p_expense->>'category_id', '')::uuid,
    (p_expense->>'spent_at')::timestamptz, p_expense->>'split_mode', coalesce((p_expense->>'is_transfer')::boolean, false)
  )
  on conflict (id) do update set
    title = excluded.title, amount_cents = excluded.amount_cents, paid_by = excluded.paid_by,
    category_id = excluded.category_id, spent_at = excluded.spent_at, split_mode = excluded.split_mode,
    is_transfer = excluded.is_transfer, deleted_at = null;
  delete from public.expense_shares where expense_id = eid;
  insert into public.expense_shares (expense_id, member_id, cents, input_value)
  select eid, (s->>'member_id')::uuid, (s->>'cents')::bigint, nullif(s->>'input_value', '')::numeric
  from jsonb_array_elements(p_shares) s;
end $$;
grant execute on function public.save_expense to authenticated;
