import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { BellRing, LayoutDashboard, LogOut, MapPin, Megaphone, Menu, Users, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { hojeISO } from '../lib/utils'

export default function Layout() {
  const { profile, sair } = useAuth()
  const [menuAberto, setMenuAberto] = useState(false)
  const [qtdRetornos, setQtdRetornos] = useState(0)

  // Contagem de leads com retorno vencido (badge no menu)
  useEffect(() => {
    let ativo = true
    async function carregar() {
      const { count } = await supabase
        .from('leads')
        .select('id', { count: 'exact', head: true })
        .lte('data_retorno', hojeISO())
        .not('status_funil', 'in', '(fechado,descartado)')
      if (ativo) setQtdRetornos(count ?? 0)
    }
    carregar()
    const intervalo = setInterval(carregar, 60_000)
    // Recarrega quando qualquer página avisar que mudou um lead
    const handler = () => carregar()
    window.addEventListener('leads-atualizados', handler)
    return () => {
      ativo = false
      clearInterval(intervalo)
      window.removeEventListener('leads-atualizados', handler)
    }
  }, [])

  const itemClasse = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
      isActive ? 'bg-brand-700 text-white' : 'text-brand-100 hover:bg-brand-800 hover:text-white'
    }`

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      <NavLink to="/" end className={itemClasse} onClick={() => setMenuAberto(false)}>
        <LayoutDashboard size={18} /> Dashboard
      </NavLink>
      <NavLink to="/campanhas" className={itemClasse} onClick={() => setMenuAberto(false)}>
        <Megaphone size={18} /> Campanhas
      </NavLink>
      <NavLink to="/retornos" className={itemClasse} onClick={() => setMenuAberto(false)}>
        <span className="relative">
          <BellRing size={18} />
          {qtdRetornos > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
              {qtdRetornos > 99 ? '99+' : qtdRetornos}
            </span>
          )}
        </span>
        <span className="ml-1">Para contatar</span>
      </NavLink>
      <NavLink to="/equipe" className={itemClasse} onClick={() => setMenuAberto(false)}>
        <Users size={18} /> Equipe
      </NavLink>
      {profile?.role === 'admin' && (
        <NavLink to="/localidades" className={itemClasse} onClick={() => setMenuAberto(false)}>
          <MapPin size={18} /> Localidades
        </NavLink>
      )}
    </nav>
  )

  const rodape = (
    <div className="border-t border-brand-800 px-4 py-4">
      <p className="truncate text-sm font-medium text-white">
        {profile?.full_name || profile?.email}
      </p>
      <p className="truncate text-xs text-brand-200">{profile?.email}</p>
      <button
        onClick={sair}
        className="mt-3 flex items-center gap-2 text-sm text-brand-200 transition hover:text-white"
      >
        <LogOut size={16} /> Sair
      </button>
    </div>
  )

  return (
    <div className="flex min-h-screen">
      {/* Sidebar desktop */}
      <aside className="hidden w-60 flex-col bg-brand-900 py-5 md:flex">
        <div className="mb-6 px-6">
          <p className="text-lg font-bold text-white">MapeIA</p>
          <p className="text-xs text-brand-200">Google Meu Negócio</p>
        </div>
        {nav}
        {rodape}
      </aside>

      {/* Topo + menu mobile */}
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 md:hidden">
          <p className="font-bold text-brand-900">MapeIA</p>
          <button
            onClick={() => setMenuAberto(true)}
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100"
            aria-label="Abrir menu"
          >
            <span className="relative">
              <Menu size={22} />
              {qtdRetornos > 0 && (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500" />
              )}
            </span>
          </button>
        </header>

        {menuAberto && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMenuAberto(false)} />
            <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-brand-900 py-5">
              <div className="mb-6 flex items-center justify-between px-5">
                <p className="text-lg font-bold text-white">MapeIA</p>
                <button onClick={() => setMenuAberto(false)} className="text-brand-200" aria-label="Fechar menu">
                  <X size={20} />
                </button>
              </div>
              {nav}
              {rodape}
            </aside>
          </div>
        )}

        <main className="flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** Dispara o evento global que atualiza o badge de retornos */
export function notificarLeadsAtualizados() {
  window.dispatchEvent(new Event('leads-atualizados'))
}

