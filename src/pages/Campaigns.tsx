import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { nomeMembro, useEquipe } from '../hooks/useEquipe'
import type { Campaign, CampaignMetrics, StatusFunil, TipoCampanha } from '../types'
import Spinner from '../components/Spinner'

export default function Campaigns() {
  const { profile } = useAuth()
  const { membros } = useEquipe()
  const [campanhas, setCampanhas] = useState<Campaign[]>([])
  const [metricas, setMetricas] = useState<Record<string, CampaignMetrics>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [criando, setCriando] = useState(false)
  const [novoNome, setNovoNome] = useState('')
  const [novoNicho, setNovoNicho] = useState('')
  const [novoTipo, setNovoTipo] = useState<TipoCampanha>('google')
  const [salvando, setSalvando] = useState(false)
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false)
  // Edição de nome/nicho
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editNicho, setEditNicho] = useState('')
  const [salvandoEdicao, setSalvandoEdicao] = useState(false)
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  useEffect(() => {
    carregar()
  }, [])

  async function carregar() {
    setCarregando(true)
    setErro(null)
    try {
      const [campRes, leadsRes] = await Promise.all([
        supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('leads').select('campaign_id, status_funil'),
      ])
      if (campRes.error) throw campRes.error

      const m: Record<string, CampaignMetrics> = {}
      for (const l of leadsRes.data ?? []) {
        const id = l.campaign_id as string
        if (!m[id]) m[id] = { total: 0, contatados: 0, negociacao: 0, fechados: 0 }
        m[id].total++
        const s = l.status_funil as StatusFunil
        if (s !== 'nao_contatado') m[id].contatados++
        if (s === 'em_negociacao' || s === 'proposta_enviada') m[id].negociacao++
        if (s === 'fechado') m[id].fechados++
      }

      setCampanhas((campRes.data as Campaign[]) ?? [])
      setMetricas(m)
    } catch {
      setErro('Não foi possível carregar as campanhas. Recarregue a página.')
    } finally {
      setCarregando(false)
    }
  }

  async function criarCampanha() {
    if (!novoNome.trim()) return
    if (!profile) {
      setErro('Seu perfil não foi encontrado. Saia e entre novamente; se persistir, contate o suporte.')
      return
    }
    setSalvando(true)
    const { error } = await supabase.from('campaigns').insert({
      org_id: profile.org_id,
      name: novoNome.trim(),
      niche: novoNicho.trim() || null,
      tipo: novoTipo,
      created_by: profile.id,
    })
    setSalvando(false)
    if (error) {
      setErro('Erro ao criar a campanha. Tente novamente.')
    } else {
      setNovoNome('')
      setNovoNicho('')
      setCriando(false)
      carregar()
    }
  }

  function iniciarEdicao(c: Campaign) {
    setEditandoId(c.id)
    setEditNome(c.name)
    setEditNicho(c.niche ?? '')
  }

  async function salvarEdicao() {
    if (!editandoId || !editNome.trim()) return
    setSalvandoEdicao(true)
    const { error } = await supabase
      .from('campaigns')
      .update({ name: editNome.trim(), niche: editNicho.trim() || null })
      .eq('id', editandoId)
    setSalvandoEdicao(false)
    if (error) {
      setErro('Não foi possível salvar o novo nome. Tente novamente.')
    } else {
      setEditandoId(null)
      carregar()
    }
  }

  async function excluirPermanente(c: Campaign) {
    const total = metricas[c.id]?.total ?? 0
    const ok = window.confirm(
      `EXCLUIR PERMANENTEMENTE a campanha "${c.name}"?\n\n` +
        `Isso apaga a campanha e TODOS os ${total} leads dela, incluindo notas e histórico.\n` +
        `Essa ação NÃO PODE ser desfeita.`
    )
    if (!ok) return
    setExcluindoId(c.id)
    setErro(null)
    const { error } = await supabase.from('campaigns').delete().eq('id', c.id)
    setExcluindoId(null)
    if (error) {
      setErro('Não foi possível excluir a campanha. Tente novamente.')
    } else {
      carregar()
    }
  }

  async function alternarArquivo(c: Campaign) {
    const novoStatus = c.status === 'active' ? 'archived' : 'active'
    await supabase.from('campaigns').update({ status: novoStatus }).eq('id', c.id)
    carregar()
  }

  if (carregando)
    return (
      <div className="flex justify-center py-20">
        <Spinner texto="Carregando campanhas…" />
      </div>
    )

  const visiveis = campanhas.filter((c) =>
    mostrarArquivadas ? true : c.status === 'active'
  )

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Campanhas</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-500">
            <input
              type="checkbox"
              checked={mostrarArquivadas}
              onChange={(e) => setMostrarArquivadas(e.target.checked)}
              className="rounded border-gray-300"
            />
            Mostrar arquivadas
          </label>
          <button onClick={() => setCriando(true)} className="btn-primary">
            <Plus size={16} /> Nova campanha
          </button>
        </div>
      </div>

      {erro && <p className="mb-4 text-sm text-red-600">{erro}</p>}

      {criando && (
        <div className="card mb-6 p-5">
          <h2 className="mb-3 font-semibold text-gray-900">Nova campanha</h2>
          <div className="mb-4">
            <label className="mb-2 block text-sm font-medium text-gray-700">Origem dos leads</label>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  { valor: 'google', titulo: '📍 Google Maps', desc: 'Empresas locais com telefone, endereço e nota do Google Meu Negócio.' },
                  { valor: 'instagram', titulo: '📸 Instagram', desc: 'Perfis de negócios com bio, seguidores e link do perfil.' },
                  { valor: 'linkedin', titulo: '💼 LinkedIn', desc: 'Decisores (CEO, sócios, diretores) com cargo, empresa e e-mail.' },
                ] as { valor: TipoCampanha; titulo: string; desc: string }[]
              ).map((op) => (
                <button
                  key={op.valor}
                  type="button"
                  onClick={() => setNovoTipo(op.valor)}
                  className={`rounded-lg border-2 p-3 text-left transition ${
                    novoTipo === op.valor
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className="block text-sm font-semibold text-gray-900">{op.titulo}</span>
                  <span className="block text-xs text-gray-500">{op.desc}</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              A origem define onde as buscas desta campanha serão feitas e não pode ser alterada depois.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
              <input
                value={novoNome}
                onChange={(e) => setNovoNome(e.target.value)}
                className="input"
                placeholder="Móveis Planejados - Junho 2025"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nicho</label>
              <input
                value={novoNicho}
                onChange={(e) => setNovoNicho(e.target.value)}
                className="input"
                placeholder="Móveis Planejados DF"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={criarCampanha} disabled={salvando || !novoNome.trim()} className="btn-primary">
              {salvando ? <Spinner /> : 'Criar campanha'}
            </button>
            <button onClick={() => setCriando(false)} className="btn-secondary">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="card p-10 text-center text-gray-400">
          <p className="text-sm">
            Nenhuma campanha por aqui. Crie a primeira para importar seus leads.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visiveis.map((c) => {
            const m = metricas[c.id] ?? { total: 0, contatados: 0, negociacao: 0, fechados: 0 }
            const pct = (n: number) => (m.total > 0 ? Math.round((n / m.total) * 100) : 0)
            return (
              <div key={c.id} className={`card p-5 ${c.status === 'archived' ? 'opacity-60' : ''}`}>
                {editandoId === c.id ? (
                  <div className="mb-3 space-y-2">
                    <input
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      className="input font-semibold"
                      placeholder="Nome da campanha"
                      autoFocus
                    />
                    <input
                      value={editNicho}
                      onChange={(e) => setEditNicho(e.target.value)}
                      className="input text-sm"
                      placeholder="Nicho (opcional)"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={salvarEdicao}
                        disabled={salvandoEdicao || !editNome.trim()}
                        className="btn-primary px-3 py-1.5 text-xs"
                      >
                        {salvandoEdicao ? <Spinner /> : <Check size={14} />} Salvar
                      </button>
                      <button onClick={() => setEditandoId(null)} className="btn-secondary px-3 py-1.5 text-xs">
                        <X size={14} /> Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mb-1 flex items-start justify-between gap-2">
                      <Link
                        to={`/campanhas/${c.id}`}
                        className="min-w-0 truncate font-semibold text-gray-900 hover:text-brand-600"
                      >
                        {c.name}
                      </Link>
                      <div className="flex shrink-0 items-center">
                        <button
                          onClick={() => iniciarEdicao(c)}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                          title="Editar nome e nicho"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => alternarArquivo(c)}
                          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-50 hover:text-gray-600"
                          title={c.status === 'active' ? 'Arquivar' : 'Restaurar'}
                        >
                          {c.status === 'active' ? <Archive size={15} /> : <ArchiveRestore size={15} />}
                        </button>
                        {c.status === 'archived' && (
                          <button
                            onClick={() => excluirPermanente(c)}
                            disabled={excluindoId === c.id}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Excluir permanentemente"
                          >
                            {excluindoId === c.id ? <Spinner /> : <Trash2 size={15} />}
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-400">
                      <span className={`mr-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        c.tipo === 'instagram'
                          ? 'bg-pink-50 text-pink-600'
                          : c.tipo === 'linkedin'
                            ? 'bg-sky-50 text-sky-700'
                            : 'bg-blue-50 text-blue-600'
                      }`}>
                        {c.tipo === 'instagram' ? '📸 Instagram' : c.tipo === 'linkedin' ? '💼 LinkedIn' : '📍 Google'}
                      </span>
                      {c.niche}
                    </p>
                  </>
                )}
                <p className="mb-3 text-xs text-gray-400">
                  Criada por <span className="font-medium text-gray-500">{nomeMembro(membros, c.created_by) ?? '—'}</span>
                </p>

                <p className="mb-3 text-3xl font-bold text-gray-900">
                  {m.total}
                  <span className="ml-1 text-sm font-normal text-gray-400">leads</span>
                </p>

                <div className="space-y-1.5 text-sm">
                  <LinhaPct rotulo="Contatados" pct={pct(m.contatados)} cor="bg-sky-400" />
                  <LinhaPct rotulo="Em negociação" pct={pct(m.negociacao)} cor="bg-orange-400" />
                  <LinhaPct rotulo="Fechados" pct={pct(m.fechados)} cor="bg-green-600" />
                </div>

                <Link
                  to={`/campanhas/${c.id}`}
                  className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline"
                >
                  Abrir leads →
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LinhaPct({ rotulo, pct, cor }: { rotulo: string; pct: number; cor: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-28 shrink-0 text-xs text-gray-500">{rotulo}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-9 shrink-0 text-right text-xs font-semibold text-gray-700">{pct}%</span>
    </div>
  )
}
