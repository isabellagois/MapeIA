-- ============================================================
-- MapeIA — Migração: métricas por campanha (contagem no banco)
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- Corrige a contagem de leads na lista de campanhas: antes o app baixava
-- todos os leads de todas as campanhas em uma query (limitada a 1000 linhas
-- pelo Supabase), o que zerava/errava o total quando havia mais de 1000
-- leads somando as campanhas. Agora a contagem é feita no banco.
--
-- SECURITY INVOKER (padrão): roda com o RLS do usuário chamador, então
-- cada um vê apenas as métricas dos leads que já tem permissão de ver.
-- ============================================================

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
    count(*) filter (where l.status_funil <> 'nao_contatado')::bigint,
    count(*) filter (where l.status_funil in ('em_negociacao', 'proposta_enviada'))::bigint,
    count(*) filter (where l.status_funil = 'fechado')::bigint
  from public.leads l
  group by l.campaign_id;
$$;

grant execute on function public.campaign_metrics() to authenticated;
