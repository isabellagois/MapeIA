-- ============================================================
-- CRM de Prospecção GMN — Schema Supabase
-- Rode este arquivo inteiro no SQL Editor do seu projeto Supabase
-- ============================================================

-- ------------------------------------------------------------
-- 1. TABELAS
-- ------------------------------------------------------------

create table if not exists public.organizations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  email      text not null,
  full_name  text,
  role       text not null default 'admin' check (role in ('admin', 'member')),
  created_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  name       text not null,
  niche      text,
  status     text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

create table if not exists public.leads (
  id                  uuid primary key default gen_random_uuid(),
  campaign_id         uuid not null references public.campaigns (id) on delete cascade,
  org_id              uuid not null references public.organizations (id) on delete cascade,
  nome_empresa        text not null,
  telefone            text,
  whatsapp            text,
  website             text,
  endereco            text,
  bairro              text,
  cidade              text,
  nota_gmn            numeric,
  itens_faltando_gmn  text,
  argumento_vendas    text,
  prioridade          text check (prioridade in ('Alta', 'Média', 'Baixa')),
  status_funil        text not null default 'a_contatar' check (status_funil in (
                        'a_contatar',         -- 1. A contatar (inicial)
                        'dia_1',              -- 2. Dia 1 · Abertura
                        'dia_2',              -- 3. Dia 2 · Follow
                        'dia_3',              -- 4. Dia 3 · Aquecimento
                        'dia_4',              -- 5. Dia 4 · Prova
                        'dia_5',              -- 6. Dia 5 · Outro canal
                        'dia_6',              -- 7. Dia 6 · Reforço
                        'dia_7',              -- 8. Dia 7 · Breakup
                        'respondeu',          -- 9. Respondeu
                        'reuniao_marcada',    -- 10. Reunião marcada (negociação)
                        'virou_cliente',      -- 11. Virou cliente (ganho)
                        'perdido'             -- 12. Perdido
                      )),
  data_retorno        date,
  notas               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table if not exists public.activities (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references public.leads (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  user_id    uuid references auth.users (id) on delete set null,
  tipo       text not null,        -- ex: 'status_change', 'nota', 'retorno_agendado', 'importacao'
  descricao  text not null,
  created_at timestamptz not null default now()
);

-- Base de localidades para refinar buscas por localização (ver migration-localidades.sql).
-- Base única e compartilhada: todos leem, só admin escreve.
create table if not exists public.localidades (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  uf         text,
  pais       text not null default 'Brasil',
  apelidos   text[] not null default '{}',
  ddds       text[] not null default '{}',
  bairros    text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (nome, pais)
);

-- Índices
create index if not exists idx_campaigns_org      on public.campaigns (org_id);
create index if not exists idx_leads_campaign     on public.leads (campaign_id);
create index if not exists idx_leads_org          on public.leads (org_id);
create index if not exists idx_leads_status       on public.leads (status_funil);
create index if not exists idx_leads_retorno      on public.leads (data_retorno) where data_retorno is not null;
create index if not exists idx_activities_lead    on public.activities (lead_id);
create index if not exists idx_activities_org     on public.activities (org_id, created_at desc);
create index if not exists idx_localidades_nome   on public.localidades (nome);

-- Evita duplicatas pelo telefone dentro da mesma campanha
create unique index if not exists uniq_lead_telefone_campanha
  on public.leads (campaign_id, telefone)
  where telefone is not null and telefone <> '';

-- ------------------------------------------------------------
-- 2. FUNÇÕES AUXILIARES
-- ------------------------------------------------------------

-- Retorna o org_id do usuário logado (usada nas policies de RLS)
create or replace function public.current_org_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid();
$$;

-- Mantém updated_at sempre atualizado
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_leads_updated_at on public.leads;
create trigger trg_leads_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- Log automático de mudanças de status no histórico de atividades
create or replace function public.log_lead_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_label_old text;
  v_label_new text;
begin
  if (tg_op = 'UPDATE' and new.status_funil is distinct from old.status_funil) then
    v_label_old := old.status_funil;
    v_label_new := new.status_funil;
    insert into public.activities (lead_id, org_id, user_id, tipo, descricao)
    values (
      new.id,
      new.org_id,
      auth.uid(),
      'status_change',
      'Status alterado de "' || v_label_old || '" para "' || v_label_new || '"'
    );
  end if;

  if (tg_op = 'UPDATE' and new.data_retorno is distinct from old.data_retorno and new.data_retorno is not null) then
    insert into public.activities (lead_id, org_id, user_id, tipo, descricao)
    values (
      new.id,
      new.org_id,
      auth.uid(),
      'retorno_agendado',
      'Retorno agendado para ' || to_char(new.data_retorno, 'DD/MM/YYYY')
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_leads_log_status on public.leads;
create trigger trg_leads_log_status
  after update on public.leads
  for each row execute function public.log_lead_status_change();

-- Cria organização + perfil automaticamente quando um usuário se cadastra.
-- Se o cadastro incluir metadata org_id (convite), entra na org existente como member.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_org_name text;
begin
  if new.raw_user_meta_data ->> 'org_id' is not null then
    v_org_id := (new.raw_user_meta_data ->> 'org_id')::uuid;
    insert into public.profiles (id, org_id, email, full_name, role)
    values (new.id, v_org_id, new.email, new.raw_user_meta_data ->> 'full_name', 'member');
  else
    v_org_name := coalesce(new.raw_user_meta_data ->> 'org_name', 'Minha Empresa');
    insert into public.organizations (name) values (v_org_name) returning id into v_org_id;
    insert into public.profiles (id, org_id, email, full_name, role)
    values (new.id, v_org_id, new.email, new.raw_user_meta_data ->> 'full_name', 'admin');
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- Cada organização enxerga apenas os próprios dados
-- ------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles      enable row level security;
alter table public.campaigns     enable row level security;
alter table public.leads         enable row level security;
alter table public.activities    enable row level security;
alter table public.localidades   enable row level security;

-- organizations
drop policy if exists org_select on public.organizations;
create policy org_select on public.organizations
  for select using (id = public.current_org_id());

drop policy if exists org_update on public.organizations;
create policy org_update on public.organizations
  for update using (id = public.current_org_id());

-- profiles (vê os perfis da própria org; edita apenas o próprio)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (org_id = public.current_org_id());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (id = auth.uid());

-- campaigns
drop policy if exists campaigns_all on public.campaigns;
create policy campaigns_all on public.campaigns
  for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- leads
drop policy if exists leads_all on public.leads;
create policy leads_all on public.leads
  for all
  using (org_id = public.current_org_id())
  with check (org_id = public.current_org_id());

-- activities
drop policy if exists activities_select on public.activities;
create policy activities_select on public.activities
  for select using (org_id = public.current_org_id());

drop policy if exists activities_insert on public.activities;
create policy activities_insert on public.activities
  for insert with check (org_id = public.current_org_id());

-- localidades (base compartilhada: todos leem, só admin escreve)
drop policy if exists localidades_select on public.localidades;
create policy localidades_select on public.localidades
  for select using (auth.uid() is not null);

drop policy if exists localidades_admin_write on public.localidades;
create policy localidades_admin_write on public.localidades
  for all using (public.is_admin()) with check (public.is_admin());
