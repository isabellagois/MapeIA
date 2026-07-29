import { useEffect, useState } from 'react'
import { Check, Copy, KeyRound, ShieldCheck, User, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useEquipe } from '../hooks/useEquipe'
import type { Campaign, CampaignAccess, NivelAcesso, Profile } from '../types'
import Spinner from '../components/Spinner'

export default function Equipe() {
  const { profile } = useAuth()
  const { membros: membrosIniciais, carregando } = useEquipe()
  const [membros, setMembros] = useState<Profile[]>([])
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [gerenciando, setGerenciando] = useState<Profile | null>(null)

  useEffect(() => {
    setMembros(membrosIniciais)
  }, [membrosIniciais])

  const ehAdmin = profile?.role === 'admin'
  const linkConvite = profile ? `${window.location.origin}/?convite=${profile.org_id}` : ''

  async function copiarLink() {
    await navigator.clipboard.writeText(linkConvite)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2500)
  }

  async function mudarPapel(m: Profile, novoPapel: 'admin' | 'member') {
    if (m.id === profile?.id) return
    if (novoPapel === 'admin') {
      const ok = window.confirm(
        `Tornar ${m.full_name || m.email} administrador(a)?\n\nAdministradores veem e controlam TODAS as campanhas e podem gerenciar a equipe.`
      )
      if (!ok) return
    }
    setErro(null)
    const { error } = await supabase.from('profiles').update({ role: novoPapel }).eq('id', m.id)
    if (error) {
      setErro('Não foi possível alterar o papel. Tente novamente.')
    } else {
      setMembros((prev) => prev.map((p) => (p.id === m.id ? { ...p, role: novoPapel } : p)))
    }
  }

  if (carregando)
    return (
      <div className="flex justify-center py-20">
        <Spinner texto="Carregando equipe…" />
      </div>
    )

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Equipe</h1>

      {erro && <p className="mb-4 text-sm text-red-600">{erro}</p>}

      {ehAdmin && (
        <div className="card mb-6 p-5">
          <h2 className="mb-1 font-semibold text-gray-900">Convidar colaborador</h2>
          <p className="mb-3 text-sm text-gray-500">
            Envie este link para a pessoa criar a conta dela já dentro da sua organização.
            Colaboradores veem apenas as campanhas que criarem e as que você liberar em "Acessos".
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input readOnly value={linkConvite} className="input max-w-xl flex-1 text-gray-600" onFocus={(e) => e.target.select()} />
            <button onClick={copiarLink} className="btn-primary">
              {copiado ? <Check size={16} /> : <Copy size={16} />} {copiado ? 'Copiado!' : 'Copiar link'}
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2.5">Nome</th>
              <th className="px-4 py-2.5">E-mail</th>
              <th className="px-4 py-2.5">Papel</th>
              {ehAdmin && <th className="px-4 py-2.5">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {membros.map((m) => (
              <tr key={m.id} className="border-b border-gray-100 last:border-0">
                <td className="px-4 py-2.5 font-medium text-gray-900">
                  {m.full_name || '—'}
                  {m.id === profile?.id && <span className="ml-2 text-xs text-gray-400">(você)</span>}
                </td>
                <td className="px-4 py-2.5 text-gray-600">{m.email}</td>
                <td className="px-4 py-2.5">
                  {ehAdmin && m.id !== profile?.id ? (
                    <select
                      value={m.role}
                      onChange={(e) => mudarPapel(m, e.target.value as 'admin' | 'member')}
                      className="input max-w-44 py-1 text-xs"
                    >
                      <option value="member">Colaborador</option>
                      <option value="admin">Administrador</option>
                    </select>
                  ) : m.role === 'admin' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                      <ShieldCheck size={12} /> Administrador
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      <User size={12} /> Colaborador
                    </span>
                  )}
                </td>
                {ehAdmin && (
                  <td className="px-4 py-2.5">
                    {m.role === 'member' ? (
                      <button
                        onClick={() => setGerenciando(m)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:border-brand-500 hover:text-brand-600"
                      >
                        <KeyRound size={13} /> Acessos
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Acesso total</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {gerenciando && (
        <AcessosModal membro={gerenciando} onFechar={() => setGerenciando(null)} />
      )}
    </div>
  )
}

/** Modal do admin para conceder/revogar acesso de um colaborador às campanhas */
function AcessosModal({ membro, onFechar }: { membro: Profile; onFechar: () => void }) {
  const [campanhas, setCampanhas] = useState<Campaign[]>([])
  const [acessos, setAcessos] = useState<Record<string, NivelAcesso>>({})
  const [original, setOriginal] = useState<Record<string, NivelAcesso>>({})
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      setCarregando(true)
      const [campRes, acRes] = await Promise.all([
        supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
        supabase.from('campaign_access').select('*').eq('profile_id', membro.id),
      ])
      setCampanhas((campRes.data as Campaign[]) ?? [])
      const mapa: Record<string, NivelAcesso> = {}
      for (const a of (acRes.data as CampaignAccess[]) ?? []) mapa[a.campaign_id] = a.nivel
      setAcessos({ ...mapa })
      setOriginal({ ...mapa })
      setCarregando(false)
    })()
  }, [membro.id])

  function alternar(campaignId: string) {
    setAcessos((prev) => {
      const novo = { ...prev }
      if (novo[campaignId]) delete novo[campaignId]
      else novo[campaignId] = 'edicao'
      return novo
    })
  }

  function mudarNivel(campaignId: string, nivel: NivelAcesso) {
    setAcessos((prev) => ({ ...prev, [campaignId]: nivel }))
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    try {
      const remover = Object.keys(original).filter((id) => !acessos[id])
      const upserts = Object.entries(acessos)
        .filter(([id, nivel]) => original[id] !== nivel)
        .map(([campaign_id, nivel]) => ({ campaign_id, profile_id: membro.id, nivel }))

      if (remover.length > 0) {
        const { error } = await supabase
          .from('campaign_access')
          .delete()
          .eq('profile_id', membro.id)
          .in('campaign_id', remover)
        if (error) throw error
      }
      if (upserts.length > 0) {
        const { error } = await supabase
          .from('campaign_access')
          .upsert(upserts, { onConflict: 'campaign_id,profile_id' })
        if (error) throw error
      }
      onFechar()
    } catch {
      setErro('Não foi possível salvar os acessos. Tente novamente.')
      setSalvando(false)
    }
  }

  // Campanhas criadas pelo próprio membro já são dele — não precisam de concessão
  const minhasDoMembro = campanhas.filter((c) => c.created_by === membro.id)
  const concedeveis = campanhas.filter((c) => c.created_by !== membro.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onFechar} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Acessos às campanhas</h2>
            <p className="text-sm text-gray-500">{membro.full_name || membro.email}</p>
          </div>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {erro && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{erro}</div>
          )}

          {carregando ? (
            <div className="py-10 text-center">
              <Spinner texto="Carregando campanhas…" />
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-gray-500">
                Marque as campanhas que este colaborador pode acessar e escolha o nível:
                <span className="font-medium text-gray-700"> Leitura</span> (só visualiza) ou
                <span className="font-medium text-gray-700"> Edição</span> (trabalha os leads).
              </p>
              <ul className="space-y-2">
                {concedeveis.map((c) => {
                  const marcado = !!acessos[c.id]
                  return (
                    <li key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={marcado}
                          onChange={() => alternar(c.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium text-gray-900">{c.name}</span>
                          {c.niche && <span className="block truncate text-xs text-gray-400">{c.niche}</span>}
                        </span>
                      </label>
                      {marcado && (
                        <select
                          value={acessos[c.id]}
                          onChange={(e) => mudarNivel(c.id, e.target.value as NivelAcesso)}
                          className="input max-w-32 py-1 text-xs"
                        >
                          <option value="edicao">Edição</option>
                          <option value="leitura">Leitura</option>
                        </select>
                      )}
                    </li>
                  )
                })}
                {concedeveis.length === 0 && (
                  <li className="rounded-lg border border-dashed border-gray-200 px-3 py-6 text-center text-sm text-gray-400">
                    Nenhuma campanha para conceder.
                  </li>
                )}
              </ul>

              {minhasDoMembro.length > 0 && (
                <p className="mt-4 text-xs text-gray-400">
                  Campanhas criadas por este colaborador (acesso automático):{' '}
                  {minhasDoMembro.map((c) => c.name).join(', ')}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button onClick={onFechar} className="btn-secondary">Cancelar</button>
          <button onClick={salvar} disabled={salvando || carregando} className="btn-primary">
            {salvando ? <Spinner /> : <Check size={16} />} Salvar acessos
          </button>
        </div>
      </div>
    </div>
  )
}
