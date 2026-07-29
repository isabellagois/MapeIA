-- ============================================================
-- MapeIA — Migração: dados extras do Google Maps no lead
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- ============================================================

alter table public.leads
  add column if not exists link_gmn text,
  add column if not exists categoria_gmn text,
  add column if not exists total_avaliacoes integer;
