import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import Spinner from '../components/Spinner'

export default function RedefinirSenha() {
  const { redefinirSenha } = useAuth()
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [carregando, setCarregando] = useState(false)

  async function enviar() {
    setErro(null)
    if (senha.length < 6) {
      setErro('A senha precisa ter no mínimo 6 caracteres.')
      return
    }
    if (senha !== confirmar) {
      setErro('As senhas não conferem.')
      return
    }
    setCarregando(true)
    const { erro } = await redefinirSenha(senha)
    setCarregando(false)
    if (erro) setErro(erro)
    else setPronto(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-900 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <p className="text-2xl font-bold text-brand-900">MapeIA</p>
          <p className="mt-1 text-sm text-gray-500">Definir uma nova senha</p>
        </div>

        {pronto ? (
          <div className="space-y-4 text-center">
            <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Senha alterada com sucesso!
            </div>
            <a href="/" className="btn-primary w-full">
              Ir para o CRM
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nova senha</label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="input"
                placeholder="••••••••"
                autoFocus
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Confirmar nova senha</label>
              <input
                type="password"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && enviar()}
                className="input"
                placeholder="••••••••"
              />
            </div>

            {erro && <p className="text-sm text-red-600">{erro}</p>}

            <button onClick={enviar} disabled={carregando} className="btn-primary w-full">
              {carregando ? <Spinner /> : 'Salvar nova senha'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
