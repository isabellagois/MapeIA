import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Columns3,
  Download,
  List,
  Mail,
  MessageCircle,
  Plus,
  Search,
  Trash2,
  Upload,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { nomeMembro, useEquipe } from '../hooks/useEquipe'
import type { Campaign, Lead, NivelAcesso, Prioridade, StatusFunil } from '../types'
import {
  STATUS_CONFIG,
  STATUS_LIST,
  formatarData,
  linkWhatsApp,
  retornoVencido,
  somarDias,
} from '../lib/utils'
import { notificarLeadsAtualizados } from '../components/Layout'
import { baixarCsv, gerarCsvExport } from '../lib/csv'
import StatusBadge from '../components/StatusBadge'
import PrioridadeBadge from '../components/PrioridadeBadge'
import Spinner from '../components/Spinner'
import CsvImportModal from '../components/CsvImportModal'
import ManualLeadsModal from '../components/ManualLeadsModal'
import ApifySearchModal from '../components/ApifySearchModal'
import EmailMassaModal from '../components/EmailMassaModal'
import LeadDrawer from '../components/LeadDrawer'

const POR_PAGINA = 50

type ColunaOrdenavel = 'nome_empresa' | 'cidade' | 'prioridade' | 'status_funil' | 'data_retorno' | 'nota_gmn'

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>()
  const { profile } = useAuth()
  const { membros } = useEquipe()
  const [campanha, setCampanha] = useState<Campaign | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState<StatusFunil | ''>('')
  const [filtroPrioridade, setFiltroPrioridade] = useState<Prioridade | ''>('')
  const [filtroCidade, setFiltroCidade] = useState('')
  const [filtroResponsavel, setFiltroResponsavel] = useState('')
  const [busca, setBusca] = useState('')

  // Ordenação e paginação
  const [ordenarPor, setOrdenarPor] = useState<ColunaOrdenavel>('nome_empresa')
  const [ordemAsc, setOrdemAsc] = useState(true)
  const [pagina, setPagina] = useState(1)

  // Nível de acesso do usuário a esta campanha (admin/criador = edição)
  const [nivelConcedido, setNivelConcedido] = useState<NivelAcesso | null>(null)

  // Seleção para exclusão em lote
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [excluindo, setExcluindo] = useState(false)

  // Visão: tabela ou kanban
  const [visao, setVisao] = useState<'tabela' | 'kanban'>(
    () => (localStorage.getItem('visao_leads') as 'tabela' | 'kanban') || 'tabela'
  )
  const [arrastando, setArrastando] = useState<string | null>(null)

  // Modais
  const [importAberto, setImportAberto] = useState(false)
  const [manualAberto, setManualAberto] = useState(false)
  const [buscaAberta, setBuscaAberta] = useState(false)
  const [emailAberto, setEmailAberto] = useState(false)
  const [leadAberto, setLeadAberto] = useState<Lead | null>(null)

  const carregar = useCallback(async () => {
    if (!id) return
    setCarregando(true)
    setErro(null)
    try {
      const [campRes, leadsRes] = await Promise.all([
        supabase.from('campaigns').select('*').eq('id', id).single(),
        carregarTodosLeads(id),
      ])
      if (campRes.error) throw campRes.error
      setCampanha(campRes.data as Campaign)
      setLeads(leadsRes)
    } catch {
      setErro('Não foi possível carregar a campanha. Recarregue a página.')
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Define o nível de acesso: admin e criador editam; demais dependem da concessão
  useEffect(() => {
    if (!campanha || !profile) return
    if (profile.role === 'admin' || campanha.created_by === profile.id) {
      setNivelConcedido('edicao')
      return
    }
    supabase
      .from('campaign_access')
      .select('nivel')
      .eq('campaign_id', campanha.id)
      .eq('profile_id', profile.id)
      .maybeSingle()
      .then(({ data }) => setNivelConcedido((data?.nivel as NivelAcesso) ?? null))
  }, [campanha, profile])

  const podeEditar = nivelConcedido === 'edicao'

  // Cidades únicas para o filtro
  const cidades = useMemo(
    () =>
      Array.from(new Set(leads.map((l) => l.cidade).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b, 'pt-BR')
      ),
    [leads]
  )

  // Aplica filtros + ordenação no cliente (rápido até dezenas de milhares de leads)
  const filtrados = useMemo(() => {
    let lista = leads
    if (filtroStatus) lista = lista.filter((l) => l.status_funil === filtroStatus)
    if (filtroPrioridade) lista = lista.filter((l) => l.prioridade === filtroPrioridade)
    if (filtroCidade) lista = lista.filter((l) => l.cidade === filtroCidade)
    if (filtroResponsavel === 'sem') lista = lista.filter((l) => !l.responsavel_id)
    else if (filtroResponsavel) lista = lista.filter((l) => l.responsavel_id === filtroResponsavel)
    if (busca.trim()) {
      const q = busca.trim().toLowerCase()
      lista = lista.filter(
        (l) =>
          l.nome_empresa.toLowerCase().includes(q) ||
          (l.telefone ?? '').toLowerCase().includes(q) ||
          (l.whatsapp ?? '').toLowerCase().includes(q) ||
          (l.cidade ?? '').toLowerCase().includes(q) ||
          (l.notas ?? '').toLowerCase().includes(q)
      )
    }

    const prioridadeOrdem: Record<string, number> = { Alta: 0, 'Média': 1, Baixa: 2 }
    const dir = ordemAsc ? 1 : -1
    return [...lista].sort((a, b) => {
      let cmp = 0
      switch (ordenarPor) {
        case 'nome_empresa':
          cmp = a.nome_empresa.localeCompare(b.nome_empresa, 'pt-BR')
          break
        case 'cidade':
          cmp = (a.cidade ?? '').localeCompare(b.cidade ?? '', 'pt-BR')
          break
        case 'prioridade':
          cmp = (prioridadeOrdem[a.prioridade ?? ''] ?? 9) - (prioridadeOrdem[b.prioridade ?? ''] ?? 9)
          break
        case 'status_funil':
          cmp = STATUS_CONFIG[a.status_funil].ordem - STATUS_CONFIG[b.status_funil].ordem
          break
        case 'data_retorno':
          cmp = (a.data_retorno ?? '9999').localeCompare(b.data_retorno ?? '9999')
          break
        case 'nota_gmn':
          cmp = (a.nota_gmn ?? -1) - (b.nota_gmn ?? -1)
          break
      }
      return cmp * dir
    })
  }, [leads, filtroStatus, filtroPrioridade, filtroCidade, busca, ordenarPor, ordemAsc])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)

  useEffect(() => {
    setPagina(1)
  }, [filtroStatus, filtroPrioridade, filtroCidade, filtroResponsavel, busca])

  function alternarOrdenacao(col: ColunaOrdenavel) {
    if (ordenarPor === col) setOrdemAsc(!ordemAsc)
    else {
      setOrdenarPor(col)
      setOrdemAsc(true)
    }
  }

  async function exportar() {
    if (!campanha) return
    setExportando(true)
    try {
      // Busca a última atividade de cada lead
      const { data: atvs } = await supabase
        .from('activities')
        .select('lead_id, created_at')
        .in('lead_id', leads.map((l) => l.id).slice(0, 1000))
        .order('created_at', { ascending: false })

      const ultimaAtividade: Record<string, string> = {}
      for (const a of atvs ?? []) {
        if (!ultimaAtividade[a.lead_id]) ultimaAtividade[a.lead_id] = a.created_at
      }

      const rows = filtrados.map((l) => ({
        nome_empresa: l.nome_empresa,
        telefone: l.telefone ?? '',
        whatsapp: l.whatsapp ?? '',
        website: l.website ?? '',
        endereco: l.endereco ?? '',
        cidade: l.cidade ?? '',
        nota_gmn: l.nota_gmn ?? '',
        itens_faltando_gmn: l.itens_faltando_gmn ?? '',
        argumento_vendas: l.argumento_vendas ?? '',
        prioridade: l.prioridade ?? '',
        status: STATUS_CONFIG[l.status_funil].label,
        data_retorno: l.data_retorno ?? '',
        notas: l.notas ?? '',
        ultima_atividade: ultimaAtividade[l.id]
          ? new Date(ultimaAtividade[l.id]).toLocaleString('pt-BR')
          : '',
      }))
      const nomeArquivo = `${campanha.name.replace(/[^\w\d-]+/g, '_')}_export.csv`
      baixarCsv(nomeArquivo, gerarCsvExport(rows))
    } finally {
      setExportando(false)
    }
  }

  function alternarSelecao(id: string) {
    setSelecionados((prev) => {
      const novo = new Set(prev)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })
  }

  function alternarSelecaoPagina() {
    const idsPagina = visiveis.map((l) => l.id)
    const todosMarcados = idsPagina.every((id) => selecionados.has(id))
    setSelecionados((prev) => {
      const novo = new Set(prev)
      for (const id of idsPagina) {
        if (todosMarcados) novo.delete(id)
        else novo.add(id)
      }
      return novo
    })
  }

  async function excluirSelecionados() {
    const ids = Array.from(selecionados)
    if (ids.length === 0) return
    const ok = window.confirm(
      `Excluir ${ids.length} ${ids.length === 1 ? 'lead' : 'leads'} desta campanha?\n\nO histórico de atividades deles também será apagado. Essa ação não pode ser desfeita.`
    )
    if (!ok) return
    setExcluindo(true)
    setErro(null)
    try {
      // Exclui em lotes de 100 para não estourar o limite da URL
      for (let i = 0; i < ids.length; i += 100) {
        const { error } = await supabase.from('leads').delete().in('id', ids.slice(i, i + 100))
        if (error) throw error
      }
      setLeads((prev) => prev.filter((l) => !selecionados.has(l.id)))
      setSelecionados(new Set())
    } catch {
      setErro('Não foi possível excluir os leads selecionados. Tente novamente.')
    } finally {
      setExcluindo(false)
    }
  }

  function mudarVisao(v: 'tabela' | 'kanban') {
    setVisao(v)
    localStorage.setItem('visao_leads', v)
  }

  async function moverLead(leadId: string, novoStatus: StatusFunil) {
    const lead = leads.find((l) => l.id === leadId)
    if (!lead || lead.status_funil === novoStatus) return
    const payload: Partial<Lead> = { status_funil: novoStatus }
    // Mover para "retornar" sem data agendada ganha um padrão de +3 dias
    if (novoStatus === 'retornar' && !lead.data_retorno) payload.data_retorno = somarDias(3)
    const { data, error } = await supabase
      .from('leads')
      .update(payload)
      .eq('id', leadId)
      .select()
      .single()
    if (error) {
      setErro('Não foi possível mover o lead. Tente novamente.')
    } else {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? (data as Lead) : l)))
      notificarLeadsAtualizados()
    }
  }

  function aoExcluirLead(leadId: string) {
    setLeads((prev) => prev.filter((l) => l.id !== leadId))
    setSelecionados((prev) => {
      const novo = new Set(prev)
      novo.delete(leadId)
      return novo
    })
    setLeadAberto(null)
  }

  function aoAtualizarLead(atualizado: Lead) {
    setLeads((prev) => prev.map((l) => (l.id === atualizado.id ? atualizado : l)))
    setLeadAberto(atualizado)
  }

  if (carregando)
    return (
      <div className="flex justify-center py-20">
        <Spinner texto="Carregando leads…" />
      </div>
    )
  if (erro || !campanha) return <p className="text-sm text-red-600">{erro ?? 'Campanha não encontrada.'}</p>

  return (
    <div>
      <Link to="/campanhas" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-brand-600">
        <ArrowLeft size={15} /> Campanhas
      </Link>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{campanha.name}</h1>
          {campanha.niche && <p className="text-sm text-gray-400">{campanha.niche}</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={exportar} disabled={exportando || leads.length === 0} className="btn-secondary">
            {exportando ? <Spinner /> : <Download size={16} />} Exportar CSV
          </button>
          {podeEditar && (
            <>
              <button
                onClick={() => setEmailAberto(true)}
                disabled={leads.length === 0}
                className="btn-primary"
                title="Criar uma campanha de e-mail para os leads filtrados"
              >
                <Mail size={16} /> Criar campanha de e-mail
              </button>
              <button onClick={() => setManualAberto(true)} className="btn-secondary">
                <Plus size={16} /> Adicionar manualmente
              </button>
              <button onClick={() => setImportAberto(true)} className="btn-primary">
                <Upload size={16} /> Importar CSV
              </button>
              <button onClick={() => setBuscaAberta(true)} className="btn-primary">
                <Search size={16} /> Buscar{' '}
                {campanha.tipo === 'linkedin'
                  ? 'decisores (LinkedIn)'
                  : campanha.tipo === 'instagram'
                    ? 'leads (Instagram)'
                    : 'leads (Google)'}
              </button>
            </>
          )}
          {!podeEditar && nivelConcedido === 'leitura' && (
            <span className="rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500">
              Acesso somente leitura
            </span>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="relative min-w-48 flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, telefone, cidade ou notas…"
            className="input pl-9"
          />
        </div>
        <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value as StatusFunil | '')} className="input max-w-52">
          <option value="">Todos os status</option>
          {STATUS_LIST.map((s) => (
            <option key={s} value={s}>
              {STATUS_CONFIG[s].label}
            </option>
          ))}
        </select>
        <select
          value={filtroPrioridade}
          onChange={(e) => setFiltroPrioridade(e.target.value as Prioridade | '')}
          className="input max-w-44"
        >
          <option value="">Todas prioridades</option>
          <option value="Alta">Alta</option>
          <option value="Média">Média</option>
          <option value="Baixa">Baixa</option>
        </select>
        <select value={filtroCidade} onChange={(e) => setFiltroCidade(e.target.value)} className="input max-w-44">
          <option value="">Todas cidades</option>
          {cidades.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filtroResponsavel}
          onChange={(e) => setFiltroResponsavel(e.target.value)}
          className="input max-w-48"
        >
          <option value="">Todos responsáveis</option>
          <option value="sem">Sem responsável</option>
          {membros.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name || m.email}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">
            {filtrados.length} {filtrados.length === 1 ? 'lead' : 'leads'}
            {filtrados.length !== leads.length && ` (de ${leads.length})`}
          </p>
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            <button
              onClick={() => mudarVisao('tabela')}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                visao === 'tabela' ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Visão em tabela"
            >
              <List size={13} /> Tabela
            </button>
            <button
              onClick={() => mudarVisao('kanban')}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${
                visao === 'kanban' ? 'bg-brand-600 text-white' : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Visão kanban"
            >
              <Columns3 size={13} /> Kanban
            </button>
          </div>
        </div>
        {podeEditar && selecionados.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5">
            <span className="text-sm font-medium text-red-700">
              {selecionados.size} {selecionados.size === 1 ? 'selecionado' : 'selecionados'}
            </span>
            <button
              onClick={excluirSelecionados}
              disabled={excluindo}
              className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              {excluindo ? <Spinner /> : <Trash2 size={14} />} Excluir
            </button>
            <button
              onClick={() => setSelecionados(new Set())}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Limpar seleção
            </button>
          </div>
        )}
      </div>

      {/* Tabela */}
      {visao === 'tabela' && (
      <>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              {podeEditar && (
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={visiveis.length > 0 && visiveis.every((l) => selecionados.has(l.id))}
                    onChange={alternarSelecaoPagina}
                    className="rounded border-gray-300"
                    title="Selecionar todos da página"
                  />
                </th>
              )}
              <Th col="nome_empresa" atual={ordenarPor} asc={ordemAsc} onClick={alternarOrdenacao}>
                Nome
              </Th>
              <th className="px-3 py-2.5">Telefone</th>
              <th className="px-3 py-2.5">WhatsApp</th>
              <Th col="cidade" atual={ordenarPor} asc={ordemAsc} onClick={alternarOrdenacao}>
                Cidade
              </Th>
              <Th col="nota_gmn" atual={ordenarPor} asc={ordemAsc} onClick={alternarOrdenacao}>
                Nota
              </Th>
              <Th col="prioridade" atual={ordenarPor} asc={ordemAsc} onClick={alternarOrdenacao}>
                Prioridade
              </Th>
              <Th col="status_funil" atual={ordenarPor} asc={ordemAsc} onClick={alternarOrdenacao}>
                Status
              </Th>
              <th className="px-3 py-2.5">Responsável</th>
              <Th col="data_retorno" atual={ordenarPor} asc={ordemAsc} onClick={alternarOrdenacao}>
                Retorno
              </Th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={podeEditar ? 10 : 9} className="px-4 py-10 text-center text-gray-400">
                  {leads.length === 0
                    ? 'Nenhum lead ainda. Use "Adicionar manualmente", "Importar CSV" ou a busca para montar sua lista.'
                    : 'Nenhum lead corresponde aos filtros.'}
                </td>
              </tr>
            ) : (
              visiveis.map((l) => {
                const wa = linkWhatsApp(l.whatsapp || l.telefone)
                const vencido = retornoVencido(l.data_retorno)
                return (
                  <tr
                    key={l.id}
                    onClick={() => setLeadAberto(l)}
                    className="cursor-pointer border-b border-gray-100 transition last:border-0 hover:bg-brand-50/40"
                  >
                    {podeEditar && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selecionados.has(l.id)}
                          onChange={() => alternarSelecao(l.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                    )}
                    <td className="max-w-56 truncate px-3 py-2.5 font-medium text-gray-900">{l.nome_empresa}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{l.telefone || '—'}</td>
                    <td className="px-3 py-2.5">
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-green-600 hover:underline"
                        >
                          <MessageCircle size={14} /> Abrir
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-gray-600">{l.cidade || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600">{l.nota_gmn ?? '—'}</td>
                    <td className="px-3 py-2.5">
                      <PrioridadeBadge prioridade={l.prioridade} />
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={l.status_funil} />
                    </td>
                    <td className="max-w-36 truncate whitespace-nowrap px-3 py-2.5 text-gray-600">
                      {nomeMembro(membros, l.responsavel_id) ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      {l.data_retorno ? (
                        <span className={vencido ? 'font-semibold text-red-600' : 'text-gray-600'}>
                          {formatarData(l.data_retorno)}
                          {l.hora_retorno && ` ${l.hora_retorno.slice(0, 5)}`}
                          {vencido && ' ⚠️'}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {totalPaginas > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            Página {paginaAtual} de {totalPaginas}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              disabled={paginaAtual <= 1}
              className="btn-secondary px-3 py-1.5"
            >
              <ChevronLeft size={15} /> Anterior
            </button>
            <button
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              disabled={paginaAtual >= totalPaginas}
              className="btn-secondary px-3 py-1.5"
            >
              Próxima <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
      </>
      )}

      {/* Kanban */}
      {visao === 'kanban' && (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STATUS_LIST.map((s) => {
            const cfg = STATUS_CONFIG[s]
            const daColuna = filtrados.filter((l) => l.status_funil === s)
            return (
              <div
                key={s}
                onDragOver={(e) => {
                  if (podeEditar) e.preventDefault()
                }}
                onDrop={() => {
                  if (podeEditar && arrastando) {
                    moverLead(arrastando, s)
                    setArrastando(null)
                  }
                }}
                className="flex w-64 shrink-0 flex-col rounded-xl bg-gray-50/80 p-2"
              >
                <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                  <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-600">
                    <span className={`h-2 w-2 rounded-full ${cfg.dot}`} />
                    <span className="max-w-40 truncate" title={cfg.label}>
                      {cfg.label}
                    </span>
                  </span>
                  <span className="rounded-full bg-white px-1.5 py-0.5 text-xs font-semibold text-gray-500">
                    {daColuna.length}
                  </span>
                </div>
                <div className="flex min-h-24 flex-1 flex-col gap-2">
                  {daColuna.map((l) => {
                    const vencido = retornoVencido(l.data_retorno)
                    return (
                      <div
                        key={l.id}
                        draggable={podeEditar}
                        onDragStart={() => setArrastando(l.id)}
                        onDragEnd={() => setArrastando(null)}
                        onClick={() => setLeadAberto(l)}
                        className={`cursor-pointer rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm transition hover:border-brand-400 hover:shadow ${
                          arrastando === l.id ? 'opacity-50' : ''
                        }`}
                      >
                        <p className="truncate text-sm font-medium text-gray-900">{l.nome_empresa}</p>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {l.cargo ? `${l.cargo}${l.empresa_atual ? ` · ${l.empresa_atual}` : ''}` : l.telefone || l.email || l.cidade || '—'}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <PrioridadeBadge prioridade={l.prioridade} />
                          {l.data_retorno && (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                vencido ? 'bg-red-100 text-red-700' : 'bg-violet-50 text-violet-700'
                              }`}
                            >
                              {formatarData(l.data_retorno)}
                              {l.hora_retorno && ` ${l.hora_retorno.slice(0, 5)}`}
                            </span>
                          )}
                          {l.responsavel_id && (
                            <span className="truncate text-[10px] text-gray-400">
                              {nomeMembro(membros, l.responsavel_id)}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {daColuna.length === 0 && (
                    <div className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-xs text-gray-300">
                      {podeEditar ? 'Arraste leads para cá' : 'Vazio'}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {profile && (
        <CsvImportModal
          campaignId={campanha.id}
          orgId={profile.org_id}
          aberto={importAberto}
          onFechar={() => setImportAberto(false)}
          onImportado={() => carregar()}
        />
      )}

      {profile && (
        <ManualLeadsModal
          campaignId={campanha.id}
          orgId={profile.org_id}
          aberto={manualAberto}
          onFechar={() => setManualAberto(false)}
          onImportado={() => carregar()}
        />
      )}

      {profile && (
        <ApifySearchModal
          campaignId={campanha.id}
          orgId={profile.org_id}
          tipo={campanha.tipo}
          nichoSugerido={campanha.niche}
          aberto={buscaAberta}
          onFechar={() => setBuscaAberta(false)}
          onImportado={() => carregar()}
        />
      )}

      <EmailMassaModal
        leads={filtrados}
        aberto={emailAberto}
        onFechar={() => setEmailAberto(false)}
        onEnviado={() => notificarLeadsAtualizados()}
      />

      {leadAberto && (
        <LeadDrawer
          lead={leadAberto}
          aberto={!!leadAberto}
          onFechar={() => setLeadAberto(null)}
          onAtualizado={aoAtualizarLead}
          onExcluido={aoExcluirLead}
          somenteLeitura={!podeEditar}
        />
      )}
    </div>
  )
}

function Th({
  col,
  atual,
  asc,
  onClick,
  children,
}: {
  col: ColunaOrdenavel
  atual: ColunaOrdenavel
  asc: boolean
  onClick: (c: ColunaOrdenavel) => void
  children: React.ReactNode
}) {
  const ativo = atual === col
  return (
    <th
      onClick={() => onClick(col)}
      className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 hover:text-brand-600"
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {ativo && (asc ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </span>
    </th>
  )
}

/** Busca todos os leads da campanha paginando por trás dos panos (Supabase limita 1000 por request) */
async function carregarTodosLeads(campaignId: string): Promise<Lead[]> {
  const todos: Lead[] = []
  const LOTE = 1000
  let de = 0
  while (true) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('created_at', { ascending: true })
      .range(de, de + LOTE - 1)
    if (error) throw error
    const lote = (data as Lead[]) ?? []
    todos.push(...lote)
    if (lote.length < LOTE) break
    de += LOTE
  }
  return todos
}
