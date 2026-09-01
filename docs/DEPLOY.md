# Deploy e setup

## Variáveis de ambiente

| Variável | Onde | Para quê |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` local **e** Vercel | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | `.env` local **e** Vercel | Chave pública (anon) do Supabase |
| `RESEND_API_KEY` | Vercel (serverless) | Envio de e-mails via Resend |
| `EMAIL_REMETENTE` | Vercel (serverless) | Remetente das campanhas de e-mail |

> O **token da Apify** não é variável de ambiente — cada usuário informa o próprio na tela de busca (salvo no `localStorage`).

---

## 1. Criar o projeto no Supabase

1. Em [supabase.com](https://supabase.com), crie uma conta e um **New project** (região *South America (São Paulo)* recomendada).
2. Aguarde o projeto ficar pronto.

## 2. Rodar o schema + migrations

No **SQL Editor** do Supabase, rode **na ordem**:

1. `supabase/schema.sql` (base).
2. Cada `supabase/migration-*.sql`, na ordem cronológica listada em [BANCO-DE-DADOS.md](BANCO-DE-DADOS.md#migrations-ordem-e-propósito).

Cada execução deve retornar "Success. No rows returned".

> Para copiar e rodar: abra o arquivo, copie **todo o conteúdo** e cole no SQL Editor. (Colar só o caminho do arquivo dá erro de sintaxe.)

## 3. (Opcional em testes) Desativar confirmação de e-mail

**Authentication → Sign In / Providers → Email** → desative **Confirm email**. Em produção, mantenha ativado e configure a **Site URL** (passo 6).

## 4. Configurar o `.env` local

Em **Project Settings → API**, copie a **Project URL** e a **anon public key**:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

## 5. Rodar localmente

```bash
npm install
npm run dev      # http://localhost:5173
```

No primeiro cadastro, a organização é criada automaticamente e o usuário vira **admin**.

## 6. Publicar na Vercel

1. Suba o projeto para um repositório no GitHub.
2. Em [vercel.com](https://vercel.com) → **Add New → Project** → importe o repositório (a Vercel detecta Vite).
3. Em **Environment Variables**, adicione as quatro variáveis da tabela acima.
4. **Deploy**.
5. Em **Supabase → Authentication → URL Configuration → Site URL**, coloque a URL da Vercel (para os links de e-mail funcionarem).

O `vercel.json` já cuida do roteamento de SPA (todas as rotas caem no `index.html`).

---

## Fluxo de deploy contínuo

Todo **push na branch `main`** dispara um deploy automático na Vercel.

> ⚠️ **Autor do commit:** o e-mail do autor do commit precisa ser um e-mail autorizado no projeto da Vercel; caso contrário o deploy é bloqueado.

### Quando a Vercel "perde" um push
Às vezes a integração não cria o build de um push. Sintoma: o commit está no GitHub, mas a Vercel continua servindo a versão anterior. Soluções:

- **Nudge:** fazer um commit vazio e dar push de novo:
  ```bash
  git commit --allow-empty -m "Redispara deploy da Vercel"
  git push origin main
  ```
- **Manual:** no painel da Vercel → projeto → **Deployments** → **⋯** no commit → **Redeploy**.
- Se o commit nem aparece na lista, verificar **Settings → Git** (reconectar o repositório).

### Mudanças que exigem SQL
Algumas mudanças de código dependem de uma migration no Supabase (ex.: nova função, novo `CHECK` de status). Nesses casos, **rode o SQL antes ou junto do deploy** — senão a tela correspondente pode dar erro no curto intervalo da virada. As migrations que exigem isso estão indicadas no arquivo `.sql` correspondente e no corpo do commit.

---

## Comandos úteis

```bash
npm run dev      # desenvolvimento local
npm run build    # build de produção (tsc -b && vite build) — use para validar antes do deploy
npm run preview  # pré-visualizar o build de produção
```
