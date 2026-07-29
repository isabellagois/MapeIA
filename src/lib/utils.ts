import type { Prioridade, StatusFunil } from '../types'

/** Configuração visual e de rótulos das 7 etapas do funil + status especial */
export const STATUS_CONFIG: Record<
  StatusFunil,
  { label: string; ordem: number; badge: string; dot: string }
> = {
  nao_contatado: {
    label: 'Não contatado',
    ordem: 1,
    badge: 'bg-gray-100 text-gray-700 border border-gray-200',
    dot: 'bg-gray-400',
  },
  tentativa: {
    label: 'Tentativa — não atendeu',
    ordem: 2,
    badge: 'bg-sky-100 text-sky-700 border border-sky-200',
    dot: 'bg-sky-400',
  },
  tentativa_msg: {
    label: 'Tentativa — não respondeu mensagem',
    ordem: 3,
    badge: 'bg-cyan-100 text-cyan-700 border border-cyan-200',
    dot: 'bg-cyan-400',
  },
  contato_feito: {
    label: 'Contato feito',
    ordem: 4,
    badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    dot: 'bg-emerald-400',
  },
  proposta_enviada: {
    label: 'Proposta enviada',
    ordem: 5,
    badge: 'bg-yellow-100 text-yellow-800 border border-yellow-200',
    dot: 'bg-yellow-400',
  },
  em_negociacao: {
    label: 'Em negociação',
    ordem: 6,
    badge: 'bg-orange-100 text-orange-800 border border-orange-200',
    dot: 'bg-orange-400',
  },
  fechado: {
    label: 'Cliente fechado ✅',
    ordem: 7,
    badge: 'bg-green-700 text-white border border-green-800',
    dot: 'bg-green-700',
  },
  descartado: {
    label: 'Sem interesse ❌',
    ordem: 8,
    badge: 'bg-red-100 text-red-700 border border-red-200',
    dot: 'bg-red-400',
  },
  retornar: {
    label: 'Retornar em data agendada',
    ordem: 9,
    badge: 'bg-violet-100 text-violet-700 border border-violet-200',
    dot: 'bg-violet-400',
  },
}

export const STATUS_LIST = (Object.keys(STATUS_CONFIG) as StatusFunil[]).sort(
  (a, b) => STATUS_CONFIG[a].ordem - STATUS_CONFIG[b].ordem
)

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
