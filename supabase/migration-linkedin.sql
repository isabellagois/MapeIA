-- ============================================================
-- MapeIA — Migração: campanhas LinkedIn (busca por decisores)
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- ============================================================

-- 1. Novo tipo de campanha "linkedin"
alter table public.campaigns drop constraint if exists campaigns_tipo_check;
alter table public.campaigns add constraint campaigns_tipo_check
  check (tipo in ('google', 'instagram', 'linkedin'));

-- 2. Campos do decisor no lead
alter table public.leads
  add column if not exists cargo text,
  add column if not exists empresa_atual text,
  add column if not exists email text;
