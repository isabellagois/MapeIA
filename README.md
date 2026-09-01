# MapeIA 📍

[![CI](https://github.com/isabellagois/MapeIA/actions/workflows/ci.yml/badge.svg)](https://github.com/isabellagois/MapeIA/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?logo=supabase&logoColor=white)

**CRM web de prospecção multicanal.** Encontre leads no **Google Maps**, **Instagram** e **LinkedIn** (via Apify), organize-os em campanhas, trabalhe um **funil de cadência** no Kanban, agende retornos, dispare **campanhas de e-mail** e acompanhe tudo em um dashboard — com controle de acesso por equipe.

**Stack:** React + Vite + TypeScript · Tailwind CSS · Supabase (PostgreSQL + Auth + RLS) · Funções serverless na Vercel · Resend (e-mail) · Apify (scraping)

---

## 📚 Documentação

Toda a documentação detalhada está na pasta [`docs/`](docs/):

| Documento | Conteúdo |
|---|---|
| [Arquitetura](docs/ARQUITETURA.md) | Visão geral, frontend, backend, multi-tenant e fluxo de dados |
| [Banco de dados](docs/BANCO-DE-DADOS.md) | Tabelas, funções, triggers, RLS e migrations |
| [Funcionalidades](docs/FUNCIONALIDADES.md) | Campanhas, leads, funil, dashboard, equipe, e-mail, CSV |
| [Integrações](docs/INTEGRACOES.md) | Apify (Google/Instagram/LinkedIn), Resend e localidades |
| [Deploy e setup](docs/DEPLOY.md) | Variáveis de ambiente, Supabase, Vercel e execução local |
| [Histórico do projeto](docs/HISTORICO.md) | Linha do tempo da construção do CRM e decisões de design |

---

## ✨ Principais recursos

- **Busca de leads (Apify):** Google Maps, Instagram (com filtro por cidade/país, bairros e DDD, cruzamento por hashtag e método "local") e LinkedIn (decisores com cargo, empresa e e-mail).
- **Campanhas:** agrupam leads por origem e nicho; deduplicação automática (telefone / link do perfil) ao importar.
- **Funil de cadência:** Kanban com as etapas *A contatar → Dia 1..7 → Respondeu → Reunião marcada → Virou cliente / Perdido*.
- **Painel do lead:** todas as informações, histórico de atividades, status, prioridade e agendamento de retorno.
- **Para contatar:** leads com retorno vencido aparecem com alerta e contagem no menu.
- **Dashboard:** métricas do funil, taxa de conversão e performance por membro.
- **Equipe e permissões:** papéis `admin`/`member` e acesso por campanha.
- **Localidades:** base editável (admin) de cidades → apelidos, DDDs e bairros, usada para refinar as buscas do Instagram.
- **Campanhas de e-mail:** disparo em massa via Resend para os leads filtrados.
- **Importar/Exportar CSV.**

---

## 🚀 Início rápido

```bash
# 1. Instalar dependências
npm install

# 2. Configurar o Supabase (ver docs/DEPLOY.md)
cp .env.example .env   # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# 3. Rodar localmente
npm run dev            # http://localhost:5173
```

O passo a passo completo (criar o projeto Supabase, rodar o schema + migrations, publicar na Vercel) está em [docs/DEPLOY.md](docs/DEPLOY.md).

---

## 🗂 Estrutura do projeto

```
/api
  enviar-emails.ts        → função serverless (Vercel) que envia e-mails via Resend
/src
  /components             → Layout, LeadDrawer, ApifySearchModal, CsvImportModal,
                            EmailMassaModal, ManualLeadsModal, StatusBadge, ...
  /pages                  → Login, Dashboard, Campaigns, CampaignDetail, Retornos,
                            Equipe, Localidades, RedefinirSenha
  /hooks                  → useAuth (Supabase Auth + perfil), useEquipe
  /lib                    → supabase (client), apify (buscas), localidades (filtro),
                            utils (funil, datas, links), csv (parse/export)
  /types                  → tipos TypeScript do domínio
/supabase
  schema.sql              → schema base (rodar primeiro no SQL Editor)
  migration-*.sql         → migrations incrementais (ver docs/BANCO-DE-DADOS.md)
```

---

## 🛠 Scripts

```bash
npm run dev      # desenvolvimento local (Vite)
npm run build    # build de produção (tsc -b && vite build)
npm run preview  # pré-visualizar o build
```

---

## 🐳 Rodar com Docker

O `Dockerfile` faz um build multi-stage (Node para compilar, Nginx para servir a SPA):

```bash
# Build da imagem (passe as suas chaves do Supabase como build-args)
docker build \
  --build-arg VITE_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=sua-anon-key \
  -t mapeia .

# Rodar
docker run -p 8080:80 mapeia    # http://localhost:8080
```

> O container serve apenas a SPA. A função serverless de e-mail (`api/enviar-emails.ts`) é específica da Vercel e não roda no container.

---

## ✅ Integração contínua (CI)

Um workflow do **GitHub Actions** (`.github/workflows/ci.yml`) roda a cada push e pull request na `main`, validando o build (checagem de tipos + Vite). O status aparece no badge no topo deste README e em cada commit.

---

## 🔑 Variáveis de ambiente

| Variável | Onde | Para quê |
|---|---|---|
| `VITE_SUPABASE_URL` | Vercel + `.env` local | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | Vercel + `.env` local | Chave pública (anon) do Supabase |
| `RESEND_API_KEY` | Vercel (serverless) | Envio de e-mails via Resend |
| `EMAIL_REMETENTE` | Vercel (serverless) | Remetente das campanhas de e-mail |

O **token da Apify** não é variável de ambiente — cada usuário informa o próprio token na tela de busca, salvo apenas no navegador (`localStorage`).

---

## 🚢 Deploy

Deploy contínuo na **Vercel**: todo push na branch `main` publica automaticamente. Detalhes e solução de problemas (inclusive quando a Vercel "perde" um push) em [docs/DEPLOY.md](docs/DEPLOY.md).

> ⚠️ Commits precisam do e-mail de autor autorizado no projeto da Vercel, senão o deploy é bloqueado.

---

## 📄 Licença

Distribuído sob a licença **MIT** — veja [LICENSE](LICENSE). Você pode usar, copiar, modificar e distribuir livremente, inclusive comercialmente, mantendo o aviso de copyright. O software é fornecido "como está", sem garantias.

> Ao copiar este projeto, use a **sua própria** infraestrutura (seu Supabase, suas chaves). Os dados de cada instalação ficam no banco de quem a hospeda — o código é público, os dados não.
