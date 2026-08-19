import { useEffect, useState } from 'react'
import { Search, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  buscarLeadsGoogleMaps,
  buscarLeadsInstagram,
  buscarLeadsLinkedIn,
  obterTokenSalvo,
  salvarToken,
  CreditoApifyError,
  type ResultadoApify,
  type StatusBusca,
} from '../lib/apify'
import { chaveTelefone } from '../lib/utils'
import {
  listarLocalidades,
  normalizar,
  PAISES_DDI,
  sugerirHashtags,
  type FiltroLocal,
  type Localidade,
} from '../lib/localidades'
import type { TipoCampanha } from '../types'
import Spinner from './Spinner'
import { notificarLeadsAtualizados } from './Layout'

interface Props {
  campaignId: string
  orgId: string
  tipo: TipoCampanha
  nichoSugerido?: string | null
  aberto: boolean
  onFechar: () => void
  onImportado: (qtd: number) => void
}

type Etapa = 'formulario' | 'buscando' | 'preview' | 'importando' | 'concluido'

export default function ApifySearchModal({ campaignId, orgId, tipo, nichoSugerido, aberto, onFechar, onImportado }: Props) {
  const ehInstagram = tipo === 'instagram'
  const ehLinkedin = tipo === 'linkedin'
  const [etapa, setEtapa] = useState<Etapa>('formulario')
  const [token, setToken] = useState(obterTokenSalvo())
  const [nicho, setNicho] = useState(nichoSugerido ?? '')
  const [cidade, setCidade] = useState('')
  const [maxResultados, setMaxResultados] = useState(50)
  // Refino de localização (apenas Instagram)
  const [escopo, setEscopo] = useState<'cidade' | 'pais'>('cidade')
  const [localidades, setLocalidades] = useState<Localidade[]>([])
  const [localidadeNome, setLocalidadeNome] = useState('') // '' = digitar manualmente
  const [bairrosExtras, setBairrosExtras] = useState('')
  const [pais, setPais] = useState('Brasil')
  const [metodo, setMetodo] = useState<'amplo' | 'local'>('amplo')
  const [hashtags, setHashtags] = useState('')
  const [statusBusca, setStatusBusca] = useState<StatusBusca | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [erroCredito, setErroCredito] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [novos, setNovos] = useState<ResultadoApify[]>([])
  const [duplicados, setDuplicados] = useState(0)
  const [qtdImportada, setQtdImportada] = useState(0)
  const [abortController, setAbortController] = useState<AbortController | null>(null)

  // Carrega a base de localidades quando o modal do Instagram abre
  useEffect(() => {
    if (!aberto || !ehInstagram) return
    let ativo = true
    listarLocalidades()
      .then((ls) => {
        if (ativo) setLocalidades(ls)
      })
      .catch(() => {
        /* silencioso: sem base, o filtro por cidade fica manual */
      })
    return () => {
      ativo = false
    }
  }, [aberto, ehInstagram])

  /**
   * Monta o termo de busca do Instagram (parte "cidade") e o filtro de
   * localização a partir do escopo/cidade/país escolhidos.
   */
  function montarLocalizacao(): { cidadeBusca: string; filtro?: FiltroLocal } {
    if (!ehInstagram) return { cidadeBusca: cidade.trim() }

    const extras = bairrosExtras
      .split(/[,\n]/)
      .map((t) => t.trim())
      .filter(Boolean)

    if (escopo === 'pais') {
      const ddi = PAISES_DDI.find((p) => p.nome === pais)?.ddi
      return {
        cidadeBusca: pais === 'Brasil' ? '' : pais,
        filtro: ddi ? { escopo: 'pais', termos: [], ddds: [], ddiAlvo: ddi } : undefined,
      }
    }

    // Escopo cidade
    const loc = localidades.find((l) => normalizar(l.nome) === normalizar(localidadeNome))
    if (loc) {
      const termos = Array.from(new Set([loc.nome, ...loc.apelidos, ...loc.bairros, ...extras]))
      return { cidadeBusca: loc.nome, filtro: { escopo: 'cidade', termos, ddds: loc.ddds } }
    }
    // Cidade digitada manualmente (não cadastrada)
    const manual = cidade.trim()
    const termos = Array.from(new Set([manual, ...extras].filter(Boolean)))
    return {
      cidadeBusca: manual,
      filtro: termos.length > 0 ? { escopo: 'cidade', termos, ddds: [] } : undefined,
    }
  }

  function reset() {
    setEtapa('formulario')
    setErro(null)
    setErroCredito(false)
    setAviso(null)
    setNovos([])
    setDuplicados(0)
    setQtdImportada(0)
    setStatusBusca(null)
  }

  function fechar() {
    abortController?.abort()
    reset()
    onFechar()
  }

  async function buscar() {
    if (!token.trim() || !nicho.trim() || (tipo === 'google' && !cidade.trim())) {
      setErro(
        tipo === 'google'
          ? 'Preencha o token da Apify, o nicho e a cidade.'
          : ehLinkedin
            ? 'Preencha o token da Apify e o cargo/termo de busca.'
            : 'Preencha o token da Apify e o nicho.'
      )
      return
    }
    salvarToken(token)
    setErro(null)
    setErroCredito(false)
    setAviso(null)
    setEtapa('buscando')
    const ac = new AbortController()
    setAbortController(ac)

    try {
      const { cidadeBusca, filtro } = montarLocalizacao()
      // Método 'local' só faz sentido por cidade; no escopo país, usa 'amplo'.
      const metodoEfetivo = ehInstagram && escopo === 'cidade' ? metodo : 'amplo'
      const tags = hashtags
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean)
      const parametros = {
        token: token.trim(),
        nicho: nicho.trim(),
        cidade: cidadeBusca,
        maxResultados,
        filtroLocal: filtro,
        metodo: metodoEfetivo,
        hashtags: tags,
      }
      const resultados = ehInstagram
        ? await buscarLeadsInstagram(parametros, setStatusBusca, ac.signal)
        : ehLinkedin
          ? await buscarLeadsLinkedIn(parametros, setStatusBusca, ac.signal)
          : await buscarLeadsGoogleMaps(parametros, setStatusBusca, ac.signal)

      if (resultados.length === 0) {
        setErro(
          ehInstagram
            ? 'A busca não encontrou nenhum perfil na localização escolhida. ' +
                'Tente outro termo, adicionar bairros/termos extras, ou trocar o filtro de localização (cidade/país).'
            : ehLinkedin
              ? 'A busca não encontrou nenhum decisor. Tente outro cargo (ex.: "CEO", "sócio fundador", "gerente comercial") ou escreva a localização por extenso (ex.: "Brasília").'
              : 'A busca não retornou nenhuma empresa. Isso costuma ser a localização escrita num formato que o mapa não entende: ' +
                  'use "Bairro, Cidade" ou só "Cidade", com vírgula e sem sigla do estado (ex.: "Águas Claras, Brasília"). ' +
                  'Evite hífens e siglas como "DF".'
        )
        setEtapa('formulario')
        return
      }

      // Pula leads já existentes na campanha (telefone ou link do perfil)
      const { data: existentes, error } = await supabase
        .from('leads')
        .select('telefone, whatsapp, link_gmn')
        .eq('campaign_id', campaignId)
      if (error) throw error

      const telefones = new Set<string>()
      const links = new Set<string>()
      for (const l of existentes ?? []) {
        const t1 = chaveTelefone(l.telefone)
        const t2 = chaveTelefone(l.whatsapp)
        if (t1) telefones.add(t1)
        if (t2) telefones.add(t2)
        if (l.link_gmn) links.add((l.link_gmn as string).toLowerCase())
      }

      const unicos: ResultadoApify[] = []
      let dups = 0
      const vistos = new Set<string>()
      for (const r of resultados) {
        const d = chaveTelefone(r.telefone)
        const link = r.link_gmn?.toLowerCase() ?? ''
        if (
          (d && (telefones.has(d) || vistos.has(d))) ||
          (link && (links.has(link) || vistos.has(link)))
        ) {
          dups++
          continue
        }
        if (d) vistos.add(d)
        if (link) vistos.add(link)
        unicos.push(r)
      }

      if (resultados.length < maxResultados) {
        setAviso(
          ehInstagram
            ? `Você solicitou ${maxResultados} perfis, mas a busca encontrou apenas ${resultados.length}. ` +
                'Tente variar o termo de busca (ex.: incluir a cidade ou sinônimos do nicho).'
            : ehLinkedin
              ? `Você solicitou ${maxResultados} decisores, mas a busca encontrou apenas ${resultados.length}. ` +
                  'Tente variar o cargo (ex.: "diretor", "sócio", "founder") ou ampliar a localização.'
              : `Você solicitou ${maxResultados} empresas, mas a busca encontrou apenas ${resultados.length}. ` +
                  'Provavelmente não existem mais empresas para esse termo nessa região. ' +
                  'Tente variar o termo de busca ou buscar por bairros/cidades vizinhas.'
        )
      }

      setNovos(unicos)
      setDuplicados(dups)
      setEtapa('preview')
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
      if (e instanceof CreditoApifyError) setErroCredito(true)
      setErro(e instanceof Error ? e.message : 'Erro inesperado na busca. Tente novamente.')
      setEtapa('formulario')
    }
  }

  async function confirmarImportacao() {
    setEtapa('importando')
    setErro(null)
    const TAMANHO_LOTE = 200
    try {
      let inseridos = 0
      for (let i = 0; i < novos.length; i += TAMANHO_LOTE) {
        const lote = novos.slice(i, i + TAMANHO_LOTE).map((l) => ({
          campaign_id: campaignId,
          org_id: orgId,
          nome_empresa: l.nome_empresa,
          telefone: l.telefone,
          whatsapp: l.whatsapp,
          website: l.website,
          endereco: l.endereco,
          bairro: l.bairro,
          cidade: l.cidade,
          nota_gmn: l.nota_gmn,
          link_gmn: l.link_gmn,
          categoria_gmn: l.categoria_gmn,
          total_avaliacoes: l.total_avaliacoes,
          cargo: l.cargo ?? null,
          empresa_atual: l.empresa_atual ?? null,
          email: l.email ?? null,
          notas: l.bio ? (ehLinkedin ? l.bio : `Bio do Instagram: ${l.bio}`) : null,
        }))
        const { error } = await supabase.from('leads').insert(lote)
        if (error) throw error
        inseridos += lote.length
      }
      setQtdImportada(inseridos)
      setEtapa('concluido')
      notificarLeadsAtualizados()
      onImportado(inseridos)
    } catch (e) {
      const detalhe = e instanceof Error ? e.message : String(e)
      console.error('Falha ao salvar os leads:', e)
      setErro(`Erro ao salvar os leads: ${detalhe}`)
      setEtapa('preview')
    }
  }

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={fechar} />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">
            {ehInstagram
              ? 'Buscar leads no Instagram (Apify)'
              : ehLinkedin
                ? 'Buscar decisores no LinkedIn (Apify)'
                : 'Buscar leads no Google Maps (Apify)'}
          </h2>
          <button onClick={fechar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {erro && erroCredito && (
            <div className="mb-4 rounded-lg border-2 border-red-400 bg-red-50 px-4 py-3">
              <p className="text-sm font-bold text-red-800">⚠️ Créditos da Apify esgotados</p>
              <p className="mt-1 text-sm text-red-700">
                A busca não foi concluída porque os créditos desta conta Apify acabaram.{' '}
                <a
                  href="https://console.apify.com/billing"
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold underline"
                >
                  Recarregue em console.apify.com → Billing
                </a>{' '}
                ou troque o token por um de outra conta e busque novamente.
              </p>
            </div>
          )}
          {erro && !erroCredito && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erro}
            </div>
          )}
          {aviso && etapa === 'preview' && (
            <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <span className="font-semibold">Busca incompleta:</span> {aviso}
            </div>
          )}

          {etapa === 'formulario' && (
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Token da API Apify</label>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="input"
                  placeholder="apify_api_..."
                />
                <p className="mt-1 text-xs text-gray-400">
                  Encontre em{' '}
                  <a
                    href="https://console.apify.com/settings/integrations"
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-600 hover:underline"
                  >
                    console.apify.com → Settings → API &amp; Integrations
                  </a>
                  . Fica salvo apenas neste navegador.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {ehLinkedin ? 'Cargo / termo de busca' : 'Nicho / termo de busca'}
                  </label>
                  <input
                    value={nicho}
                    onChange={(e) => setNicho(e.target.value)}
                    className="input"
                    placeholder={ehLinkedin ? 'CEO, sócio fundador, diretor comercial' : 'móveis planejados'}
                  />
                  {ehLinkedin && (
                    <p className="mt-1 text-xs text-gray-400">
                      Busque pelo cargo do decisor; pode combinar com o ramo (ex.: "CEO clínica estética").
                    </p>
                  )}
                </div>
                {!ehInstagram && (
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      {ehLinkedin ? 'Localização' : 'Cidade'}{' '}
                      {ehLinkedin && <span className="font-normal text-gray-400">(opcional)</span>}
                    </label>
                    <input
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      className="input"
                      placeholder={ehLinkedin ? 'Brasília' : 'Águas Claras, Brasília'}
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      {ehLinkedin
                        ? 'Filtro de localização do LinkedIn — escreva por extenso (ex.: "Brasília", "São Paulo").'
                        : 'Formato: "Bairro, Cidade" ou só "Cidade" — sem hífen e sem sigla do estado.'}
                    </p>
                  </div>
                )}
              </div>

              {ehInstagram && (
                <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <div>
                    <span className="mb-1.5 block text-sm font-medium text-gray-700">Filtrar por localização</span>
                    <div className="flex gap-2">
                      {(['cidade', 'pais'] as const).map((op) => (
                        <button
                          key={op}
                          type="button"
                          onClick={() => setEscopo(op)}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                            escopo === op
                              ? 'border-brand-600 bg-brand-50 text-brand-700'
                              : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100'
                          }`}
                        >
                          {op === 'cidade' ? 'Por cidade' : 'Por país'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {escopo === 'cidade' ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">Cidade</label>
                        <select
                          value={localidadeNome}
                          onChange={(e) => setLocalidadeNome(e.target.value)}
                          className="input"
                        >
                          <option value="">Digitar manualmente…</option>
                          {localidades.map((l) => (
                            <option key={l.id} value={l.nome}>
                              {l.nome}
                              {l.uf ? ` - ${l.uf}` : ''}
                            </option>
                          ))}
                        </select>
                        {localidadeNome === '' && (
                          <input
                            value={cidade}
                            onChange={(e) => setCidade(e.target.value)}
                            className="input mt-2"
                            placeholder="Brasília"
                          />
                        )}
                        <p className="mt-1 text-xs text-gray-400">
                          Cidades cadastradas já reconhecem bairros e DDD automaticamente.
                        </p>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-gray-700">
                          Bairros / termos extras <span className="font-normal text-gray-400">(opcional)</span>
                        </label>
                        <input
                          value={bairrosExtras}
                          onChange={(e) => setBairrosExtras(e.target.value)}
                          className="input"
                          placeholder="Sudoeste, Lago Sul"
                        />
                        <p className="mt-1 text-xs text-gray-400">
                          Somados aos bairros já cadastrados. Separe por vírgula.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">País</label>
                      <select value={pais} onChange={(e) => setPais(e.target.value)} className="input">
                        {PAISES_DDI.map((p) => (
                          <option key={p.nome} value={p.nome}>
                            {p.nome}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-gray-400">
                        Mantém perfis cujo telefone é do país (ou sem telefone identificável) e descarta os de outro país.
                      </p>
                    </div>
                  )}

                  {escopo === 'cidade' && (
                    <div>
                      <span className="mb-1.5 block text-sm font-medium text-gray-700">Método de busca</span>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ['amplo', 'Descoberta ampla'],
                            ['local', 'Local do Instagram'],
                          ] as const
                        ).map(([op, rotulo]) => (
                          <button
                            key={op}
                            type="button"
                            onClick={() => setMetodo(op)}
                            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                              metodo === op
                                ? 'border-brand-600 bg-brand-50 text-brand-700'
                                : 'border-gray-200 bg-white text-gray-500 hover:bg-gray-100'
                            }`}
                          >
                            {rotulo}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-gray-400">
                        {metodo === 'amplo'
                          ? 'Busca por usuário + hashtags. Bom para volume.'
                          : 'Perfis marcados na página de local da cidade. Mais preciso na geografia, mas consome mais créditos.'}
                      </p>
                    </div>
                  )}

                  {(escopo === 'pais' || metodo === 'amplo') && (
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <label className="block text-sm font-medium text-gray-700">
                          Hashtags <span className="font-normal text-gray-400">(opcional)</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            const cid = escopo === 'pais' ? pais : localidadeNome || cidade
                            const sug = sugerirHashtags(nicho, cid)
                            if (sug.length) setHashtags(sug.join(', '))
                          }}
                          className="text-xs font-medium text-brand-600 hover:underline"
                        >
                          Sugerir
                        </button>
                      </div>
                      <input
                        value={hashtags}
                        onChange={(e) => setHashtags(e.target.value)}
                        className="input"
                        placeholder="dentistabrasilia, odontobrasilia"
                      />
                      <p className="mt-1 text-xs text-gray-400">
                        Perfis que usam essas hashtags entram mesmo sem a cidade na bio. Separe por vírgula.
                      </p>
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Máximo de {ehInstagram ? 'perfis' : ehLinkedin ? 'decisores' : 'empresas'}:{' '}
                  <span className="font-bold">{maxResultados}</span>
                </label>
                <input
                  type="range"
                  min={10}
                  max={ehInstagram || ehLinkedin ? 100 : 200}
                  step={10}
                  value={maxResultados}
                  onChange={(e) => setMaxResultados(Number(e.target.value))}
                  className="w-full"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Quanto mais {ehInstagram ? 'perfis' : ehLinkedin ? 'decisores' : 'empresas'}, mais tempo a busca leva e
                  mais créditos da Apify consome.
                  {ehLinkedin && ' A busca com e-mail custa cerca de US$ 0,01 por decisor.'}
                </p>
              </div>
            </div>
          )}

          {etapa === 'buscando' && (
            <div className="py-10 text-center">
              <Spinner
                texto={
                  statusBusca?.fase === 'rodando'
                    ? `Buscando ${
                        ehInstagram
                          ? 'perfis no Instagram'
                          : ehLinkedin
                            ? 'decisores no LinkedIn'
                            : 'empresas no Google Maps'
                      }… ${statusBusca.segundos}s`
                    : statusBusca?.fase === 'baixando'
                      ? 'Baixando resultados…'
                      : 'Iniciando a busca…'
                }
              />
              <p className="mt-3 text-xs text-gray-400">
                Buscas maiores podem levar alguns minutos. Não feche esta janela.
              </p>
            </div>
          )}

          {etapa === 'preview' && (
            <div>
              <div className="mb-4 grid grid-cols-2 gap-3">
                <ResumoCard valor={novos.length} rotulo="novos leads encontrados" cor="text-green-700" />
                <ResumoCard valor={duplicados} rotulo="duplicatas (serão puladas)" cor="text-amber-600" />
              </div>
              <p className="mb-2 text-sm font-medium text-gray-700">Pré-visualização (primeiros 10)</p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2">{ehInstagram ? 'Perfil' : ehLinkedin ? 'Nome' : 'Empresa'}</th>
                      {ehInstagram ? (
                        <>
                          <th className="px-3 py-2">@usuário</th>
                          <th className="px-3 py-2">Seguidores</th>
                          <th className="px-3 py-2">Site</th>
                        </>
                      ) : ehLinkedin ? (
                        <>
                          <th className="px-3 py-2">Cargo</th>
                          <th className="px-3 py-2">Empresa</th>
                          <th className="px-3 py-2">E-mail</th>
                        </>
                      ) : (
                        <>
                          <th className="px-3 py-2">Telefone</th>
                          <th className="px-3 py-2">Cidade</th>
                          <th className="px-3 py-2">Nota</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {novos.slice(0, 10).map((l, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="max-w-52 truncate px-3 py-2 font-medium text-gray-800">{l.nome_empresa}</td>
                        {ehInstagram ? (
                          <>
                            <td className="px-3 py-2 text-gray-600">{l.username ? `@${l.username}` : '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{l.total_avaliacoes ?? '—'}</td>
                            <td className="max-w-40 truncate px-3 py-2 text-gray-600">{l.website || '—'}</td>
                          </>
                        ) : ehLinkedin ? (
                          <>
                            <td className="max-w-44 truncate px-3 py-2 text-gray-600">{l.cargo || '—'}</td>
                            <td className="max-w-40 truncate px-3 py-2 text-gray-600">{l.empresa_atual || '—'}</td>
                            <td className="max-w-44 truncate px-3 py-2 text-gray-600">{l.email || '—'}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-3 py-2 text-gray-600">{l.telefone || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{l.cidade || '—'}</td>
                            <td className="px-3 py-2 text-gray-600">{l.nota_gmn ?? '—'}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {etapa === 'importando' && (
            <div className="py-10 text-center">
              <Spinner texto="Salvando leads na campanha…" />
            </div>
          )}

          {etapa === 'concluido' && (
            <div className="py-8 text-center">
              <p className="text-2xl">🎉</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {qtdImportada} leads adicionados à campanha
              </p>
              {duplicados > 0 && (
                <p className="mt-1 text-sm text-gray-500">
                  {duplicados} duplicatas foram puladas (telefone já existente).
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          {etapa === 'formulario' && (
            <>
              <button onClick={fechar} className="btn-secondary">Cancelar</button>
              <button onClick={buscar} className="btn-primary">
                <Search size={16} /> {ehInstagram ? 'Buscar perfis' : ehLinkedin ? 'Buscar decisores' : 'Buscar empresas'}
              </button>
            </>
          )}
          {etapa === 'buscando' && (
            <button onClick={fechar} className="btn-secondary">Cancelar busca</button>
          )}
          {etapa === 'preview' && (
            <>
              <button onClick={reset} className="btn-secondary">Nova busca</button>
              <button onClick={confirmarImportacao} disabled={novos.length === 0} className="btn-primary">
                <Upload size={16} /> Adicionar à campanha ({novos.length})
              </button>
            </>
          )}
          {etapa === 'concluido' && (
            <button onClick={fechar} className="btn-secondary">Concluir</button>
          )}
        </div>
      </div>
    </div>
  )
}

function ResumoCard({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3 text-center">
      <p className={`text-2xl font-bold ${cor}`}>{valor}</p>
      <p className="text-xs text-gray-500">{rotulo}</p>
    </div>
  )
}
