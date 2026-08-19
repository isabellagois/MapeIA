-- ============================================================
-- MapeIA — Migração: base de localidades (cidades, bairros, DDDs)
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
--
-- Serve para refinar as buscas do Instagram por localização:
--  * apelidos -> variações do nome da cidade (Brasilia, BSB, DF...)
--  * ddds     -> códigos de área que confirmam a região pelo telefone
--  * bairros  -> regiões/bairros que também contam como a cidade
--                (ex.: "Samambaia" conta como Brasília)
--
-- Base ÚNICA e compartilhada (uso interno de uma empresa):
--  * qualquer usuário logado LÊ (a busca precisa dos termos)
--  * apenas ADMIN escreve (reaproveita public.is_admin())
-- ============================================================

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

create index if not exists idx_localidades_nome on public.localidades (nome);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
alter table public.localidades enable row level security;

-- Leitura: qualquer usuário autenticado (a busca precisa consultar)
drop policy if exists localidades_select on public.localidades;
create policy localidades_select on public.localidades
  for select using (auth.uid() is not null);

-- Escrita (inserir/editar/remover): apenas admin
drop policy if exists localidades_admin_write on public.localidades;
create policy localidades_admin_write on public.localidades
  for all using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------
-- Seed inicial: Brasília / DF (regiões administrativas como bairros)
-- ------------------------------------------------------------
insert into public.localidades (nome, uf, pais, apelidos, ddds, bairros)
values (
  'Brasília',
  'DF',
  'Brasil',
  array['Brasilia', 'BSB', 'DF', 'Distrito Federal'],
  array['61'],
  array[
    'Plano Piloto', 'Asa Norte', 'Asa Sul', 'Lago Norte', 'Lago Sul',
    'Sudoeste', 'Noroeste', 'Octogonal', 'Cruzeiro', 'Guará', 'Guara',
    'Águas Claras', 'Aguas Claras', 'Vicente Pires', 'Taguatinga',
    'Ceilândia', 'Ceilandia', 'Samambaia', 'Recanto das Emas', 'Gama',
    'Santa Maria', 'São Sebastião', 'Sao Sebastiao', 'Planaltina',
    'Sobradinho', 'Paranoá', 'Paranoa', 'Itapoã', 'Itapoa',
    'Riacho Fundo', 'Núcleo Bandeirante', 'Nucleo Bandeirante',
    'Candangolândia', 'Candangolandia', 'Park Way', 'Brazlândia',
    'Brazlandia', 'Jardim Botânico', 'Jardim Botanico', 'Varjão',
    'Varjao', 'Estrutural'
  ]
)
on conflict (nome, pais) do nothing;
