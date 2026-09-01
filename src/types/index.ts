export type Prioridade = 'Alta' | 'Média' | 'Baixa'

export type StatusFunil =
  | 'a_contatar'
  | 'dia_1'
  | 'dia_2'
  | 'dia_3'
  | 'dia_4'
  | 'dia_5'
  | 'dia_6'
  | 'dia_7'
  | 'respondeu'
  | 'reuniao_marcada'
  | 'virou_cliente'
  | 'perdido'

export interface Organization {
  id: string
  name: string
  created_at: string
}

export interface Profile {
  id: string
  org_id: string
  email: string
  full_name: string | null
  role: 'admin' | 'member'
}

export interface Localidade {
  id: string
  nome: string
  uf: string | null
  pais: string
  /** Variações do nome (Brasilia, BSB, DF, Distrito Federal) */
  apelidos: string[]
  /** Códigos de área que confirmam a região pelo telefone (ex.: 61) */
  ddds: string[]
  /** Bairros/regiões que também contam como a cidade (ex.: Samambaia) */
  bairros: string[]
  created_at?: string
}

export type TipoCampanha = 'google' | 'instagram' | 'linkedin'

export interface Campaign {
  id: string
  org_id: string
  name: string
  niche: string | null
  tipo: TipoCampanha
  status: 'active' | 'archived'
  created_by: string | null
  created_at: string
}

export interface Lead {
  id: string
  campaign_id: string
  org_id: string
  nome_empresa: string
  telefone: string | null
  whatsapp: string | null
  website: string | null
  endereco: string | null
  bairro: string | null
  cidade: string | null
  nota_gmn: number | null
  itens_faltando_gmn: string | null
  argumento_vendas: string | null
  prioridade: Prioridade | null
  status_funil: StatusFunil
  data_retorno: string | null
  hora_retorno: string | null
  data_primeiro_contato: string | null
  notas: string | null
  responsavel_id: string | null
  link_gmn: string | null
  categoria_gmn: string | null
  total_avaliacoes: number | null
  cargo: string | null
  empresa_atual: string | null
  email: string | null
  created_at: string
  updated_at: string
}

export interface Activity {
  id: string
  lead_id: string
  org_id: string
  user_id: string | null
  tipo: string
  descricao: string
  created_at: string
  profiles?: { full_name: string | null; email: string } | null
}

export type NivelAcesso = 'leitura' | 'edicao'

export interface CampaignAccess {
  id: string
  campaign_id: string
  profile_id: string
  nivel: NivelAcesso
  created_at: string
}

export interface CampaignMetrics {
  total: number
  contatados: number
  negociacao: number
  fechados: number
}

/** Linha esperada no CSV de importação */
export interface CsvLeadRow {
  nome_empresa: string
  telefone?: string
  whatsapp?: string
  website?: string
  endereco?: string
  bairro?: string
  cidade?: string
  nota_gmn?: string
  itens_faltando_gmn?: string
  argumento_vendas?: string
  prioridade?: string
}
