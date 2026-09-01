# Integrações

## Apify (busca de leads)

As buscas de leads usam a plataforma **Apify** e rodam **direto no navegador** (`src/lib/apify.ts`). Cada usuário informa o **próprio token** da Apify na tela de busca; ele é salvo apenas no `localStorage` (chave `apify_token`), nunca no banco.

O fluxo genérico (`executarActor`): inicia um *run* do actor via API, faz *polling* a cada 5s até concluir e baixa os itens do dataset. Erros de crédito esgotado são detectados e mostrados de forma amigável (`CreditoApifyError`).

### Google Maps
- **Actor:** `compass~crawler-google-places`
- **Entrada:** termo (nicho) + `locationQuery` (cidade + "Brasil"), idioma pt-BR.
- **Saída:** nome, telefone, site, endereço, bairro, cidade, nota, categoria e nº de avaliações do Google Meu Negócio.

### Instagram
Busca em duas ou três etapas, conforme o método:

**Actors usados**
- `apify~instagram-search-scraper` — encontra perfis por palavra-chave (busca de usuário).
- `apify~instagram-hashtag-scraper` — posts de uma hashtag (extrai o `ownerUsername`).
- `apify~instagram-scraper` — posts marcados em um **local/place**.
- `apify~instagram-profile-scraper` — detalha os perfis (bio, site, seguidores, telefone).

**Métodos de descoberta**
- **Descoberta ampla:** busca por usuário **+** hashtags. Perfis vindos de hashtag são considerados de **origem geográfica confiável** e passam direto pelo filtro; perfis da busca por usuário passam pelo filtro de localização.
- **Local do Instagram:** coleta perfis marcados na página de local da cidade e filtra por nicho (nome/bio/categoria).

**Filtro de localização** (`src/lib/localidades.ts`)

O grande problema da busca de usuário do Instagram é não ter filtro geográfico. Por isso, cada perfil detalhado passa por `perfilPassaFiltro`:

- **Escopo Cidade:** o perfil entra se o **DDD do telefone** bater (ex.: `61` = Brasília) **ou** se algum **termo** (nome da cidade, apelidos ou bairros) aparecer no nome/@usuário/bio/endereço. Isso resolve casos como "Dentista Samambaia" (Samambaia é bairro de Brasília e o DDD confirma).
- **Escopo País:** usa o **DDI do telefone**. Mantém quem é do país alvo ou sem telefone identificável; descarta apenas quem tem DDI de **outro** país. Só interpreta o DDI quando o número está em formato internacional (`+`), para não confundir DDD nacional (ex.: 11) com o `+1` dos EUA.

Os termos de cada cidade (apelidos, DDDs, bairros) vêm da tabela **`localidades`**, gerenciada na tela *Localidades* (admin). Há também um campo livre de bairros/termos extras no formulário de busca, e um botão que **sugere hashtags** a partir do nicho + cidade.

### LinkedIn
- **Actor:** `harvestapi~linkedin-profile-search`
- **Entrada:** cargo/termo + localização (opcional), modo "Full + email search".
- **Saída:** nome, cargo, empresa atual, e-mail (quando encontrado) e um resumo de **rapport** (headline, sobre, formação, competências e experiências anteriores), guardado em `notas`.

---

## Resend (e-mail)

O envio de campanhas de e-mail é feito pela função serverless `api/enviar-emails.ts` (Vercel), que chama o endpoint `/emails/batch` da **Resend** em lotes de 100.

**Variáveis de ambiente (na Vercel):**
- `RESEND_API_KEY` — chave da conta Resend.
- `EMAIL_REMETENTE` — endereço remetente (deve ser de um domínio verificado na Resend).

O front envia `leadIds`, `assunto` e `corpo` com o token da sessão do Supabase no header; a função valida a sessão, busca os e-mails dos leads e dispara.

---

## Base de localidades

A tabela `localidades` (ver [BANCO-DE-DADOS.md](BANCO-DE-DADOS.md)) é o "conhecimento" geográfico do sistema, editável dentro do CRM (sem abrir o Supabase). A ideia é **começar por poucas cidades e ir expandindo**: cada cidade nova é uma linha, cadastrada na tela *Localidades*. O que mais melhora a precisão da busca é preencher **DDDs** e **bairros**.
