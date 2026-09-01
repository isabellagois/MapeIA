# Arquitetura

## Visão geral

O MapeIA é uma **SPA (Single Page Application)** em React servida como site estático pela Vercel, com todo o back-end delegado ao **Supabase** (PostgreSQL + Auth + Row Level Security) e uma **função serverless** na Vercel apenas para o envio de e-mails.

```
┌──────────────────────────────────────────────────────────────┐
│                        Navegador                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │            SPA React (Vite + TypeScript)                │  │
│  │   Pages · Components · Hooks · lib (supabase/apify)     │  │
│  └───────────────┬───────────────────────┬────────────────┘  │
└──────────────────┼───────────────────────┼───────────────────┘
                   │ supabase-js           │ fetch
                   │ (Auth + PostgREST)    │
         ┌─────────▼─────────┐   ┌─────────▼──────────┐   ┌──────────────┐
         │     Supabase      │   │ /api/enviar-emails │   │    Apify     │
         │  Postgres + Auth  │   │ (serverless Vercel)│   │ (chamada     │
         │  + RLS + funções  │   │  → Resend (e-mail) │   │  direta do   │
         └───────────────────┘   └────────────────────┘   │  navegador)  │
                                                          └──────────────┘
```

Pontos-chave:

- **Sem servidor de aplicação próprio.** O navegador fala direto com o Supabase via `supabase-js` (que usa a API PostgREST e o GoTrue Auth). A segurança fica nas políticas de **RLS** do banco, não em código de servidor.
- **A busca de leads (Apify) roda no próprio navegador**, usando o token que o usuário informa. Não passa por back-end nosso.
- **A única função serverless** é `api/enviar-emails.ts`, porque o envio via Resend exige uma chave secreta que não pode ir para o front.

---

## Frontend

### Stack
- **React 18** + **Vite 5** + **TypeScript**
- **Tailwind CSS** para estilo (classes utilitárias; tema com a paleta `brand-*`)
- **React Router 6** para navegação
- **lucide-react** para ícones
- **papaparse** para leitura de CSV

### Roteamento (`src/App.tsx`)
Rotas protegidas por sessão (renderizadas dentro de `<Layout>`):

| Rota | Página | Observação |
|---|---|---|
| `/` | Dashboard | métricas e performance |
| `/campanhas` | Campaigns | lista de campanhas + métricas |
| `/campanhas/:id` | CampaignDetail | tabela + Kanban de leads |
| `/retornos` | Retornos | "Para contatar" (retornos vencidos) |
| `/equipe` | Equipe | gestão de membros e acessos |
| `/localidades` | Localidades | base de cidades (só admin) |

Fora do layout: `Login` (quando não há sessão) e `RedefinirSenha` (fluxo de recuperação de senha, interceptado antes das rotas normais).

### Organização de código

- **`src/pages/`** — telas completas (uma por rota).
- **`src/components/`** — blocos reutilizáveis: `Layout` (menu + estrutura), `LeadDrawer` (painel lateral do lead), modais (`ApifySearchModal`, `CsvImportModal`, `EmailMassaModal`, `ManualLeadsModal`), `StatusBadge`, `PrioridadeBadge`, `Spinner`.
- **`src/hooks/`** — `useAuth` (contexto de sessão + perfil do Supabase) e `useEquipe` (lista de membros da organização).
- **`src/lib/`** — lógica sem UI:
  - `supabase.ts` — cria o client a partir das variáveis de ambiente.
  - `apify.ts` — dispara os actors da Apify e mapeia os resultados para o formato de lead.
  - `localidades.ts` — CRUD da base de localidades e a lógica de filtro geográfico (DDD/DDI/termos).
  - `utils.ts` — configuração do funil (`STATUS_CONFIG`), papéis semânticos, datas e links.
  - `csv.ts` — parse e exportação de CSV.
- **`src/types/`** — tipos do domínio (`Lead`, `Campaign`, `Profile`, `StatusFunil`, ...).

### Comunicação entre telas
Além do estado do React, o app usa um evento global do navegador (`leads-atualizados`) para atualizar o badge de retornos do menu quando qualquer tela altera um lead (`notificarLeadsAtualizados()` em `Layout.tsx`).

---

## Backend (Supabase)

- **PostgreSQL** com todas as tabelas do domínio (ver [BANCO-DE-DADOS.md](BANCO-DE-DADOS.md)).
- **Auth (GoTrue):** e-mail/senha, recuperação de senha e convites por link.
- **Row Level Security (RLS):** cada organização enxerga apenas os próprios dados; membros veem apenas as campanhas que criaram ou que lhes foram liberadas.
- **Funções e triggers:** criação automática de organização/perfil no cadastro, log de histórico de atividades, `updated_at` automático e a função de métricas por campanha.

### Modelo multi-tenant

```
organizations (1) ──< profiles (usuários; role admin|member)
      │
      └──< campaigns ──< leads ──< activities
                   └──< campaign_access (acessos concedidos a membros)
```

- Todo cadastro novo cria uma **organização** e um **perfil admin** (trigger `handle_new_user`). Convites (link com `?convite=<org_id>`) fazem a pessoa entrar como `member` na organização existente.
- As políticas de RLS usam duas funções auxiliares: `current_org_id()` (org do usuário logado) e `is_admin()` (se o usuário é admin).

---

## Serverless (envio de e-mail)

`api/enviar-emails.ts` roda como função na Vercel. Recebe `leadIds`, `assunto` e `corpo`, valida a sessão do usuário (token do Supabase), busca os e-mails dos leads e dispara via **Resend** (endpoint `/emails/batch`, em lotes de 100). Exige as variáveis `RESEND_API_KEY` e `EMAIL_REMETENTE`.

---

## Fluxo de dados típico

1. **Buscar leads:** o usuário abre uma campanha → *Buscar* → o navegador chama a Apify, filtra/deduplica e insere os leads no Supabase.
2. **Trabalhar o funil:** arrastar cards no Kanban ou editar no painel do lead atualiza `status_funil`; um trigger registra a mudança no histórico.
3. **Métricas:** a lista de campanhas e o dashboard leem contagens (função `campaign_metrics()` e queries agregadas) para montar os indicadores.
