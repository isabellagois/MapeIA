import type { Prioridade, StatusFunil } from '../types'

/** Configuração visual e de rótulos das etapas do funil */
export const STATUS_CONFIG: Record<
  StatusFunil,
  { label: string; ordem: number; badge: string; dot: string }
> = {
  a_contatar: {
    label: 'A contatar',
    ordem: 1,
    badge: 'bg-gray-100 text-gray-700 border border-gray-200',
    dot: 'bg-gray-400',
  },
  dia_1: {
    label: 'Dia 1 · Abertura',
    ordem: 2,
    badge: 'bg-sky-100 text-sky-700 border border-sky-200',
    dot: 'bg-sky-400',
  },
  dia_2: {
    label: 'Dia 2 · Follow',
    ordem: 3,
    badge: 'bg-cyan-100 text-cyan-700 border border-cyan-200',
    dot: 'bg-cyan-400',
  },
  dia_3: {
    label: 'Dia 3 · Aquecimento',
    ordem: 4,
    badge: 'bg-teal-100 text-teal-700 border border-teal-200',
    dot: 'bg-teal-400',
  },
  dia_4: {
    label: 'Dia 4 · Prova',
    ordem: 5,
    badge: 'bg-blue-100 text-blue-700 border border-blue-200',
    dot: 'bg-blue-400',
  },
  dia_5: {
    label: 'Dia 5 · Outro canal',
    ordem: 6,
    badge: 'bg-indigo-100 text-indigo-700 border border-indigo-200',
    dot: 'bg-indigo-400',
  },
  dia_6: {
    label: 'Dia 6 · Reforço',
    ordem: 7,
    badge: 'bg-violet-100 text-violet-700 border border-violet-200',
    dot: 'bg-violet-400',
  },
  dia_7: {
    label: 'Dia 7 · Breakup',
    ordem: 8,
    badge: 'bg-purple-100 text-purple-700 border border-purple-200',
    dot: 'bg-purple-400',
  },
  respondeu: {
    label: 'Respondeu',
    ordem: 9,
    badge: 'bg-amber-100 text-amber-800 border border-amber-200',
    dot: 'bg-amber-400',
  },
  reuniao_marcada: {
    label: 'Reunião marcada',
    ordem: 10,
    badge: 'bg-orange-100 text-orange-800 border border-orange-200',
    dot: 'bg-orange-400',
  },
  virou_cliente: {
    label: 'Virou cliente ✅',
    ordem: 11,
    badge: 'bg-green-700 text-white border border-green-800',
    dot: 'bg-green-700',
  },
  perdido: {
    label: 'Perdido ❌',
    ordem: 12,
    badge: 'bg-red-100 text-red-700 border border-red-200',
    dot: 'bg-red-400',
  },
}

export const STATUS_LIST = (Object.keys(STATUS_CONFIG) as StatusFunil[]).sort(
  (a, b) => STATUS_CONFIG[a].ordem - STATUS_CONFIG[b].ordem
)

// --- Papéis semânticos do funil (usados por métricas / "Para contatar") ---
/** Estágio inicial: onde todo lead novo entra. "Contatado" = tudo diferente disto. */
export const STATUS_INICIAL: StatusFunil = 'a_contatar'
/** Cliente ganho (dashboard, conversão, métrica "fechados"). */
export const STATUS_GANHO: StatusFunil = 'virou_cliente'
/** Lead perdido/descartado. */
export const STATUS_PERDIDO: StatusFunil = 'perdido'
/** Estágios que contam como "em negociação" nas métricas. */
export const STATUS_NEGOCIACAO: StatusFunil[] = ['reuniao_marcada']
/** Estágios encerrados: excluídos da página "Para contatar" e de contagens ativas. */
export const STATUS_ENCERRADOS: StatusFunil[] = ['virou_cliente', 'perdido']

const STATUS_PADRAO = {
  label: 'Sem etapa',
  ordem: 999,
  badge: 'bg-gray-100 text-gray-700 border border-gray-200',
  dot: 'bg-gray-400',
}

/** Busca a config de um status com fallback seguro (evita quebrar em chaves antigas). */
export function statusInfo(status: string) {
  return STATUS_CONFIG[status as StatusFunil] ?? { ...STATUS_PADRAO, label: status }
}

export const PRIORIDADE_BADGE: Record<Prioridade, string> = {
  Alta: 'bg-red-50 text-red-700 border border-red-200',
  'Média': 'bg-amber-50 text-amber-700 border border-amber-200',
  Baixa: 'bg-gray-50 text-gray-600 border border-gray-200',
}

/** Mantém apenas dígitos do telefone (para links wa.me e tel:) */
export function soDigitos(tel: string | null | undefined): string {
  return (tel ?? '').replace(/\D/g, '')
}

/**
 * Chave de comparação de telefones para detectar duplicatas:
 * só dígitos e sem o DDI 55, para que "+55 61 99999-0000",
 * "(61) 99999-0000" e "61999990000" sejam o mesmo número.
 */
export function chaveTelefone(tel: string | null | undefined): string {
  const d = soDigitos(tel)
  return d.length > 11 ? d.slice(-11) : d
}

/** Monta link do WhatsApp; assume DDI 55 quando o número não tiver */
export function linkWhatsApp(numero: string | null | undefined): string | null {
  const d = soDigitos(numero)
  if (!d) return null
  const comDdi = d.length <= 11 ? `55${d}` : d
  return `https://wa.me/${comDdi}`
}

export function linkTelefone(numero: string | null | undefined): string | null {
  const d = soDigitos(numero)
  return d ? `tel:+${d.length <= 11 ? '55' + d : d}` : null
}

export function linkMaps(lead: { nome_empresa: string; endereco?: string | null; cidade?: string | null }): string {
  const q = encodeURIComponent(
    [lead.nome_empresa, lead.endereco, lead.cidade].filter(Boolean).join(', ')
  )
  return `https://www.google.com/maps/search/?api=1&query=${q}`
}

export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso.includes('T') ? iso : iso + 'T00:00:00')
  return d.toLocaleDateString('pt-BR')
}

export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function hojeISO(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

/** true se a data de retorno é hoje ou já passou */
export function retornoVencido(dataRetorno: string | null | undefined): boolean {
  if (!dataRetorno) return false
  return dataRetorno <= hojeISO()
}

/** Dias de atraso (0 = hoje) */
export function diasAtraso(dataRetorno: string): number {
  const hoje = new Date(hojeISO() + 'T00:00:00').getTime()
  const ret = new Date(dataRetorno + 'T00:00:00').getTime()
  return Math.round((hoje - ret) / 86400000)
}

export function somarDias(dias: number): string {
  const d = new Date()
  d.setDate(d.getDate() + dias)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}
