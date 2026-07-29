import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { BellRing, MessageCircle, Phone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Campaign, Lead } from '../types'
import { diasAtraso, formatarData, hojeISO, linkTelefone, linkWhatsApp } from '../lib/utils'
import StatusBadge from '../components/StatusBadge'
import PrioridadeBadge from '../components/PrioridadeBadge'
import Spinner from '../components/Spinner'
import LeadDrawer from '../components/LeadDrawer'

export default function Retornos() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [campanhas, setCampanhas] = useState<Record<string, Campaign>>({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [leadAberto, setLeadAberto] = useState<Lead | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const [leadsRes, campRes] = await Promise.all([
        supabase
          .from('leads')
          .select('*')
          .lte('data_retorno', hojeISO())
          .not('status_funil', 'in', '(fechado,descartado)')
          .order('data_retorno', { ascending: true }) // mais atrasados primeiro
          .order('hora_retorno', { ascending: true, nullsFirst: false }),
        supabase.from('campaigns').select('*'),
      ])
      if (leadsRes.error) throw leadsRes.error
      setLeads((leadsRes.data as Lead[]) ?? [])
      setCampanhas(
        Object.fromEntries(((campRes.data as Campaign[]) ?? []).map((c) => [c.id, c]))
      )
    } catch {
      setErro('Não foi possível carregar os retornos. Recarregue a página.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  function aoAtualizarLead(atualizado: Lead) {
    // Se o retorno saiu de "vencido", remove da lista
    const aindaVencido =
      atualizado.data_retorno &&
      atualizado.data_retorno <= hojeISO() &&
      !['fechado', 'descartado'].includes(atualizado.status_funil)
    setLeads((prev) =>
      aindaVencido
        ? prev.map((l) => (l.id === atualizado.id ? atualizado : l))
        : prev.filter((l) => l.id !== atualizado.id)
    )
    setLeadAberto(aindaVencido ? atualizado : null)
  }

  if (carregando)
    return (
      <div className="flex justify-center py-20">
        <Spinner texto="Carregando retornos…" />
      </div>
    )
  if (erro) return <p className="text-sm text-red-600">{erro}</p>

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-red-50 p-2.5 text-red-500">
          <BellRing size={22} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Para contatar hoje</h1>
          <p className="text-sm text-gray-500">
            Leads com retorno agendado para hoje ou em atraso, mais urgentes primeiro.
          </p>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-2xl">✅</p>
          <p className="mt-2 font-medium text-gray-700">Tudo em dia!</p>
          <p className="text-sm text-gray-400">Nenhum retorno pendente para hoje.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leads.map((l) => {
            const atraso = l.data_retorno ? diasAtraso(l.data_retorno) : 0
            const wa = linkWhatsApp(l.whatsapp || l.telefone)
            const tel = linkTelefone(l.telefone || l.whatsapp)
            const camp = campanhas[l.campaign_id]
            return (
              <div
                key={l.id}
                onClick={() => setLeadAberto(l)}
                className="card flex cursor-pointer flex-wrap items-center gap-3 p-4 transition hover:border-brand-200 hover:shadow"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-gray-900">{l.nome_empresa}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                    {camp && (
                      <Link
                        to={`/campanhas/${camp.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-brand-600 hover:underline"
                      >
                        {camp.name}
                      </Link>
                    )}
                    {l.cidade && <span>{l.cidade}</span>}
                    <StatusBadge status={l.status_funil} />
                    <PrioridadeBadge prioridade={l.prioridade} />
                  </div>
                </div>

                <div className="text-right">
                  <p
                    className={`text-sm font-semibold ${
                      atraso > 0 ? 'text-red-600' : 'text-amber-600'
                    }`}
                  >
                    {atraso === 0
                      ? 'Hoje'
                      : `${atraso} ${atraso === 1 ? 'dia' : 'dias'} de atraso`}
                  </p>
                  <p className="text-xs text-gray-400">
                    Retorno: {formatarData(l.data_retorno)}
                    {l.hora_retorno && ` às ${l.hora_retorno.slice(0, 5)}`}
                  </p>
                </div>

                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg bg-green-600 p-2 text-white hover:bg-green-700"
                      title="Abrir WhatsApp"
                    >
                      <MessageCircle size={16} />
                    </a>
                  )}
                  {tel && (
                    <a
                      href={tel}
                      className="rounded-lg bg-brand-700 p-2 text-white hover:bg-brand-600"
                      title="Ligar"
                    >
                      <Phone size={16} />
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {leadAberto && (
        <LeadDrawer
          lead={leadAberto}
          aberto={!!leadAberto}
          onFechar={() => setLeadAberto(null)}
          onAtualizado={aoAtualizarLead}
          onExcluido={(id) => {
            setLeads((prev) => prev.filter((l) => l.id !== id))
            setLeadAberto(null)
          }}
        />
      )}
    </div>
  )
}
