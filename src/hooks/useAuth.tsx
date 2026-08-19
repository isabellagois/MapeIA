import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types'

interface AuthContextValue {
  session: Session | null
  profile: Profile | null
  carregando: boolean
  /** true quando o usuário chegou por um link de recuperação de senha */
  modoRecuperacao: boolean
  entrar: (email: string, senha: string) => Promise<{ erro: string | null }>
  cadastrar: (email: string, senha: string, nome: string, orgName: string, orgIdConvite?: string) => Promise<{ erro: string | null }>
  recuperarSenha: (email: string) => Promise<{ erro: string | null }>
  redefinirSenha: (novaSenha: string) => Promise<{ erro: string | null }>
  sair: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [modoRecuperacao, setModoRecuperacao] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setCarregando(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evento, novaSession) => {
      // Link de recuperação: o Supabase cria uma sessão temporária e dispara
      // este evento. Marcamos o modo para exibir a tela de nova senha.
      if (evento === 'PASSWORD_RECOVERY') setModoRecuperacao(true)
      setSession(novaSession)
      if (!novaSession) {
        setProfile(null)
        setCarregando(false)
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session?.user) return
    let ativo = true
    ;(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      if (ativo) {
        setProfile((data as Profile) ?? null)
        setCarregando(false)
      }
    })()
    return () => {
      ativo = false
    }
  }, [session?.user?.id])

  async function entrar(email: string, senha: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    return { erro: error ? traduzirErro(error.message) : null }
  }

  async function cadastrar(email: string, senha: string, nome: string, orgName: string, orgIdConvite?: string) {
    const { error } = await supabase.auth.signUp({
      email,
      password: senha,
      options: {
        data: orgIdConvite
          ? { full_name: nome, org_id: orgIdConvite }
          : { full_name: nome, org_name: orgName },
      },
    })
    return { erro: error ? traduzirErro(error.message) : null }
  }

  async function recuperarSenha(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    })
    return { erro: error ? traduzirErro(error.message) : null }
  }

  async function redefinirSenha(novaSenha: string) {
    const { error } = await supabase.auth.updateUser({ password: novaSenha })
    if (!error) setModoRecuperacao(false)
    return { erro: error ? traduzirErro(error.message) : null }
  }

  async function sair() {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider
      value={{ session, profile, carregando, modoRecuperacao, entrar, cadastrar, recuperarSenha, redefinirSenha, sair }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return ctx
}

function traduzirErro(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.'
  if (msg.includes('Email not confirmed')) return 'Confirme seu e-mail antes de entrar (verifique a caixa de entrada).'
  if (msg.includes('User already registered')) return 'Este e-mail já está cadastrado. Faça login.'
  if (msg.includes('Password should be at least')) return 'A senha precisa ter no mínimo 6 caracteres.'
  if (msg.includes('New password should be different')) return 'A nova senha precisa ser diferente da anterior.'
  if (msg.includes('Auth session missing') || msg.includes('session_not_found'))
    return 'O link de recuperação expirou ou já foi usado. Peça um novo em "Esqueci minha senha".'
  if (msg.toLowerCase().includes('rate limit')) return 'Muitas tentativas. Aguarde alguns minutos e tente de novo.'
  return 'Erro: ' + msg
}
