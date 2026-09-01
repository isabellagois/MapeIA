import { useEffect, useState } from 'react'
import {
  CalendarClock,
  ExternalLink,
  Globe,
  MapPin,
  MessageCircle,
  Phone,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import type { Activity, Lead, Prioridade, StatusFunil } from '../types'
import { supabase } from '../lib/supabase'
import {
  STATUS_CONFIG,
  STATUS_LIST,
  formatarData,
  formatarDataHora,
  hojeISO,
  linkMaps,
  linkTelefone,
  linkWhatsApp,
  retornoVencido,
  somarDias,
} from '../lib/utils'
import { nomeMembro, useEquipe } from '../hooks/useEquipe'
import StatusBadge from './StatusBadge'
import PrioridadeBadge from './PrioridadeBadge'
import Spinner from './Spinner'
import { notificarLeadsAtualizados } from './Layout'

interface Props {
  lead: Lead
  aberto: boolean
  onFechar: () => void
  onAtualizado: (lead: Lead) => void
  onExcluido?: (leadId: string) => void
  somenteLeitura?: boolean
}

export default function LeadDrawer({ lead, aberto, onFechar, onAtualizado, onExcluido, somenteLeitura }: Props) {
  const { membros } = useEquipe()
  const [status, setStatus] = useState<StatusFunil>(lead.status_funil)
  const [dataRetorno, setDataRetorno] = useState<string>(lead.data_retorno ?? '')
  const [horaRetorno, setHoraRetorno] = useState<string>(lead.hora_retorno?.slice(0, 5) ?? '')
  const [dataPrimeiroContato, setDataPrimeiroContato] = useState<string>(lead.data_primeiro_contato ?? '')
  const [diasLivre, setDiasLivre] = useState<string>('')
  const [notas, setNotas] = useState<string>(lead.notas ?? '')
  const [responsavel, setResponsavel] = useState<string>(lead.responsavel_id ?? '')
  // Dados editáveis do contato
  const [nomeEmpresa, setNomeEmpresa] = useState(lead.nome_empresa)
  const [telefone, setTelefone] = useState(lead.telefone ?? '')
  const [whatsapp, setWhatsapp] = useState(lead.whatsapp ?? '')
  const [website, setWebsite] = useState(lead.website ?? '')
  const [endereco, setEndereco] = useState(lead.endereco ?? '')
  const [bairro, setBairro] = useState(lead.bairro ?? '')
  const [cidadeLead, setCidadeLead] = useState(lead.cidade ?? '')
  const [prioridade, setPrioridade] = useState<string>(lead.prioridade ?? '')
  const [cargo, setCargo] = useState(lead.cargo ?? '')
  const [empresaAtual, setEmpresaAtual] = useState(lead.empresa_atual ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [atividades, setAtividades] = useState<Activity[]>([])
  const [carregandoAtv, setCarregandoAtv] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvou, setSalvou] = useState(false)

  useEffect(() => {
    setStatus(lead.status_funil)
    setDataRetorno(lead.data_retorno ?? '')
    setHoraRetorno(lead.hora_retorno?.slice(0, 5) ?? '')
    setDataPrimeiroContato(lead.data_primeiro_contato ?? '')
    setDiasLivre('')
    setNotas(lead.notas ?? '')
    setResponsavel(lead.responsavel_id ?? '')
    setNomeEmpresa(lead.nome_empresa)
    setTelefone(lead.telefone ?? '')
    setWhatsapp(lead.whatsapp ?? '')
    setWebsite(lead.website ?? '')
    setEndereco(lead.endereco ?? '')
    setBairro(lead.bairro ?? '')
    setCidadeLead(lead.cidade ?? '')
    setPrioridade(lead.prioridade ?? '')
    setCargo(lead.cargo ?? '')
    setEmpresaAtual(lead.empresa_atual ?? '')
    setEmail(lead.email ?? '')
    setErro(null)
    setSalvou(false)
    carregarAtividades()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id])

  async function carregarAtividades() {
    setCarregandoAtv(true)
    const { data } = await supabase
      .from('activities')
      .select('*, profiles:user_id (full_name, email)')
      .eq('lead_id', lead.id)
      .order('created_at', { ascending: false })
      .limit(50)
    setAtividades((data as Activity[]) ?? [])
    setCarregandoAtv(false)
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    setSalvou(false)

    if (!nomeEmpresa.trim()) {
      setErro('O nome da empresa não pode ficar vazio.')
      setSalvando(false)
      return
    }

    const payload: Partial<Lead> = {
      status_funil: status,
      data_retorno: dataRetorno || null,
      hora_retorno: dataRetorno && horaRetorno ? horaRetorno : null,
      data_primeiro_contato: dataPrimeiroContato || null,
      notas: notas || null,
      responsavel_id: responsavel || null,
      nome_empresa: nomeEmpresa.trim(),
      telefone: telefone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      website: website.trim() || null,
      endereco: endereco.trim() || null,
      bairro: bairro.trim() || null,
      cidade: cidadeLead.trim() || null,
      prioridade: (prioridade || null) as Prioridade | null,
      cargo: cargo.trim() || null,
      empresa_atual: empresaAtual.trim() || null,
      email: email.trim() || null,
    }

    const { data, error } = await supabase
      .from('leads')
      .update(payload)
      .eq('id', lead.id)
      .select()
      .single()

    if (error) {
      setErro('Não foi possível salvar. Verifique sua conexão e tente de novo.')
    } else {
      // Loga troca manual de responsável
      if ((responsavel || null) !== (lead.responsavel_id || null)) {
        const nome = nomeMembro(membros, responsavel) ?? 'ninguém'
        await supabase.from('activities').insert({
          lead_id: lead.id,
          org_id: lead.org_id,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          tipo: 'atribuicao',
          descricao: `Responsável alterado para ${nome}`,
        })
      }
      // Loga nota como atividade quando mudou
      if ((notas || null) !== (lead.notas || null)) {
        await supabase.from('activities').insert({
          lead_id: lead.id,
          org_id: lead.org_id,
          user_id: (await supabase.auth.getUser()).data.user?.id,
          tipo: 'nota',
          descricao: 'Notas atualizadas',
        })
      }
      onAtualizado(data as Lead)
      notificarLeadsAtualizados()
      carregarAtividades()
      setSalvou(true)
      setTimeout(() => setSalvou(false), 2500)
    }
    setSalvando(false)
  }

  async function excluir() {
    const ok = window.confirm(
      `Excluir o lead "${lead.nome_empresa}"?\n\nO histórico de atividades dele também será apagado. Essa ação não pode ser desfeita.`
    )
    if (!ok) return
    setExcluindo(true)
    setErro(null)
    const { error } = await supabase.from('leads').delete().eq('id', lead.id)
    setExcluindo(false)
    if (error) {
      setErro('Não foi possível excluir o lead. Tente novamente.')
    } else {
      notificarLeadsAtualizados()
      onExcluido?.(lead.id)
      onFechar()
    }
  }

  const wa = linkWhatsApp(lead.whatsapp || lead.telefone)
  const tel = linkTelefone(lead.telefone || lead.whatsapp)
  const vencido = retornoVencido(lead.data_retorno)

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onFechar} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-gray-900">{lead.nome_empresa}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={lead.status_funil} />
              <PrioridadeBadge prioridade={lead.prioridade} />
              {lead.data_retorno && (
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    vencido ? 'bg-red-100 text-red-700' : 'bg-violet-50 text-violet-700'
                  }`}
                >
                  <CalendarClock size={12} />
                  Retorno: {formatarData(lead.data_retorno)}
                  {lead.hora_retorno && ` às ${lead.hora_retorno.slice(0, 5)}`}
                </span>
              )}
            </div>
          </div>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Fechar painel">
            <X size={20} />
          </button>
        </div>

        <fieldset disabled={somenteLeitura} className="m-0 min-w-0 flex-1 overflow-y-auto border-0 p-0 px-5 py-4">
          {/* Ações rápidas */}
          <div className="mb-5 grid grid-cols-3 gap-2">
            <a
              href={wa ?? undefined}
              target="_blank"
              rel="noreferrer"
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
                wa
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400'
              }`}
            >
              <MessageCircle size={16} /> WhatsApp
            </a>
            <a
              href={tel ?? undefined}
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ${
                tel
                  ? 'bg-brand-700 text-white hover:bg-brand-600'
                  : 'cursor-not-allowed bg-gray-100 text-gray-400'
              }`}
            >
              <Phone size={16} /> Ligar
            </a>
            <a
              href={lead.link_gmn ?? linkMaps(lead)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <MapPin size={16} />{' '}
              {lead.link_gmn
                ? lead.link_gmn.includes('instagram.com')
                  ? 'Instagram'
                  : lead.link_gmn.includes('linkedin.com')
                    ? 'LinkedIn'
                    : 'Perfil GMN'
                : 'Maps'}
            </a>
          </div>

          {/* Dados do lead (editáveis) */}
          <Secao titulo="Dados do lead">
            <div className="space-y-3">
              <Campo rotulo="Nome da empresa">
                <input value={nomeEmpresa} onChange={(e) => setNomeEmpresa(e.target.value)} className="input" />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Telefone">
                  <input value={telefone} onChange={(e) => setTelefone(e.target.value)} className="input" placeholder="(61) 99999-0000" />
                </Campo>
                <Campo rotulo="WhatsApp">
                  <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} className="input" placeholder="(61) 99999-0000" />
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Cargo">
                  <input value={cargo} onChange={(e) => setCargo(e.target.value)} className="input" placeholder="CEO, sócio…" />
                </Campo>
                <Campo rotulo="Empresa atual">
                  <input value={empresaAtual} onChange={(e) => setEmpresaAtual(e.target.value)} className="input" />
                </Campo>
              </div>
              <Campo rotulo="E-mail">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="contato@empresa.com.br"
                />
              </Campo>
              <Campo rotulo="Website">
                <div className="flex items-center gap-2">
                  <input value={website} onChange={(e) => setWebsite(e.target.value)} className="input flex-1" placeholder="www.empresa.com.br" />
                  {website.trim() && (
                    <a
                      href={website.startsWith('http') ? website : `https://${website}`}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 text-brand-600 hover:text-brand-700"
                      title="Abrir site"
                    >
                      <Globe size={16} />
                    </a>
                  )}
                </div>
              </Campo>
              <Campo rotulo="Endereço">
                <input value={endereco} onChange={(e) => setEndereco(e.target.value)} className="input" />
              </Campo>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Bairro">
                  <input value={bairro} onChange={(e) => setBairro(e.target.value)} className="input" />
                </Campo>
                <Campo rotulo="Cidade">
                  <input value={cidadeLead} onChange={(e) => setCidadeLead(e.target.value)} className="input" />
                </Campo>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Prioridade">
                  <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className="input">
                    <option value="">Sem prioridade</option>
                    <option value="Alta">Alta</option>
                    <option value="Média">Média</option>
                    <option value="Baixa">Baixa</option>
                  </select>
                </Campo>
              </div>
            </div>
            <div className="mt-3">
              <Linha rotulo="Categoria" valor={lead.categoria_gmn} />
              <Linha
                rotulo={lead.link_gmn?.includes('instagram.com') ? 'Seguidores no Instagram' : 'Avaliações no Google'}
                valor={lead.total_avaliacoes != null ? String(lead.total_avaliacoes) : null}
              />
              <Linha
                rotulo={
                  lead.link_gmn?.includes('instagram.com')
                    ? 'Perfil no Instagram'
                    : lead.link_gmn?.includes('linkedin.com')
                      ? 'Perfil no LinkedIn'
                      : 'Perfil no Google Maps'
                }
                valor={lead.link_gmn}
                render={(v) => (
                  <a
                    href={v}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-brand-600 hover:underline"
                  >
                    <MapPin size={13} /> Abrir perfil <ExternalLink size={11} />
                  </a>
                )}
              />
            </div>
          </Secao>

          {/* Diagnóstico GMN */}
          <Secao titulo="Diagnóstico GMN">
            <div className="mb-2 flex items-center gap-3">
              <span className="text-sm text-gray-500">Nota do perfil</span>
              {lead.nota_gmn != null ? (
                <span
                  className={`rounded-md px-2 py-0.5 text-sm font-bold ${
                    lead.nota_gmn >= 70
                      ? 'bg-green-100 text-green-800'
                      : lead.nota_gmn >= 40
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-700'
                  }`}
                >
                  {lead.nota_gmn}/100
                </span>
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </div>
            {lead.itens_faltando_gmn && (
              <div className="mb-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Itens faltando</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm text-gray-700">{lead.itens_faltando_gmn}</p>
              </div>
            )}
            {lead.argumento_vendas && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Argumento de vendas</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{lead.argumento_vendas}</p>
              </div>
            )}
          </Secao>

          {/* Responsável */}
          <Secao titulo="Responsável pela prospecção">
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} className="input">
              <option value="">Sem responsável</option>
              {membros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name || m.email}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-400">
              Quem mexer primeiro no lead vira responsável automaticamente; aqui você pode trocar.
            </p>
          </Secao>

          {/* Status e retorno */}
          <Secao titulo="Status do funil">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFunil)}
              className="input"
            >
              {STATUS_LIST.map((s) => (
                <option key={s} value={s}>
                  {STATUS_CONFIG[s].label}
                </option>
              ))}
            </select>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Data do primeiro contato
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={dataPrimeiroContato}
                  onChange={(e) => setDataPrimeiroContato(e.target.value)}
                  className="input max-w-44"
                />
                {!dataPrimeiroContato && (
                  <button
                    type="button"
                    onClick={() => setDataPrimeiroContato(hojeISO())}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-brand-500 hover:text-brand-600"
                  >
                    hoje
                  </button>
                )}
              </div>
            </div>

            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Agendar retorno de contato
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={dataRetorno}
                  onChange={(e) => setDataRetorno(e.target.value)}
                  className="input max-w-44"
                />
                <input
                  type="time"
                  value={horaRetorno}
                  onChange={(e) => setHoraRetorno(e.target.value)}
                  disabled={!dataRetorno}
                  className="input max-w-28 disabled:opacity-50"
                  title={dataRetorno ? 'Horário do retorno (opcional)' : 'Escolha primeiro a data'}
                />
                {[1, 3, 7, 15, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDataRetorno(somarDias(d))}
                    className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:border-brand-500 hover:text-brand-600"
                  >
                    +{d}d
                  </button>
                ))}
                <span className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600">
                  +
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={diasLivre}
                    onChange={(e) => {
                      setDiasLivre(e.target.value)
                      const n = parseInt(e.target.value, 10)
                      if (n >= 1 && n <= 365) {
                        setDataRetorno(somarDias(n))
                      }
                    }}
                    placeholder="X"
                    className="w-12 border-0 bg-transparent p-0 text-center text-xs focus:outline-none focus:ring-0"
                    title="Retornar em quantos dias?"
                  />
                  dias
                </span>
                {dataRetorno && (
                  <button
                    type="button"
                    onClick={() => {
                      setDataRetorno('')
                      setHoraRetorno('')
                    }}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    limpar
                  </button>
                )}
              </div>
            </div>
          </Secao>

          {/* Notas */}
          <Secao titulo="Notas">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={4}
              placeholder="Anote aqui o resumo da conversa, objeções, próximos passos…"
              className="input resize-y"
            />
          </Secao>

          {/* Histórico */}
          <Secao titulo="Histórico de atividades">
            {carregandoAtv ? (
              <Spinner texto="Carregando histórico…" />
            ) : atividades.length === 0 ? (
              <p className="text-sm text-gray-400">Nenhuma atividade registrada ainda.</p>
            ) : (
              <ul className="space-y-3">
                {atividades.map((a) => (
                  <li key={a.id} className="relative border-l-2 border-gray-200 pl-3">
                    <p className="text-sm text-gray-800">{a.descricao}</p>
                    <p className="text-xs text-gray-400">
                      {formatarDataHora(a.created_at)}
                      {a.profiles && ` · ${a.profiles.full_name || a.profiles.email}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </fieldset>

        {/* Rodapé fixo de salvar */}
        <div className="border-t border-gray-200 bg-white px-5 py-3">
          {erro && <p className="mb-2 text-sm text-red-600">{erro}</p>}
          {salvou && <p className="mb-2 text-sm text-green-600">Alterações salvas ✓</p>}
          {somenteLeitura ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-gray-400">Acesso somente leitura — você pode visualizar, mas não alterar.</span>
              <button onClick={onFechar} className="btn-secondary">
                Fechar
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={salvar} disabled={salvando || excluindo} className="btn-primary flex-1">
                {salvando ? <Spinner /> : <Save size={16} />} Salvar alterações
              </button>
              <button
                onClick={excluir}
                disabled={salvando || excluindo}
                className="flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
                title="Excluir lead"
              >
                {excluindo ? <Spinner /> : <Trash2 size={16} />} Excluir
              </button>
              <button onClick={onFechar} className="btn-secondary">
                Fechar
              </button>
            </div>
          )}
        </div>
      </aside>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{rotulo}</label>
      {children}
    </div>
  )
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">{titulo}</h3>
      {children}
    </section>
  )
}

function Linha({
  rotulo,
  valor,
  render,
}: {
  rotulo: string
  valor: string | null
  render?: (v: string) => React.ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-gray-50 py-1.5 text-sm">
      <span className="shrink-0 text-gray-500">{rotulo}</span>
      <span className="min-w-0 truncate text-right text-gray-800">
        {valor ? (render ? render(valor) : valor) : '—'}
      </span>
    </div>
  )
}
