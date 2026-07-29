import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import Spinner from '../components/Spinner'

export default function Login() {
  const { entrar, cadastrar } = useAuth()
  const orgIdConvite = new URLSearchParams(window.location.search).get('convite')
  const [modo, setModo] = useState<'login' | 'cadastro'>(orgIdConvite ? 'cadastro' : 'login')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [nome, setNome] = useState('')
  const [orgName, setOrgName] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(false)

  async function enviar() {
    setErro(null)
    setAviso(null)
    if (!email || !senha) {
      setErro('Preencha e-mail e senha.')
      return
    }
    setCarregando(true)
    if (modo === 'login') {
      const { erro } = await entrar(email, senha)
      if (erro) setErro(erro)
    } else {
      if (!nome || (!orgName && !orgIdConvite)) {
        setErro(orgIdConvite ? 'Preencha seu nome.' : 'Preencha seu nome e o nome da empresa.')
        setCarregando(false)
        return
      }
      const { erro } = await cadastrar(email, senha, nome, orgName, orgIdConvite ?? undefined)
      if (erro) setErro(erro)
      else
        setAviso(
          'Conta criada! Se a confirmação de e-mail estiver ativada no Supabase, verifique sua caixa de entrada antes de entrar.'
        )
    }
    setCarregando(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-brand-900">MapeIA</p>
          <p className="mt-1 text-sm text-gray-500">Gestão de leads · Google Meu Negócio</p>
        </div>

        <div className="mb-5 grid grid-cols-2 rounded-lg bg-gray-100 p-1 text-sm font-medium">
          {(['login', 'cadastro'] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setModo(m)
                setErro(null)
                setAviso(null)
              }}
              className={`rounded-md py-1.5 transition ${
                modo === m ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500'
              }`}
            >
              {m === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {modo === 'cadastro' && orgIdConvite && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-800">
              Você foi convidada(o) para entrar em uma equipe. Crie sua conta abaixo para participar.
            </div>
          )}
          {modo === 'cadastro' && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Seu nome</label>
                <input value={nome} onChange={(e) => setNome(e.target.value)} className="input" placeholder="Isabella Soares" />
              </div>
              {!orgIdConvite && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Nome da empresa</label>
                  <input value={orgName} onChange={(e) => setOrgName(e.target.value)} className="input" placeholder="Motion Tecnologia" />
                </div>
              )}
            </>
          )}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="voce@empresa.com.br"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && enviar()}
              className="input"
              placeholder="••••••••"
            />
          </div>

          {erro && <p className="text-sm text-red-600">{erro}</p>}
          {aviso && <p className="text-sm text-green-700">{aviso}</p>}

          <button onClick={enviar} disabled={carregando} className="btn-primary w-full">
            {carregando ? <Spinner /> : modo === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </div>
      </div>
    </div>
  )
}

