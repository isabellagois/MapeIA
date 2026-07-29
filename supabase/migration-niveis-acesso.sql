-- ============================================================
-- MapeIA — Migração: níveis de acesso por campanha
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- Modelo:
--  * admin  -> vê e controla tudo na organização
--  * member -> vê apenas: campanhas que criou + campanhas
--              compartilhadas com ele via campaign_access
--    - nivel 'leitura': só visualiza
--    - nivel 'edicao' : trabalha os leads (status, notas, importação)
-- ============================================================

-- 1. Tabela de acessos concedidos -----------------------------

create table if not exists public.campaign_access (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns (id) on delete cascade,
  profile_id  uuid not null references public.profiles (id) on delete cascade,
  nivel       text not null default 'edicao' check (nivel in ('leitura', 'edicao')),
  created_at  timestamptz not null default now(),
  unique (campaign_id, profile_id)
);

alter table public.campaign_access enable row level security;

-- membros veem os próprios acessos; admin vê e gerencia todos os da org
drop policy if exists ca_select on public.campaign_access;
create policy ca_select on public.campaign_access
  for select using (
    profile_id = auth.uid()
    or (public.is_admin() and exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.org_id = public.current_org_id()
    ))
  );

drop policy if exists ca_admin_write on public.campaign_access;
create policy ca_admin_write on public.campaign_access
  for all using (
    public.is_admin() and exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.org_id = public.current_org_id()
    )
  )
  with check (
    public.is_admin() and exists (
      select 1 from public.campaigns c
      where c.id = campaign_id and c.org_id = public.current_org_id()
    )
  );

-- 2. Função auxiliar -------------------------------------------

-- Nível de acesso concedido ao usuário logado para uma campanha
-- (null quando não há concessão)
create or replace function public.nivel_acesso(cid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select nivel from public.campaign_access
  where campaign_id = cid and profile_id = auth.uid();
$$;

-- 3. RLS atualizada ---------------------------------------------

-- campaigns: membro vê as que criou OU as compartilhadas com ele
drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
  for select using (
    org_id = public.current_org_id()
    and (
      public.is_admin()
      or created_by = auth.uid()
      or public.nivel_acesso(id) is not null
    )
  );

-- editar/arquivar campanha: só admin ou criador
drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns
  for update using (
    org_id = public.current_org_id()
    and (public.is_admin() or created_by = auth.uid())
  );

-- leads: ver segue a campanha; mexer exige 'edicao' (ou ser admin/criador)
drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select using (
    org_id = public.current_org_id()
    and (
      public.is_admin()
      or public.campaign_creator(campaign_id) = auth.uid()
      or public.nivel_acesso(campaign_id) is not null
    )
  );

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert with check (
    org_id = public.current_org_id()
    and (
      public.is_admin()
      or public.campaign_creator(campaign_id) = auth.uid()
      or public.nivel_acesso(campaign_id) = 'edicao'
    )
  );

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update using (
    org_id = public.current_org_id()
    and (
      public.is_admin()
      or public.campaign_creator(campaign_id) = auth.uid()
      or public.nivel_acesso(campaign_id) = 'edicao'
    )
  );

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete using (
    org_id = public.current_org_id()
    and (
      public.is_admin()
      or public.campaign_creator(campaign_id) = auth.uid()
      or public.nivel_acesso(campaign_id) = 'edicao'
    )
  );

-- 4. Admin pode alterar o papel (admin/colaborador) dos perfis da org
drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update using (
    org_id = public.current_org_id() and public.is_admin()
  );
