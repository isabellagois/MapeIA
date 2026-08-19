/**
 * Base de localidades + lógica de filtro por localização das buscas.
 *
 * A base fica na tabela `localidades` (compartilhada; só admin edita).
 * O filtro decide se um perfil "é" da cidade/país pedido, cruzando:
 *   - DDD do telefone   (resolve "Dentista Samambaia" sem precisar da bio)
 *   - DDI do telefone    (para o escopo País)
 *   - termos na bio/nome (cidade, apelidos e bairros)
 */

import { supabase } from './supabase'
import type { Localidade } from '../types'

export type { Localidade }

/** Países suportados no escopo "País" (nome → DDI). Editável conforme a necessidade. */
export const PAISES_DDI: { nome: string; ddi: string }[] = [
  { nome: 'Brasil', ddi: '55' },
  { nome: 'Portugal', ddi: '351' },
  { nome: 'Estados Unidos', ddi: '1' },
  { nome: 'Argentina', ddi: '54' },
  { nome: 'Espanha', ddi: '34' },
  { nome: 'México', ddi: '52' },
  { nome: 'Chile', ddi: '56' },
  { nome: 'Colômbia', ddi: '57' },
]

/** Remove acentos e baixa a caixa, para comparar textos de forma tolerante. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

/** Só os dígitos de um telefone. */
function digitos(tel: string | null | undefined): string {
  return (tel ?? '').replace(/\D/g, '')
}

// ------------------------------------------------------------
// CRUD
// ------------------------------------------------------------

export async function listarLocalidades(): Promise<Localidade[]> {
  const { data, error } = await supabase.from('localidades').select('*').order('nome')
  if (error) throw error
  return (data as Localidade[]) ?? []
}

export type LocalidadeInput = Omit<Localidade, 'id' | 'created_at'>

export async function criarLocalidade(l: LocalidadeInput): Promise<Localidade> {
  const { data, error } = await supabase.from('localidades').insert(l).select().single()
  if (error) throw error
  return data as Localidade
}

export async function atualizarLocalidade(id: string, patch: Partial<LocalidadeInput>): Promise<void> {
  const { error } = await supabase.from('localidades').update(patch).eq('id', id)
  if (error) throw error
}

export async function removerLocalidade(id: string): Promise<void> {
  const { error } = await supabase.from('localidades').delete().eq('id', id)
  if (error) throw error
}

// ------------------------------------------------------------
// Filtro de localização
// ------------------------------------------------------------

export interface FiltroLocal {
  escopo: 'cidade' | 'pais'
  /** Escopo cidade: termos aceitos (nome, apelidos, bairros, extras) */
  termos: string[]
  /** Escopo cidade: DDDs que confirmam a região */
  ddds: string[]
  /** Escopo país: DDI do país alvo (ex.: "55") */
  ddiAlvo?: string
}

/** Dados de um perfil relevantes para o filtro. */
export interface PerfilLocalizavel {
  telefone: string | null
  nome: string | null
  username?: string | null
  bio?: string | null
  endereco?: string | null
}

/** O telefone começa com um dos DDDs informados (tolerando o 55 do Brasil e o 0 inicial)? */
export function telefoneTemDDD(telefone: string | null | undefined, ddds: string[]): boolean {
  const d = digitos(telefone)
  if (!d || ddds.length === 0) return false
  let nac = d
  if (nac.startsWith('55') && nac.length >= 12) nac = nac.slice(2) // tira DDI do Brasil
  if (nac.startsWith('0')) nac = nac.replace(/^0+/, '') // tira zeros de operadora
  return ddds.some((ddd) => nac.startsWith(ddd))
}

/**
 * Classifica o país de um telefone pelo DDI, para o escopo "País".
 * Retorna 'alvo' (é do país pedido), 'outro' (é de outro país conhecido)
 * ou 'desconhecido' (sem telefone ou não deu para identificar).
 *
 * Só interpreta o DDI quando o número está em formato internacional (começa
 * com "+"). Um número nacional (ex.: "(11) 99999-9999") NÃO é tratado como
 * estrangeiro — senão DDDs como 11 seriam confundidos com o DDI +1 dos EUA.
 */
export function classificarPais(
  telefone: string | null | undefined,
  ddiAlvo: string,
  ddisConhecidos: string[]
): 'alvo' | 'outro' | 'desconhecido' {
  const d = digitos(telefone)
  if (!d) return 'desconhecido'

  const internacional = (telefone ?? '').trim().startsWith('+')
  if (!internacional) {
    // Número nacional/sem DDI: só dá para presumir o Brasil quando o alvo é o Brasil.
    return ddiAlvo === '55' ? 'alvo' : 'desconhecido'
  }

  if (d.startsWith(ddiAlvo)) return 'alvo'
  // DDIs mais longos primeiro (351 antes de 3) para não casar por engano
  const outros = ddisConhecidos.filter((x) => x !== ddiAlvo).sort((a, b) => b.length - a.length)
  if (outros.some((ddi) => d.startsWith(ddi))) return 'outro'
  return 'desconhecido'
}

/**
 * Decide se um perfil passa no filtro de localização.
 *
 * Escopo cidade: entra se o DDD bater OU algum termo (cidade/apelido/bairro)
 * aparecer no nome/@usuário/bio/endereço. Caso contrário, é descartado.
 *
 * Escopo país: entra se o DDI for do país alvo OU não der para identificar
 * (sem telefone / DDI desconhecido). Só é descartado quando o telefone
 * aponta claramente para OUTRO país.
 */
export function perfilPassaFiltro(perfil: PerfilLocalizavel, filtro: FiltroLocal): boolean {
  if (filtro.escopo === 'pais') {
    if (!filtro.ddiAlvo) return true
    const classe = classificarPais(
      perfil.telefone,
      filtro.ddiAlvo,
      PAISES_DDI.map((p) => p.ddi)
    )
    return classe !== 'outro'
  }

  // Escopo cidade
  if (telefoneTemDDD(perfil.telefone, filtro.ddds)) return true

  const alvo = normalizar(
    [perfil.nome, perfil.username, perfil.bio, perfil.endereco].filter(Boolean).join(' ')
  )
  if (!alvo) return false
  return filtro.termos.some((t) => {
    const n = normalizar(t)
    return n.length > 0 && alvo.includes(n)
  })
}
