import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

/** Carrega os membros da organização (a RLS já limita à própria org). */
export function useEquipe() {
  const [membros, setMembros] = useState<Profile[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let ativo = true
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: true })
      if (ativo) {
        setMembros((data as Profile[]) ?? [])
        setCarregando(false)
      }
    })()
    return () => {
      ativo = false
    }
  }, [])

  return { membros, carregando }
}

export function nomeMembro(membros: Profile[], id: string | null | undefined): string | null {
  if (!id) return null
  const m = membros.find((p) => p.id === id)
  return m ? m.full_name || m.email : null
}
