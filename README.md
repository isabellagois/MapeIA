# MapeIA 📍

CRM web para gestão de prospecção de clientes de Google Meu Negócio. Importe campanhas de leads em CSV, gerencie o funil de 7 etapas, agende retornos com alertas e exporte resultados.

**Stack:** React + Vite + TypeScript · Tailwind CSS · Supabase (PostgreSQL + Auth) · Vercel

---

## ✅ Passo a passo de setup (15 minutos)

### 1. Criar o projeto no Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta (gratuito).
2. Clique em **New project**, escolha um nome (ex: `crm-prospeccao`), defina uma senha do banco e a região **South America (São Paulo)**.
3. Aguarde 1–2 minutos até o projeto ficar pronto.

### 2. Rodar o schema do banco

1. No painel do Supabase, abra **SQL Editor** (menu lateral).
2. Clique em **New query**.
3. Copie **todo** o conteúdo do arquivo [`supabase/schema.sql`](supabase/schema.sql) e cole no editor.
4. Clique em **Run**. Deve aparecer "Success. No rows returned".

Isso cria as tabelas (`organizations`, `profiles`, `campaigns`, `leads`, `activities`), os triggers de histórico automático e as políticas de Row Level Security — cada organização enxerga apenas os próprios dados.

### 3. (Opcional, recomendado para testes) Desativar confirmação de e-mail

Para testar sem precisar confirmar e-mail:

1. No Supabase, vá em **Authentication → Sign In / Providers → Email**.
2. Desative **Confirm email** e salve.

> Em produção, mantenha a confirmação ativada.

### 4. Configurar variáveis de ambiente

1. No Supabase, vá em **Project Settings → API**.
2. Copie a **Project URL** e a **anon public key**.
3. Na raiz do projeto, copie o arquivo de exemplo e preencha:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

### 5. Rodar localmente

```bash
npm install
npm run dev
```

Abra http://localhost:5173, clique em **Criar conta** e cadastre-se — a organização é criada automaticamente no primeiro cadastro.

---

## 🚀 Deploy na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Acesse [vercel.com](https://vercel.com) → **Add New → Project** → importe o repositório.
3. A Vercel detecta Vite automaticamente. Antes de fazer deploy, em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Clique em **Deploy**.

O arquivo `vercel.json` já está configurado para o roteamento de SPA (todas as rotas caem no `index.html`).

> **Dica:** depois do deploy, adicione a URL da Vercel em **Supabase → Authentication → URL Configuration → Site URL** para que os links de confirmação de e-mail funcionem.

---

## 👥 Adicionando sua sócia (e equipe futura)

O cadastro padrão cria uma **nova** organização. Para alguém entrar na **sua** organização:

1. Descubra o `org_id` da sua organização: no Supabase, **Table Editor → organizations** (copie o `id`).
2. A pessoa deve se cadastrar via API com metadata, ou — mais simples — crie o usuário manualmente:
   - **Authentication → Users → Add user → Create new user** (e-mail + senha).
   - Em **Table Editor → profiles**, edite a linha criada para o usuário e ajuste o `org_id` para o da sua organização e `role` para `member`.

> Se a linha de profile não existir (usuário criado manualmente não dispara metadata de org), insira manualmente: `id` = id do usuário em auth.users, `org_id` = sua org, `email`, `role`.

---

## 📂 Formato do CSV de importação

A primeira linha deve conter os cabeçalhos. Colunas reconhecidas (com mapeamento automático de sinônimos):

| Coluna | Obrigatória | Observação |
|---|---|---|
| `nome_empresa` | ✅ | aceita também `empresa`, `nome`, `title` |
| `telefone` | — | duplicatas são detectadas por este campo |
| `whatsapp` | — | usado no botão "Abrir WhatsApp" |
| `website` | — | |
| `endereco` | — | |
| `cidade` | — | vira filtro automático |
| `nota_gmn` | — | número de 0 a 100 |
| `itens_faltando_gmn` | — | texto livre |
| `argumento_vendas` | — | aparece destacado no painel do lead |
| `prioridade` | — | `Alta`, `Média` ou `Baixa` |

Linhas com telefone já existente na campanha (ou repetido dentro do próprio arquivo) são puladas automaticamente, com aviso no preview.

---

## 🔁 Funil de prospecção

1. **Não contatado** (cinza)
2. **Tentativa — não atendeu** (azul claro)
3. **Contato feito** (verde claro)
4. **Proposta enviada** (amarelo)
5. **Em negociação** (laranja)
6. **Cliente fechado** ✅ (verde escuro)
7. **Sem interesse / Descartado** ❌ (vermelho)

Status especial **"Retornar"**: no painel do lead, use os atalhos `+1d / +3d / +7d / +15d / +30d` ou o seletor de data. Quando a data chega (ou passa), o lead aparece em **Para contatar hoje**, com badge de contagem no menu e ordenação por urgência.

Toda mudança de status e agendamento de retorno é registrada automaticamente no **histórico de atividades** do lead (trigger no banco), com data/hora e usuário.

---

## 🗂 Estrutura do projeto

```
/src
  /components   → Layout, LeadDrawer, CsvImportModal, badges, spinner
  /pages        → Login, Dashboard, Campaigns, CampaignDetail, Retornos
  /hooks        → useAuth (Supabase Auth + perfil)
  /lib          → supabase client, utils (funil, links, datas), csv (parse/export)
  /types        → tipos TypeScript do domínio
/supabase
  schema.sql    → tabelas, triggers, RLS — rodar no SQL Editor
```

## 🛠 Scripts

```bash
npm run dev      # desenvolvimento local
npm run build    # build de produção (com checagem de tipos)
npm run preview  # pré-visualizar o build
```
