# Histórico do projeto

Linha do tempo da construção do MapeIA e das principais decisões de design. As datas seguem o histórico de commits; a fundação (tabelas base, funil, dashboard, busca no Google, CSV) foi construída antes do primeiro commit versionado e está registrada em `schema.sql` e nas migrations.

---

## Fundação (base do CRM)

O núcleo do produto: organizações multi-tenant com **RLS**, campanhas, leads, histórico automático de atividades (triggers), dashboard, importação/exportação CSV e a primeira origem de busca — **Google Maps** via Apify. O funil inicial tinha 7 etapas fixas.

Evolução registrada nas migrations:
- `migration-tipo-campanha.sql` — campanhas ganham **tipo** (google/instagram/linkedin), abrindo espaço para múltiplas origens.
- `migration-dados-gmn.sql` / `migration-bairro.sql` — campos de Google Meu Negócio e bairro nos leads.
- `migration-status-contato.sql` / `migration-hora-retorno.sql` — status intermediário, data do primeiro contato e horário de retorno.
- `migration-linkedin.sql` — origem **LinkedIn** (cargo, empresa, e-mail, rapport).
- `migration-equipe.sql` / `migration-niveis-acesso.sql` — papéis **admin/member**, `is_admin()`, e acesso granular por campanha (`campaign_access`).

---

## 2026-07-29 · Recuperação a partir do deploy da Vercel
Ponto de partida do versionamento atual: o código em produção foi recuperado e passou a ser mantido neste repositório.

## 2026-07-30 · Cadastro manual de contatos
Além da busca e do CSV, passou a ser possível adicionar leads manualmente dentro de uma campanha (`ManualLeadsModal`).

## 2026-08-04 · Campanhas de e-mail + bairro
- **Campanhas de e-mail** em massa via Resend (`EmailMassaModal` + função serverless `api/enviar-emails.ts`).
- Campo **bairro** nos leads.

## 2026-08-19 · Refino da busca do Instagram — Fase 1
**Problema:** a busca "Dentistas em Brasília" retornava dentistas do Brasil e do mundo, porque a busca de usuário do Instagram não tem filtro geográfico.

**Solução (Fase 1):**
- Nova tabela **`localidades`** (cidade → apelidos, DDDs, bairros), com tela de administração dentro do CRM (só admin) — sem precisar abrir o Supabase.
- **Filtro de localização** por escopo **Cidade** ou **País**, cruzando o **DDD/DDI do telefone** com termos (cidade, apelidos, bairros) na bio/nome. Resolve casos como "Dentista Samambaia" (bairro de Brasília, confirmado pelo DDD 61).

## 2026-08-19 · Busca do Instagram — Fase 2
- **Cruzamento por origem:** além da busca por usuário, descoberta por **hashtag**. Perfis vindos de hashtag da cidade são geograficamente confiáveis e entram mesmo sem a cidade na bio.
- **Método "Local do Instagram":** perfis marcados na página de local da cidade, filtrados por nicho.
- Botão que **sugere hashtags** a partir do nicho + cidade.

## 2026-08-22 · Contagem de "já contatados"
Selo na tela da campanha mostrando quantos leads já foram abordados (qualquer status diferente de *A contatar*), respeitando os filtros ativos.

*(commit "Redispara deploy da Vercel" no mesmo dia: commit vazio para re-acionar a integração da Vercel, que havia perdido um push — ver [DEPLOY.md](DEPLOY.md#quando-a-vercel-perde-um-push).)*

## 2026-08-27 · Correção da contagem de leads nas campanhas
**Problema:** algumas campanhas mostravam total de leads errado ou zerado. A lista baixava todos os leads de todas as campanhas em uma query, limitada a **1000 linhas** pelo PostgREST — passando de 1000 leads no total, as contagens quebravam.

**Solução:** a contagem passou a ser feita **no banco**, pela função `campaign_metrics()` (respeita o RLS do usuário), sem baixar as linhas.

## 2026-09-01 · Novo funil de cadência
Substituição do funil fixo antigo (7 etapas genéricas) por um **funil de cadência de prospecção**:

`A contatar → Dia 1 · Abertura → … → Dia 7 · Breakup → Respondeu → Reunião marcada → Virou cliente 🟢 → Perdido 🔴`

Decisões:
- Após avaliar um funil **editável por campanha** (tabela de estágios dinâmica), optou-se por um **funil fixo** único — mais simples e suficiente para o processo atual.
- Foram criados **papéis semânticos** (`STATUS_INICIAL`, `STATUS_GANHO`, `STATUS_PERDIDO`, `STATUS_NEGOCIACAO`, `STATUS_ENCERRADOS`) para desacoplar métricas, dashboard e "Para contatar" dos nomes das colunas.
- O status especial "Retornar" foi removido; o **agendamento de retorno** virou independente do status (a data de retorno, sozinha, alimenta a página "Para contatar").
- `migration-funil-cadencia.sql` migra os leads existentes para as novas etapas (sem poluir o histórico de atividades) e atualiza `campaign_metrics()`.

---

## Padrões que se firmaram ao longo do projeto

- **Contar no banco, não no cliente:** agregações via função SQL evitam o teto de 1000 linhas do PostgREST.
- **Papéis semânticos > nomes fixos:** recursos que dependem do funil leem o *papel* da etapa, não a string do status.
- **Migrations idempotentes** e `schema.sql` como arquivo canônico, mantido em sincronia.
- **Deploy por push na `main`**; quando a Vercel perde um push, um commit vazio re-aciona o build.
- **Base de localidades editável no CRM**, pensada para começar pequena (Brasília) e crescer por cadastro, sem deploy.
