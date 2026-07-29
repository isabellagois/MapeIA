import type { Prioridade } from '../types'
import { PRIORIDADE_BADGE } from '../lib/utils'

export default function PrioridadeBadge({ prioridade }: { prioridade: Prioridade | null }) {
  if (!prioridade) return <span className="text-xs text-gray-400">—</span>
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORIDADE_BADGE[prioridade]}`}>
      {prioridade}
    </span>
  )
}
