-- ============================================================
-- MapeIA — Migração: novo status do funil + data do 1º contato
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
-- ============================================================

-- 1. Novo status "tentativa_msg" (Tentativa — não respondeu mensagem)
alter table public.leads drop constraint if exists leads_status_funil_check;
alter table public.leads add constraint leads_status_funil_check check (status_funil in (
  'nao_contatado',      -- 1. Não contatado
  'tentativa',          -- 2. Tentativa - não atendeu
  'tentativa_msg',      -- 3. Tentativa - não respondeu mensagem
  'contato_feito',      -- 4. Contato feito
  'proposta_enviada',   -- 5. Proposta enviada
  'em_negociacao',      -- 6. Em negociação
  'fechado',            -- 7. Cliente fechado
  'descartado',         -- 8. Sem interesse / Descartado
  'retornar'            -- Especial: retornar em data agendada
));

-- 2. Data do primeiro contato
alter table public.leads
  add column if not exists data_primeiro_contato date;
