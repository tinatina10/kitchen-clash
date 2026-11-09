-- Kitchen Clash prototype schema.
-- Run this in Supabase SQL Editor. This permissive policy is for a private, early prototype only.
-- Do not use it for public ranked play or store sensitive information.

create table if not exists public.kc_rooms (
  code text primary key check (code ~ '^[A-Z0-9]{6}$'),
  host_name text not null,
  guest_name text,
  status text not null default 'waiting' check (status in ('waiting','ready','playing','finished')),
  game_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.kc_rooms enable row level security;

drop policy if exists "prototype rooms readable by anon" on public.kc_rooms;
create policy "prototype rooms readable by anon"
on public.kc_rooms for select to anon using (true);

drop policy if exists "prototype rooms creatable by anon" on public.kc_rooms;
create policy "prototype rooms creatable by anon"
on public.kc_rooms for insert to anon with check (true);

drop policy if exists "prototype rooms updatable by anon" on public.kc_rooms;
create policy "prototype rooms updatable by anon"
on public.kc_rooms for update to anon using (true) with check (true);

alter publication supabase_realtime add table public.kc_rooms;

-- Supabase Realtime must have kc_rooms enabled. If the ALTER PUBLICATION above
-- reports that the table is already included, that is safe to ignore.
