/**
 * Função serverless (Vercel) para disparo de e-mails em massa via Resend.
 *
 * Segurança: o navegador nunca vê a chave do Resend. A requisição chega com o
 * token de sessão do Supabase e os leads são buscados com esse token, então as
 * policies de RLS continuam valendo (o usuário só envia para leads que enxerga).
 *
 * Variáveis de ambiente necessárias na Vercel:
 *  - RESEND_API_KEY      chave da conta Resend
 *  - EMAIL_REMETENTE     ex.: "MapeIA <contato@seudominio.com.br>" (domínio verificado no Resend)
 *  - VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (as mesmas já usadas no build)
 */
import { createClient } from '@supabase/supabase-js'

export const config = { maxDuration: 60 }

const RESEND_BATCH_URL = 'https://api.resend.com/emails/batch'
const LOTE_RESEND = 100 // máximo de e-mails por chamada do endpoint /batch
const PAUSA_ENTRE_LOTES_MS = 600 // plano gratuito do Resend permite 2 req/s

interface LeadEmail {
  id: string
  org_id: string
  nome_empresa: string
  email: string | null
  cidade: string | null
  endereco: string | null
  bairro: string | null
  website: string | null
  argumento_vendas: string | null
  cargo: string | null
  empresa_atual: string | null
}

/**
 * Apelidos usados no template -> coluna real do lead.
 * Precisa ser idêntico ao mapa em src/components/EmailMassaModal.tsx.
 */
const APELIDOS: Record<string, keyof LeadEmail> = {
  nome: 'nome_empresa',
  empresa: 'nome_empresa',
  bairro: 'bairro',
  cidade: 'cidade',
  endereco: 'endereco',
  website: 'website',
  site: 'website',
  cargo: 'cargo',
  empresa_atual: 'empresa_atual',
  argumento: 'argumento_vendas',
}

/** Substitui [campo] pelos dados do lead; campo vazio ou desconhecido vira string vazia */
function preencherTemplate(texto: string, lead: LeadEmail): string {
  return texto.replace(/\[\s*(\w+)\s*\]/g, (original, apelido: string) => {
    const coluna = APELIDOS[apelido.toLowerCase()]
    if (!coluna) return original // deixa [algo] desconhecido intacto
    const valor = lead[coluna]
    return typeof valor === 'string' || typeof valor === 'number' ? String(valor) : ''
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function POST(request: Request): Promise<Response> {
  const resendKey = process.env.RESEND_API_KEY
  const remetente = process.env.EMAIL_REMETENTE
  const supabaseUrl = process.env.VITE_SUPABASE_URL
  const supabaseAnon = process.env.VITE_SUPABASE_ANON_KEY
  if (!resendKey || !remetente) {
    return json(500, { erro: 'RESEND_API_KEY e EMAIL_REMETENTE precisam estar configuradas na Vercel.' })
  }
  if (!supabaseUrl || !supabaseAnon) {
    return json(500, { erro: 'Variáveis do Supabase ausentes no ambiente da função.' })
  }

  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return json(401, { erro: 'Não autenticado.' })

  let payload: { leadIds?: unknown; assunto?: unknown; corpo?: unknown }
  try {
    payload = await request.json()
  } catch {
    return json(400, { erro: 'Corpo da requisição inválido.' })
  }

  const leadIds = Array.isArray(payload.leadIds)
    ? payload.leadIds.filter((v): v is string => typeof v === 'string')
    : []
  const assunto = typeof payload.assunto === 'string' ? payload.assunto.trim() : ''
  const corpo = typeof payload.corpo === 'string' ? payload.corpo.trim() : ''

  if (leadIds.length === 0) return json(400, { erro: 'Nenhum lead selecionado.' })
  if (!assunto || !corpo) return json(400, { erro: 'Assunto e corpo são obrigatórios.' })
  if (leadIds.length > 2000) return json(400, { erro: 'Máximo de 2.000 leads por disparo.' })

  // Cliente Supabase agindo COMO o usuário logado (RLS aplicado)
  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  })

  const { data: userData, error: userErr } = await supabase.auth.getUser(token)
  if (userErr || !userData.user) return json(401, { erro: 'Sessão inválida ou expirada.' })

  // Busca os leads em lotes (limite de tamanho de URL do PostgREST)
  const leads: LeadEmail[] = []
  for (let i = 0; i < leadIds.length; i += 100) {
    const { data, error } = await supabase
      .from('leads')
      .select('id, org_id, nome_empresa, email, cidade, endereco, bairro, website, argumento_vendas, cargo, empresa_atual')
      .in('id', leadIds.slice(i, i + 100))
    if (error) return json(500, { erro: 'Falha ao buscar os leads.' })
    leads.push(...((data as LeadEmail[]) ?? []))
  }

  const comEmail = leads.filter((l) => l.email && l.email.includes('@'))
  if (comEmail.length === 0) return json(400, { erro: 'Nenhum dos leads selecionados tem e-mail.' })

  // Dispara em lotes pela API do Resend
  let enviados = 0
  const falhas: string[] = []
  for (let i = 0; i < comEmail.length; i += LOTE_RESEND) {
    const lote = comEmail.slice(i, i + LOTE_RESEND)
    const mensagens = lote.map((lead) => {
      const texto = preencherTemplate(corpo, lead)
      return {
        from: remetente,
        to: [lead.email as string],
        subject: preencherTemplate(assunto, lead),
        text: texto,
        html: escapeHtml(texto).replace(/\n/g, '<br>'),
      }
    })

    const resp = await fetch(RESEND_BATCH_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(mensagens),
    })

    if (resp.ok) {
      enviados += lote.length
      // Registra o envio no histórico de cada lead
      const atividades = lote.map((lead) => ({
        lead_id: lead.id,
        org_id: lead.org_id,
        user_id: userData.user.id,
        tipo: 'email',
        descricao: `E-mail enviado: "${preencherTemplate(assunto, lead)}"`,
      }))
      await supabase.from('activities').insert(atividades)
    } else {
      falhas.push(...lote.map((l) => l.nome_empresa))
    }

    if (i + LOTE_RESEND < comEmail.length) await dormir(PAUSA_ENTRE_LOTES_MS)
  }

  return json(200, {
    enviados,
    semEmail: leads.length - comEmail.length,
    falhas,
  })
}
