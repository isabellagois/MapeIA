import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BellRing, TrendingUp, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useEquipe } from '../hooks/useEquipe'
import type { Activity, StatusFunil } from '../types'
import {
  STATUS_CONFIG,
  STATUS_ENCERRADOS,
  STATUS_GANHO,
  STATUS_LIST,
  STATUS_NEGOCIACAO,
  STATUS_PERDIDO,
  formatarDataHora,
  hojeISO,
} from '../lib/utils'
import Spinner from '../components/Spinner'

interface Contagens {
  porStatus: Record<StatusFunil, number>
  total: number
  retornosHoje: number
}

interface PerformanceMembro {
  atribuidos: number
  fechados: number
  emNegociacao: number
  atividades30d: number
  contatos30d: number
}

export default function Dashboard() {
  const { membros } = useEquipe()
  const [contagens, setContagens] = useState<Contagens | null>(null)
  const [atividades, setAtividades] = useState<Activity[]>([])
  const [performance, setPerformance] = useState<Record<string, PerformanceMembro>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const ha30Dias = new Date(Date.now() - 30 * 86400000).toISOString()
        const [leadsRes, retornosRes, atvRes, atv30Res] = await Promise.all([
          supabase.from('leads').select('status_funil, responsavel_id'),
          supabase
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .lte('data_retorno', hojeISO())
            .not('status_funil', 'in', `(${STATUS_ENCERRADOS.join(',')})`),
          supabase
            .from('activities')
            .select('*, profiles:user_id (full_name, email)')
            .order('created_at', { ascending: false })
            .limit(8),
          supabase
            .from('activities')
            .select('user_id, tipo')
            .gte('created_at', ha30Dias)
            .limit(5000),
        ])

        if (leadsRes.error) throw leadsRes.error

        const porStatus = Object.fromEntries(
          STATUS_LIST.map((s) => [s, 0])
        ) as Record<StatusFunil, number>
        const perf: Record<string, PerformanceMembro> = {}
        const garantir = (id: string) => {
          if (!perf[id]) perf[id] = { atribuidos: 0, fechados: 0, emNegociacao: 0, atividades30d: 0, contatos30d: 0 }
          return perf[id]
        }

        for (const l of leadsRes.data ?? []) {
          const s = l.status_funil as StatusFunil
          porStatus[s] = (porStatus[s] ?? 0) + 1
          if (l.responsavel_id) {
            const p = garantir(l.responsavel_id as string)
            p.atribuidos++
            if (s === STATUS_GANHO) p.fechados++
            if (STATUS_NEGOCIACAO.includes(s)) p.emNegociacao++
          }
        }

        for (const a of atv30Res.data ?? []) {
          if (!a.user_id) continue
          const p = garantir(a.user_id as string)
          p.atividades30d++
          if (a.tipo === 'status_change') p.contatos30d++
        }

        setContagens({
          porStatus,
          total: leadsRes.data?.length ?? 0,
          retornosHoje: retornosRes.count ?? 0,
        })
        setAtividades((atvRes.data as Activity[]) ?? [])
        setPerformance(perf)
      } catch {
        setErro('Não foi possível carregar o dashboard. Recarregue a página.')
      } finally {
        setCarregando(false)
      }
    })()
  }, [])

  if (carregando)
    return (
      <div className="flex justify-center py-20">
        <Spinner texto="Carregando dashboard…" />
      </div>
    )
  if (erro || !contagens) return <p className="text-sm text-red-600">{erro}</p>

  const ativos = contagens.total - contagens.porStatus[STATUS_PERDIDO]
  const fechados = contagens.porStatus[STATUS_GANHO]
  const taxaConversao = contagens.total > 0 ? ((fechados / contagens.total) * 100).toFixed(1) : '0'
  const maxEtapa = Math.max(1, ...STATUS_LIST.map((s) => contagens.porStatus[s]))

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Cards de métricas */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CardMetrica
          icone={<Users size={20} className="text-brand-600" />}
          valor={ativos}
          rotulo="Leads ativos"
        />
        <CardMetrica
          icone={<TrendingUp size={20} className="text-green-600" />}
          valor={`${taxaConversao}%`}
          rotulo={`Taxa de conversão (${fechados} fechados)`}
        />
        <Link to="/retornos" className="group">
          <CardMetrica
            icone={<BellRing size={20} className={contagens.retornosHoje > 0 ? 'text-red-500' : 'text-gray-400'} />}
            valor={contagens.retornosHoje}
            rotulo="Para contatar hoje"
            destaque={contagens.retornosHoje > 0}
          />
        </Link>
      </div>

      {/* Performance da equipe */}
      {membros.length > 0 && (
        <div className="card mb-6 p-5">
          <h2 className="mb-1 font-semibold text-gray-900">Performance da equipe</h2>
          <p className="mb-4 text-xs text-gray-400">
            Atividades dos últimos 30 dias · leads e fechamentos consideram a carteira atual de cada responsável
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-3">Colaborador</th>
                  <th className="px-3 py-2 text-right">Leads na carteira</th>
                  <th className="px-3 py-2 text-right">Atividades (30d)</th>
                  <th className="px-3 py-2 text-right">Mudanças de status (30d)</th>
                  <th className="px-3 py-2 text-right">Em negociação</th>
                  <th className="px-3 py-2 text-right">Fechados</th>
                  <th className="px-3 py-2 text-right">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {membros.map((m) => {
                  const p = performance[m.id] ?? {
                    atribuidos: 0,
                    fechados: 0,
                    emNegociacao: 0,
                    atividades30d: 0,
                    contatos30d: 0,
                  }
                  const conversao = p.atribuidos > 0 ? ((p.fechados / p.atribuidos) * 100).toFixed(0) : '—'
                  return (
                    <tr key={m.id} className="border-b border-gray-100 last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-gray-900">{m.full_name || m.email}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{p.atribuidos}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{p.atividades30d}</td>
                      <td className="px-3 py-2.5 text-right text-gray-700">{p.contatos30d}</td>
                      <td className="px-3 py-2.5 text-right text-orange-600">{p.emNegociacao}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-green-700">{p.fechados}</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                        {conversao === '—' ? '—' : `${conversao}%`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Funil visual */}
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-gray-900">Funil de prospecção</h2>
          <div className="space-y-2.5">
            {STATUS_LIST.map((s) => {
              const qtd = contagens.porStatus[s]
              const cfg = STATUS_CONFIG[s]
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate text-sm text-gray-600 sm:w-48">
                    {cfg.label}
                  </span>
                  <div className="h-6 flex-1 overflow-hidden rounded-md bg-gray-100">
                    <div
                      className={`flex h-full items-center rounded-md ${cfg.dot} transition-all`}
                      style={{ width: `${Math.max(qtd > 0 ? 8 : 0, (qtd / maxEtapa) * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm font-semibold text-gray-800">
                    {qtd}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Últimas atividades */}
        <div className="card p-5">
          <h2 className="mb-4 font-semibold text-gray-900">Últimas atividades</h2>
          {atividades.length === 0 ? (
            <p className="text-sm text-gray-400">
              Nenhuma atividade ainda. Importe leads em uma campanha para começar.
            </p>
          ) : (
            <ul className="space-y-3">
              {atividades.map((a) => (
                <li key={a.id} className="border-l-2 border-brand-200 pl-3">
                  <p className="text-sm text-gray-800">{a.descricao}</p>
                  <p className="text-xs text-gray-400">
                    {formatarDataHora(a.created_at)}
                    {a.profiles && ` · ${a.profiles.full_name || a.profiles.email}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/campanhas"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
          >
            Ir para campanhas <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}

function CardMetrica({
  icone,
  valor,
  rotulo,
  destaque,
}: {
  icone: React.ReactNode
  valor: number | string
  rotulo: string
  destaque?: boolean
}) {
  return (
    <div className={`card flex items-center gap-4 p-5 ${destaque ? 'ring-2 ring-red-200' : ''}`}>
      <div className="rounded-lg bg-gray-50 p-2.5">{icone}</div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{valor}</p>
        <p className="text-sm text-gray-500">{rotulo}</p>
      </div>
    </div>
  )
}
