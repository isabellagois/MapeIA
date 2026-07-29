-- ============================================================
-- MapeIA — Migração: tipo de campanha (Google ou Instagram)
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- ============================================================

alter table public.campaigns
  add column if not exists tipo text not null default 'google'
  check (tipo in ('google', 'instagram'));
