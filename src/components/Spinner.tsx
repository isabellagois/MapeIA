import { Loader2 } from 'lucide-react'

export default function Spinner({ texto }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-500">
      <Loader2 size={18} className="animate-spin" />
      {texto && <span>{texto}</span>}
    </div>
  )
}
