-- ============================================================
-- MapeIA — Migração: horário no agendamento de retorno
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- ============================================================

alter table public.leads
  add column if not exists hora_retorno time;
