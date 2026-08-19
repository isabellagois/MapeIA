import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Layout from './components/Layout'
import Spinner from './components/Spinner'
import Login from './pages/Login'
import RedefinirSenha from './pages/RedefinirSenha'
import Dashboard from './pages/Dashboard'
import Campaigns from './pages/Campaigns'
import CampaignDetail from './pages/CampaignDetail'
import Retornos from './pages/Retornos'
import Equipe from './pages/Equipe'
import Localidades from './pages/Localidades'

export default function App() {
  const { session, carregando, modoRecuperacao } = useAuth()

  if (carregando) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Spinner texto="Carregando…" />
      </div>
    )
  }

  // Fluxo de recuperação de senha tem prioridade: o link de e-mail cria uma
  // sessão temporária, então precisamos interceptar antes das rotas normais.
  if (modoRecuperacao || window.location.pathname === '/redefinir-senha') {
    return <RedefinirSenha />
  }

  if (!session) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    )
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/campanhas" element={<Campaigns />} />
        <Route path="/campanhas/:id" element={<CampaignDetail />} />
        <Route path="/retornos" element={<Retornos />} />
        <Route path="/equipe" element={<Equipe />} />
        <Route path="/localidades" element={<Localidades />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
