-- ============================================================
-- MapeIA — Migração: equipe, responsável por lead e autor da campanha
-- Rode este arquivo inteiro no SQL Editor do Supabase.
-- Pode ser executado mais de uma vez sem causar erro.
-- ============================================================

-- 1. Novas colunas -------------------------------------------

alter table public.campaigns
  add column if not exists created_by uuid references public.profiles (id) on delete set null;

alter table public.leads
  add column if not exists responsavel_id uuid references public.profiles (id) on delete set null;

-- Campanhas antigas passam a pertencer ao admin da organização
update public.campaigns c
set created_by = (
  select p.id from public.profiles p
  where p.org_id = c.org_id and p.role = 'admin'
  order by p.created_at
  limit 1
)
where created_by is null;

create index if not exists idx_leads_responsavel on public.leads (responsavel_id);
create index if not exists idx_campaigns_created_by on public.campaigns (created_by);

-- 2. Funções auxiliares ---------------------------------------

-- true se o usuário logado é admin da organização
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- Quem criou a campanha (bypassa RLS para uso dentro de policies)
create or replace function public.campaign_creator(cid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select created_by from public.campaigns where id = cid;
$$;

-- 3. Atribuição automática de responsável ---------------------
-- Quem mexer primeiro no lead (status/notas/retorno) vira o responsável.

create or replace function public.auto_atribuir_responsavel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.responsavel_id is null and auth.uid() is not null then
    new.responsavel_id := auth.uid();
    insert into public.activities (lead_id, org_id, user_id, tipo, descricao)
    values (
      new.id, new.org_id, auth.uid(), 'atribuicao',
      'Lead atribuído automaticamente a ' || coalesce(
        (select coalesce(full_name, email) from public.profiles where id = auth.uid()),
        'usuário'
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_leads_auto_responsavel on public.leads;
create trigger trg_leads_auto_responsavel
  before update on public.leads
  for each row execute function public.auto_atribuir_responsavel();

-- 4. Novas regras de visibilidade (RLS) -----------------------
-- Admin vê tudo da organização; membro vê apenas as campanhas
-- que ele próprio criou (e os leads/atividades dentro delas).

-- campaigns
drop policy if exists campaigns_all on public.campaigns;

drop policy if exists campaigns_select on public.campaigns;
create policy campaigns_select on public.campaigns
  for select using (
    org_id = public.current_org_id()
    and (public.is_admin() or created_by = auth.uid())
  );

drop policy if exists campaigns_insert on public.campaigns;
create policy campaigns_insert on public.campaigns
  for insert with check (
    org_id = public.current_org_id()
    and created_by = auth.uid()
  );

drop policy if exists campaigns_update on public.campaigns;
create policy campaigns_update on public.campaigns
  for update using (
    org_id = public.current_org_id()
    and (public.is_admin() or created_by = auth.uid())
  );

drop policy if exists campaigns_delete on public.campaigns;
create policy campaigns_delete on public.campaigns
  for delete using (
    org_id = public.current_org_id()
    and (public.is_admin() or created_by = auth.uid())
  );

-- leads (seguem a visibilidade da campanha)
drop policy if exists leads_all on public.leads;

drop policy if exists leads_select on public.leads;
create policy leads_select on public.leads
  for select using (
    org_id = public.current_org_id()
    and (public.is_admin() or public.campaign_creator(campaign_id) = auth.uid())
  );

drop policy if exists leads_insert on public.leads;
create policy leads_insert on public.leads
  for insert with check (
    org_id = public.current_org_id()
    and (public.is_admin() or public.campaign_creator(campaign_id) = auth.uid())
  );

drop policy if exists leads_update on public.leads;
create policy leads_update on public.leads
  for update using (
    org_id = public.current_org_id()
    and (public.is_admin() or public.campaign_creator(campaign_id) = auth.uid())
  );

drop policy if exists leads_delete on public.leads;
create policy leads_delete on public.leads
  for delete using (
    org_id = public.current_org_id()
    and (public.is_admin() or public.campaign_creator(campaign_id) = auth.uid())
  );

-- activities (visíveis apenas se o lead correspondente for visível)
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select using (
    org_id = public.current_org_id()
    and exists (select 1 from public.leads l where l.id = lead_id)
  );

-- (a policy de insert de activities permanece a mesma: org_id da própria org)
