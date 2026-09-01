# Banco de dados

O banco roda no **Supabase (PostgreSQL)**. O arquivo `supabase/schema.sql` cria a base; os `migration-*.sql` são incrementos aplicados depois. Todos são rodados manualmente no **SQL Editor** do Supabase (copiar o conteúdo e clicar em *Run*).

---

## Tabelas

### `organizations`
Uma linha por empresa/conta.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `name` | text | |
| `created_at` | timestamptz | |

### `profiles`
Um perfil por usuário autenticado (referencia `auth.users`).

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | = id do usuário em `auth.users` |
| `org_id` | uuid (FK) | organização do usuário |
| `email` | text | |
| `full_name` | text | |
| `role` | text | `admin` ou `member` |

### `campaigns`
Agrupa leads por origem e nicho.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `org_id` | uuid (FK) | |
| `name` | text | |
| `niche` | text | nicho/termo sugerido nas buscas |
| `tipo` | text | `google`, `instagram` ou `linkedin` |
| `status` | text | `active` ou `archived` |
| `created_by` | uuid (FK profiles) | |
| `created_at` | timestamptz | |

### `leads`
O registro central. Principais colunas:

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `campaign_id` / `org_id` | uuid (FK) | |
| `nome_empresa` | text | obrigatório |
| `telefone` / `whatsapp` | text | dedup por telefone |
| `website` / `endereco` / `bairro` / `cidade` | text | |
| `nota_gmn` / `total_avaliacoes` | numeric | dados do Google Meu Negócio |
| `link_gmn` | text | URL (Google/Instagram/LinkedIn) — usada na dedup |
| `categoria_gmn` | text | categoria / seguidores (varia por origem) |
| `cargo` / `empresa_atual` / `email` | text | leads de LinkedIn |
| `prioridade` | text | `Alta`, `Média`, `Baixa` |
| `status_funil` | text | etapa do funil (ver abaixo) |
| `data_retorno` / `hora_retorno` | date/time | agendamento de retorno |
| `data_primeiro_contato` | date | |
| `notas` | text | inclui a bio do Instagram / rapport do LinkedIn |
| `responsavel_id` | uuid (FK profiles) | |
| `created_at` / `updated_at` | timestamptz | |

**`status_funil`** é um texto com `CHECK` restrito às etapas do funil de cadência:
`a_contatar`, `dia_1`…`dia_7`, `respondeu`, `reuniao_marcada`, `virou_cliente`, `perdido`
(padrão: `a_contatar`). A configuração visual e os papéis semânticos ficam em `src/lib/utils.ts`.

### `activities`
Histórico automático do lead (mudança de status, agendamento de retorno, etc.).

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `lead_id` / `org_id` | uuid (FK) | |
| `user_id` | uuid (FK auth.users) | quem fez |
| `tipo` | text | `status_change`, `retorno_agendado`, ... |
| `descricao` | text | |
| `created_at` | timestamptz | |

### `campaign_access`
Acessos concedidos a membros para campanhas específicas (níveis `leitura`/`edicao`).

### `localidades`
Base compartilhada usada para refinar as buscas do Instagram.

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid (PK) | |
| `nome` / `uf` / `pais` | text | |
| `apelidos` | text[] | variações do nome (Brasilia, BSB, DF...) |
| `ddds` | text[] | DDDs que confirmam a região (ex.: `61`) |
| `bairros` | text[] | bairros que contam como a cidade |

RLS: leitura para qualquer usuário logado; escrita só para `admin`.

---

## Funções

| Função | Para quê |
|---|---|
| `current_org_id()` | Retorna o `org_id` do usuário logado (usada nas RLS). |
| `is_admin()` | Se o usuário logado tem `role = 'admin'`. |
| `nivel_acesso(cid)` | Nível de acesso do usuário a uma campanha (`leitura`/`edicao`/null). |
| `campaign_metrics()` | Contagem por campanha (total, contatados, negociação, fechados) direto no banco, respeitando o RLS do chamador. Evita o limite de 1000 linhas do PostgREST. |
| `handle_new_user()` | Trigger: cria organização + perfil ao cadastrar (ou entra na org do convite como `member`). |
| `set_updated_at()` | Trigger: mantém `leads.updated_at`. |
| `log_lead_status_change()` | Trigger: registra em `activities` as mudanças de status e agendamentos de retorno. |

---

## Triggers

- `on_auth_user_created` — `after insert on auth.users` → `handle_new_user()`.
- `trg_leads_updated_at` — `before update on leads` → `set_updated_at()`.
- `trg_leads_log_status` — `after update on leads` → `log_lead_status_change()`.

---

## Row Level Security (resumo)

- **organizations / profiles / leads / campaigns / activities:** escopo por `current_org_id()`.
- **campaigns / leads:** membros só veem as campanhas que criaram ou que receberam via `campaign_access`; admin vê tudo da org.
- **localidades:** todos leem; só admin escreve.
- **profiles:** cada um edita o próprio; admin pode alterar papéis da org.

---

## Migrations (ordem e propósito)

Rodar `schema.sql` primeiro; depois as migrations, na ordem cronológica:

| Arquivo | O que faz |
|---|---|
| `schema.sql` | Tabelas base, funções, triggers e RLS. |
| `migration-tipo-campanha.sql` | Adiciona `campaigns.tipo` (google/instagram/linkedin). |
| `migration-dados-gmn.sql` | Campos de Google Meu Negócio nos leads (link, categoria, avaliações). |
| `migration-bairro.sql` | Adiciona `leads.bairro`. |
| `migration-status-contato.sql` | Novo status intermediário + `data_primeiro_contato`. |
| `migration-hora-retorno.sql` | Adiciona `leads.hora_retorno`. |
| `migration-linkedin.sql` | Campos de LinkedIn (cargo, empresa, e-mail). |
| `migration-equipe.sql` | `is_admin()` e base de equipe. |
| `migration-niveis-acesso.sql` | `campaign_access`, `nivel_acesso()` e RLS granular por campanha. |
| `migration-localidades.sql` | Tabela `localidades` (+ seed de Brasília) e RLS admin. |
| `migration-metricas-campanha.sql` | Função `campaign_metrics()`. |
| `migration-funil-cadencia.sql` | Novo funil de cadência + migração dos leads existentes + atualização de `campaign_metrics()`. |

> As migrations são idempotentes (podem rodar mais de uma vez). O `schema.sql` é o arquivo canônico e é atualizado junto com as migrations, mas em um banco já existente aplique as migrations — não rode o `schema.sql` por cima.
