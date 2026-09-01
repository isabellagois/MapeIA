-- ============================================================
-- MapeIA — Migração: novo funil (cadência de prospecção)
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- Substitui o funil antigo por: A contatar, Dia 1..7, Respondeu,
-- Reunião marcada, Virou cliente (ganho) e Perdido.
-- Também migra os leads existentes para as novas colunas.
-- ============================================================

begin;

-- 1. Libera a constraint para poder migrar os valores
alter table public.leads drop constraint if exists leads_status_funil_check;

-- 2. Migra os leads existentes (sem floodar o histórico de atividades)
alter table public.leads disable trigger trg_leads_log_status;

update public.leads set status_funil = case status_funil
  when 'nao_contatado'    then 'a_contatar'
  when 'tentativa'        then 'dia_1'
  when 'tentativa_msg'    then 'dia_2'
  when 'contato_feito'    then 'dia_1'
  when 'proposta_enviada' then 'reuniao_marcada'
  when 'em_negociacao'    then 'reuniao_marcada'
  when 'fechado'          then 'virou_cliente'
  when 'descartado'       then 'perdido'
  when 'retornar'         then 'dia_1'
  else status_funil
end
where status_funil in (
  'nao_contatado', 'tentativa', 'tentativa_msg', 'contato_feito',
  'proposta_enviada', 'em_negociacao', 'fechado', 'descartado', 'retornar'
);

alter table public.leads enable trigger trg_leads_log_status;

-- 3. Novo padrão e nova constraint
alter table public.leads alter column status_funil set default 'a_contatar';

alter table public.leads add constraint leads_status_funil_check check (status_funil in (
  'a_contatar',       -- 1. A contatar (inicial)
  'dia_1',            -- 2. Dia 1 · Abertura
  'dia_2',            -- 3. Dia 2 · Follow
  'dia_3',            -- 4. Dia 3 · Aquecimento
  'dia_4',            -- 5. Dia 4 · Prova
  'dia_5',            -- 6. Dia 5 · Outro canal
  'dia_6',            -- 7. Dia 6 · Reforço
  'dia_7',            -- 8. Dia 7 · Breakup
  'respondeu',        -- 9. Respondeu
  'reuniao_marcada',  -- 10. Reunião marcada (negociação)
  'virou_cliente',    -- 11. Virou cliente (ganho)
  'perdido'           -- 12. Perdido
));

-- 4. Atualiza as métricas por campanha para os novos papéis
create or replace function public.campaign_metrics()
returns table (
  campaign_id uuid,
  total       bigint,
  contatados  bigint,
  negociacao  bigint,
  fechados    bigint
)
language sql
stable
set search_path = public
as $$
  select
    l.campaign_id,
    count(*)::bigint,
    count(*) filter (where l.status_funil <> 'a_contatar')::bigint,
    count(*) filter (where l.status_funil in ('reuniao_marcada'))::bigint,
    count(*) filter (where l.status_funil = 'virou_cliente')::bigint
  from public.leads l
  group by l.campaign_id;
$$;

commit;
