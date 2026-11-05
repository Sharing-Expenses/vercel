-- A group is closed once everything in it has been paid. The app warns before adding an expense to a closed group.
alter table public.groups add column closed boolean not null default false;
