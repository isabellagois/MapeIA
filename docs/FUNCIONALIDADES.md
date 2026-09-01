# Funcionalidades

## Campanhas

Uma campanha agrupa leads por **origem** (Google Maps, Instagram ou LinkedIn) e **nicho**. A origem é escolhida na criação e **não pode ser alterada** depois (define onde as buscas são feitas).

- **Criar / editar / arquivar** na página *Campanhas*. Arquivadas ficam ocultas por padrão (checkbox "Mostrar arquivadas").
- **Excluir permanentemente** só é possível após arquivar (apaga a campanha e todos os leads).
- Cada card mostra o total de leads e barras de **Contatados / Em negociação / Fechados**, calculadas no banco via `campaign_metrics()`.

## Leads

### Como entram
- **Busca (Apify):** botão *Buscar* na campanha — ver [INTEGRACOES.md](INTEGRACOES.md).
- **Importar CSV:** modal com pré-visualização; pula duplicatas (telefone já existente na campanha ou repetido no arquivo).
- **Adicionar manualmente:** cadastro rápido de um ou vários contatos.

Em qualquer entrada, a **deduplicação** compara telefone e link do perfil (`link_gmn`) contra os leads já existentes na campanha.

### Painel do lead (LeadDrawer)
Clicar em um lead (na tabela ou no card do Kanban) abre um painel lateral com **todas as informações**: dados de contato, endereço, prioridade, status do funil, responsável, data de primeiro contato, agendamento de retorno, notas (inclui bio do Instagram / rapport do LinkedIn) e o **histórico de atividades**.

- Quem mexer primeiro em um lead vira **responsável** automaticamente.
- Botões de retorno rápido (`+1d / +3d / +7d / +15d / +30d`) e seletor de data agendam o retorno — de forma independente do status do funil.

### Visões: Tabela e Kanban
Na campanha há duas visões (a preferência fica salva no navegador):

- **Tabela:** colunas ordenáveis, filtros (status, prioridade, cidade, responsável), busca textual, paginação, seleção em massa e exportação CSV. Mostra também um selo **"X já contatados"** (todos os status diferentes de *A contatar*), que respeita os filtros ativos.
- **Kanban:** uma coluna por etapa do funil; arrastar o card muda o status.

## Funil de cadência

O funil é **fixo** e representa uma cadência de prospecção. As etapas (em `src/lib/utils.ts`):

| # | Etapa | Papel semântico |
|---|---|---|
| 1 | **A contatar** | inicial (todo lead novo entra aqui) |
| 2 | Dia 1 · Abertura | neutro |
| 3 | Dia 2 · Follow | neutro |
| 4 | Dia 3 · Aquecimento | neutro |
| 5 | Dia 4 · Prova | neutro |
| 6 | Dia 5 · Outro canal | neutro |
| 7 | Dia 6 · Reforço | neutro |
| 8 | Dia 7 · Breakup | neutro |
| 9 | Respondeu | neutro |
| 10 | **Reunião marcada** | negociação (conta na métrica "Em negociação") |
| 11 | **Virou cliente** 🟢 | ganho (conversão / "Fechados") |
| 12 | **Perdido** 🔴 | perdido |

Os **papéis semânticos** (`STATUS_INICIAL`, `STATUS_GANHO`, `STATUS_PERDIDO`, `STATUS_NEGOCIACAO`, `STATUS_ENCERRADOS`) desacoplam as métricas dos nomes das colunas — assim as contagens, o dashboard e a página "Para contatar" continuam corretos mesmo que as etapas mudem. Para alterar o funil, edite `STATUS_CONFIG`/constantes em `utils.ts` e o `CHECK` de `status_funil` no banco (ver `migration-funil-cadencia.sql` como referência).

Toda mudança de status é registrada no **histórico de atividades** por um trigger no banco.

## Para contatar (retornos)

Leads com `data_retorno` **vencida** (hoje ou antes) e que **não estejam encerrados** (Virou cliente / Perdido) aparecem em *Para contatar*, ordenados por urgência. O menu lateral mostra um **badge** com a contagem, atualizado quando qualquer tela altera um lead.

## Dashboard

- Distribuição de leads por etapa do funil.
- **Taxa de conversão** (Virou cliente ÷ total).
- **Performance por membro:** atribuídos, fechados, em negociação e atividades nos últimos 30 dias.

## Equipe e permissões

Dois papéis:

- **admin:** vê e controla tudo na organização, gerencia a equipe e edita as Localidades.
- **member:** vê apenas as campanhas que criou e as que lhe foram liberadas.

Fluxo:
- **Convidar:** o admin copia um link de convite (`?convite=<org_id>`); a pessoa se cadastra já dentro da organização como `member`.
- **Acessos por campanha:** o admin libera campanhas específicas a um membro, com nível `leitura` ou `edicao` (`campaign_access`).

## Localidades (admin)

Base de cidades usada para refinar as buscas do Instagram. Cada cidade tem **apelidos** (variações do nome), **DDDs** e **bairros**. Gerenciada na tela *Localidades* (visível só para admin). Detalhes de uso na busca em [INTEGRACOES.md](INTEGRACOES.md).

## Campanhas de e-mail

Na campanha, *Criar campanha de e-mail* abre um modal para escrever assunto e corpo (com variáveis de template) e disparar em massa para os **leads filtrados que têm e-mail**. O envio é feito pela função serverless `api/enviar-emails.ts` via **Resend**, em lotes de 100. Requer `RESEND_API_KEY` e `EMAIL_REMETENTE` configuradas na Vercel.

## Importar / Exportar CSV

- **Importar:** cabeçalho na primeira linha; mapeamento automático de sinônimos de colunas; normalização de prioridade e nota; pré-visualização com contagem de novos × duplicados.
- **Exportar:** gera um CSV dos leads atualmente filtrados na campanha.

### Colunas reconhecidas na importação

| Coluna | Obrigatória | Observação |
|---|---|---|
| `nome_empresa` | ✅ | aceita `empresa`, `nome`, `title` |
| `telefone` | — | usado na deduplicação |
| `whatsapp` | — | botão "Abrir WhatsApp" |
| `website` / `endereco` / `bairro` / `cidade` | — | `cidade` vira filtro |
| `nota_gmn` | — | 0 a 100 |
| `itens_faltando_gmn` / `argumento_vendas` | — | texto livre |
| `prioridade` | — | `Alta`, `Média`, `Baixa` |
