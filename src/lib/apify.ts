/**
 * Integração com a Apify para buscar leads no Google Maps
 * (actor compass/crawler-google-places).
 *
 * O token fica salvo no localStorage do navegador — cada usuário usa
 * o próprio token da conta Apify (https://console.apify.com/settings/integrations).
 */

const APIFY_BASE = 'https://api.apify.com/v2'
const ACTOR_ID = 'compass~crawler-google-places'
const ACTOR_IG_SEARCH = 'apify~instagram-search-scraper'
const ACTOR_IG_PROFILE = 'apify~instagram-profile-scraper'
const ACTOR_IG_HASHTAG = 'apify~instagram-hashtag-scraper'
const ACTOR_IG_SCRAPER = 'apify~instagram-scraper'
const ACTOR_LINKEDIN = 'harvestapi~linkedin-profile-search'
const STORAGE_KEY = 'apify_token'

export function obterTokenSalvo(): string {
  return localStorage.getItem(STORAGE_KEY) ?? ''
}

export function salvarToken(token: string) {
  if (token.trim()) localStorage.setItem(STORAGE_KEY, token.trim())
  else localStorage.removeItem(STORAGE_KEY)
}

import type { FiltroLocal } from './localidades'
import { normalizar, perfilPassaFiltro } from './localidades'

export interface BuscaApifyParams {
  token: string
  nicho: string
  cidade: string
  maxResultados: number
  /** Filtro de localização (apenas Instagram). Quando ausente, não filtra. */
  filtroLocal?: FiltroLocal
  /**
   * Método de descoberta no Instagram:
   *  - 'amplo' (padrão): busca por usuário + hashtags, cruzados por origem
   *  - 'local': perfis marcados na página de local (place) da cidade
   */
  metodo?: 'amplo' | 'local'
  /** Hashtags para o método 'amplo' (perfis vindos delas são geograficamente confiáveis) */
  hashtags?: string[]
}

export interface ResultadoApify {
  nome_empresa: string
  telefone: string | null
  whatsapp: string | null
  website: string | null
  endereco: string | null
  bairro: string | null
  cidade: string | null
  nota_gmn: number | null
  link_gmn: string | null
  categoria_gmn: string | null
  total_avaliacoes: number | null
  /** Apenas em buscas do Instagram */
  bio?: string | null
  username?: string
  /** Apenas em buscas do LinkedIn */
  cargo?: string | null
  empresa_atual?: string | null
  email?: string | null
}

export type StatusBusca =
  | { fase: 'iniciando' }
  | { fase: 'rodando'; segundos: number }
  | { fase: 'baixando' }

/** Erro específico de créditos esgotados na conta Apify */
export class CreditoApifyError extends Error {
  constructor() {
    super(
      'Os créditos da sua conta Apify acabaram. A busca não pôde ser concluída. ' +
        'Recarregue em console.apify.com → Billing ou use o token de outra conta.'
    )
    this.name = 'CreditoApifyError'
  }
}

/** Palavras que a Apify usa em erros de cota/crédito esgotado */
function pareceErroDeCredito(texto: string): boolean {
  const t = texto.toLowerCase()
  return (
    t.includes('credit') ||
    t.includes('usage hard limit') ||
    t.includes('monthly usage') ||
    t.includes('payment') ||
    t.includes('exceeded') ||
    t.includes('platform-feature-disabled')
  )
}

/**
 * Inicia o actor, aguarda a conclusão (polling) e retorna os resultados
 * já mapeados para o formato de lead do CRM.
 */
export async function buscarLeadsGoogleMaps(
  params: BuscaApifyParams,
  onStatus: (s: StatusBusca) => void,
  abortSignal?: AbortSignal
): Promise<ResultadoApify[]> {
  const { token, nicho, cidade, maxResultados } = params

  const input = {
    searchStringsArray: [nicho],
    locationQuery: `${cidade}, Brasil`,
    maxCrawledPlacesPerSearch: maxResultados,
    language: 'pt-BR',
    skipClosedPlaces: true,
    scrapePlaceDetailPage: false,
  }

  const itens = await executarActor(ACTOR_ID, input, token, onStatus, abortSignal)

  return itens
    .filter((i) => typeof i.title === 'string' && i.title)
    .map((i) => {
      const fone = (i.phone as string) || (i.phoneUnformatted as string) || null
      return {
        nome_empresa: i.title as string,
        telefone: fone,
        whatsapp: fone,
        website: (i.website as string) || null,
        endereco: (i.address as string) || null,
        bairro: (i.neighborhood as string) || null,
        cidade: (i.city as string) || cidade,
        nota_gmn: typeof i.totalScore === 'number' ? i.totalScore : null,
        link_gmn: (i.url as string) || null,
        categoria_gmn: (i.categoryName as string) || null,
        total_avaliacoes: typeof i.reviewsCount === 'number' ? i.reviewsCount : null,
      }
    })
}

/**
 * Busca leads no Instagram.
 *
 * Etapa 1 — descobrir @usuários (varia conforme o método):
 *   - 'amplo': busca por usuário (filtrada por localização) + hashtags
 *              (perfis vindos de hashtag são geograficamente confiáveis).
 *   - 'local': perfis marcados na página de local (place) da cidade.
 * Etapa 2 — detalhar cada perfil (bio, site, seguidores, telefone…).
 * Etapa 3 — aplicar o filtro de localização apenas nos perfis SEM origem
 *           confiável (os de hashtag/local passam direto).
 */
export async function buscarLeadsInstagram(
  params: BuscaApifyParams,
  onStatus: (s: StatusBusca) => void,
  abortSignal?: AbortSignal
): Promise<ResultadoApify[]> {
  const { token, nicho, cidade, maxResultados, filtroLocal, metodo = 'amplo', hashtags = [] } = params

  // @usuários de origem geograficamente confiável (hashtag/local) — passam
  // direto pelo filtro. E @usuários da busca por usuário — passam pelo filtro.
  const confiaveis = new Set<string>()
  const doUsuario = new Set<string>()

  if (metodo === 'local') {
    // Perfis marcados na página de local da cidade
    const alvo = cidade.trim() || nicho
    const posts = await executarActor(
      ACTOR_IG_SCRAPER,
      { search: alvo, searchType: 'place', resultsType: 'posts', resultsLimit: maxResultados * 2, searchLimit: 1 },
      token,
      onStatus,
      abortSignal
    )
    for (const p of posts) {
      const u = (p.ownerUsername as string) || ''
      if (u) confiaveis.add(u)
    }
  } else {
    // Método amplo: busca por usuário + hashtags
    const termo = cidade.trim() ? `${nicho} ${cidade}` : nicho
    const busca = await executarActor(
      ACTOR_IG_SEARCH,
      { search: termo, searchType: 'user', searchLimit: maxResultados },
      token,
      onStatus,
      abortSignal
    )
    for (const i of busca) {
      const u = (i.username as string) || ''
      if (u) doUsuario.add(u)
    }

    const tags = hashtags.map((h) => h.replace(/^#/, '').trim()).filter(Boolean)
    if (tags.length > 0) {
      const posts = await executarActor(
        ACTOR_IG_HASHTAG,
        { hashtags: tags, resultsLimit: maxResultados },
        token,
        onStatus,
        abortSignal
      )
      for (const p of posts) {
        const u = (p.ownerUsername as string) || ''
        if (u) confiaveis.add(u)
      }
    }
  }

  // Prioriza os confiáveis e completa com os da busca por usuário, até o limite
  const usernames = Array.from(
    new Set([...confiaveis, ...Array.from(doUsuario).filter((u) => !confiaveis.has(u))])
  ).slice(0, maxResultados)

  if (usernames.length === 0) return []

  // Etapa 2 — detalhar os perfis encontrados
  const perfis = await executarActor(
    ACTOR_IG_PROFILE,
    { usernames },
    token,
    onStatus,
    abortSignal
  )

  const mapeados = perfis
    .filter((p) => typeof p.username === 'string' && p.username)
    .map((p) => {
      const fone =
        (p.businessPhoneNumber as string) ||
        (p.publicPhoneNumber as string) ||
        (p.contactPhoneNumber as string) ||
        null
      const bio = (p.biography as string) || ''
      const seguidores = typeof p.followersCount === 'number' ? p.followersCount : null
      // Endereço comercial (contas business) — ajuda o filtro de localização
      const endereco =
        (p.addressStreet as string) ||
        (p.city as string) ||
        (p.businessAddress as string) ||
        null
      return {
        nome_empresa: (p.fullName as string) || (p.username as string),
        telefone: fone,
        whatsapp: fone,
        website: (p.externalUrl as string) || null,
        endereco,
        bairro: null,
        cidade: cidade || null,
        nota_gmn: null,
        link_gmn: `https://www.instagram.com/${p.username as string}/`,
        categoria_gmn: (p.businessCategoryName as string) || null,
        total_avaliacoes: seguidores,
        bio: bio || null,
        username: p.username as string,
      }
    })

  // Método local traz perfis marcados no lugar, mas sem filtrar por nicho.
  // Mantém só os relevantes (nome/bio/categoria batem alguma palavra do nicho).
  let resultado = mapeados
  if (metodo === 'local') {
    const palavras = normalizar(nicho).split(/\s+/).filter((w) => w.length > 2)
    if (palavras.length > 0) {
      resultado = resultado.filter((l) => {
        const txt = normalizar([l.nome_empresa, l.bio, l.categoria_gmn].filter(Boolean).join(' '))
        return palavras.some((w) => txt.includes(w))
      })
    }
  }

  // Filtro de localização: perfis de origem confiável (hashtag/local) passam
  // direto; os da busca por usuário passam pelo cruzamento DDD/DDI + termos.
  if (!filtroLocal) return resultado
  return resultado.filter(
    (l) =>
      (l.username && confiaveis.has(l.username)) ||
      perfilPassaFiltro(
        { telefone: l.telefone, nome: l.nome_empresa, username: l.username, bio: l.bio, endereco: l.endereco },
        filtroLocal
      )
  )
}

/**
 * Busca decisores no LinkedIn (harvestapi/linkedin-profile-search).
 * Retorna perfis completos com cargo, empresa atual e e-mail (quando encontrado),
 * além de resumo/headline para criar rapport.
 */
export async function buscarLeadsLinkedIn(
  params: BuscaApifyParams,
  onStatus: (s: StatusBusca) => void,
  abortSignal?: AbortSignal
): Promise<ResultadoApify[]> {
  const { token, nicho, cidade, maxResultados } = params

  const input: Record<string, unknown> = {
    searchQuery: nicho,
    maxItems: maxResultados,
    profileScraperMode: 'Full + email search',
  }
  if (cidade.trim()) input.locations = [cidade.trim()]

  const itens = await executarActor(ACTOR_LINKEDIN, input, token, onStatus, abortSignal)

  return itens
    .map((p) => {
      const nome =
        [(p.firstName as string) || '', (p.lastName as string) || ''].join(' ').trim() ||
        (p.name as string) ||
        (p.fullName as string) ||
        ''
      if (!nome) return null

      // Experiência atual: cargo + empresa
      const exp = Array.isArray(p.experience) ? (p.experience as Record<string, unknown>[]) : []
      const atual = exp[0] ?? {}
      const posicaoAtual = (p.currentPosition as Record<string, unknown>[] | undefined)?.[0]
      const cargo =
        (posicaoAtual?.position as string) ||
        (atual.position as string) ||
        (atual.title as string) ||
        (p.headline as string) ||
        null
      const empresa =
        (posicaoAtual?.companyName as string) ||
        (atual.companyName as string) ||
        (atual.company as string) ||
        ((p.currentCompany as Record<string, unknown>)?.name as string) ||
        null

      const email =
        (p.email as string) ||
        (Array.isArray(p.emails) ? ((p.emails as string[])[0] ?? null) : null)

      const local =
        ((p.location as Record<string, unknown>)?.linkedinText as string) ||
        (typeof p.location === 'string' ? (p.location as string) : null) ||
        cidade ||
        null

      // Informações de rapport reunidas nas notas
      const partesRapport: string[] = []
      if (p.headline) partesRapport.push(`Headline: ${p.headline as string}`)
      if (p.about) partesRapport.push(`Sobre: ${p.about as string}`)
      const escolas = Array.isArray(p.education)
        ? (p.education as Record<string, unknown>[])
            .map((e) => (e.schoolName as string) || (e.school as string) || '')
            .filter(Boolean)
            .slice(0, 3)
        : []
      if (escolas.length > 0) partesRapport.push(`Formação: ${escolas.join(', ')}`)
      const skills = Array.isArray(p.skills)
        ? (p.skills as Record<string, unknown>[])
            .map((s) => (typeof s === 'string' ? s : (s.name as string) || ''))
            .filter(Boolean)
            .slice(0, 10)
        : []
      if (skills.length > 0) partesRapport.push(`Competências: ${skills.join(', ')}`)
      if (exp.length > 1) {
        const anteriores = exp
          .slice(1, 4)
          .map((e) => {
            const t = (e.position as string) || (e.title as string) || ''
            const c = (e.companyName as string) || (e.company as string) || ''
            return [t, c].filter(Boolean).join(' @ ')
          })
          .filter(Boolean)
        if (anteriores.length > 0) partesRapport.push(`Experiências anteriores: ${anteriores.join(' · ')}`)
      }

      const linkedinUrl =
        (p.linkedinUrl as string) ||
        (p.profileUrl as string) ||
        (p.url as string) ||
        (p.publicIdentifier ? `https://www.linkedin.com/in/${p.publicIdentifier as string}/` : null)

      const fone = (p.phone as string) || (p.mobileNumber as string) || null

      const resultado: ResultadoApify = {
        nome_empresa: nome,
        telefone: fone,
        whatsapp: fone,
        website: null,
        endereco: null,
        bairro: null,
        cidade: local,
        nota_gmn: null,
        link_gmn: linkedinUrl,
        categoria_gmn: null,
        total_avaliacoes: null,
        bio: partesRapport.length > 0 ? partesRapport.join('\n') : null,
        cargo,
        empresa_atual: empresa,
        email: email || null,
      }
      return resultado
    })
    .filter((r): r is ResultadoApify => r !== null)
}

/** Inicia um actor, aguarda concluir (polling) e devolve os itens do dataset */
async function executarActor(
  actorId: string,
  input: Record<string, unknown>,
  token: string,
  onStatus: (s: StatusBusca) => void,
  abortSignal?: AbortSignal
): Promise<Record<string, unknown>[]> {
  onStatus({ fase: 'iniciando' })

  const inicio = await fetch(`${APIFY_BASE}/acts/${actorId}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    signal: abortSignal,
  })
  if (inicio.status === 401) throw new Error('Token da Apify inválido. Confira em console.apify.com → Settings → API & Integrations.')
  if (!inicio.ok) {
    const corpo = await inicio.text().catch(() => '')
    if (inicio.status === 402 || pareceErroDeCredito(corpo)) throw new CreditoApifyError()
    throw new Error(`Falha ao iniciar a busca na Apify (HTTP ${inicio.status}).`)
  }
  const run = (await inicio.json()).data as { id: string; defaultDatasetId: string }

  // Aguarda o run terminar (consultando a cada 5s)
  const t0 = Date.now()
  while (true) {
    await esperar(5000, abortSignal)
    onStatus({ fase: 'rodando', segundos: Math.round((Date.now() - t0) / 1000) })

    const resp = await fetch(`${APIFY_BASE}/actor-runs/${run.id}?token=${token}`, { signal: abortSignal })
    if (!resp.ok) throw new Error(`Falha ao consultar o andamento da busca (HTTP ${resp.status}).`)
    const dados = (await resp.json()).data as { status: string; statusMessage?: string }
    const status = dados.status

    if (status === 'SUCCEEDED') break
    if (['FAILED', 'ABORTED', 'TIMED-OUT'].includes(status)) {
      if (pareceErroDeCredito(dados.statusMessage ?? '')) throw new CreditoApifyError()
      throw new Error(
        `A busca na Apify terminou com status "${status}"` +
          (dados.statusMessage ? ` (${dados.statusMessage})` : '') +
          '. Pode ser falta de créditos na conta — verifique em console.apify.com → Billing.'
      )
    }
  }

  onStatus({ fase: 'baixando' })
  const itensResp = await fetch(
    `${APIFY_BASE}/datasets/${run.defaultDatasetId}/items?token=${token}&format=json&clean=true`,
    { signal: abortSignal }
  )
  if (!itensResp.ok) throw new Error(`Falha ao baixar os resultados (HTTP ${itensResp.status}).`)
  return (await itensResp.json()) as Record<string, unknown>[]
}

function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      reject(new DOMException('Busca cancelada', 'AbortError'))
    })
  })
}
