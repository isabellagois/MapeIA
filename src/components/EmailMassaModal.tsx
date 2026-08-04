import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Eye, Mail, Send, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Lead } from '../types'
import Spinner from './Spinner'

interface Props {
  leads: Lead[] // leads já filtrados na tela da campanha
  aberto: boolean
  onFechar: () => void
  onEnviado: () => void
}

type Etapa = 'edicao' | 'enviando' | 'concluido'

/**
 * Apelidos disponíveis no template -> coluna real do lead.
 * Precisa ser idêntico ao mapa em api/enviar-emails.ts.
 */
const APELIDOS: Record<string, keyof Lead> = {
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

/** Marcadores oferecidos como botões (apelido + descrição) */
const VARIAVEIS = [
  { chave: 'nome', rotulo: 'Nome da empresa' },
  { chave: 'bairro', rotulo: 'Bairro' },
  { chave: 'cidade', rotulo: 'Cidade' },
  { chave: 'endereco', rotulo: 'Endereço' },
  { chave: 'website', rotulo: 'Website' },
  { chave: 'cargo', rotulo: 'Cargo (LinkedIn)' },
  { chave: 'argumento', rotulo: 'Argumento de vendas' },
] as const

function preencherTemplate(texto: string, lead: Lead): string {
  return texto.replace(/\[\s*(\w+)\s*\]/g, (original, apelido: string) => {
    const coluna = APELIDOS[apelido.toLowerCase()]
    if (!coluna) return original
    const valor = lead[coluna]
    return typeof valor === 'string' || typeof valor === 'number' ? String(valor) : ''
  })
}

export default function EmailMassaModal({ leads, aberto, onFechar, onEnviado }: Props) {
  const [assunto, setAssunto] = useState('')
  const [corpo, setCorpo] = useState('')
  const [etapa, setEtapa] = useState<Etapa>('edicao')
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ enviados: number; semEmail: number; falhas: string[] } | null>(null)
  const [mostrarPreview, setMostrarPreview] = useState(false)

  const comEmail = useMemo(() => leads.filter((l) => l.email && l.email.includes('@')), [leads])
  const exemplo = comEmail[0] ?? null

  function reset() {
    setEtapa('edicao')
    setErro(null)
    setResultado(null)
    setMostrarPreview(false)
  }

  function fechar() {
    if (etapa === 'enviando') return
    reset()
    onFechar()
  }

  function inserirVariavel(chave: string) {
    setCorpo((prev) => `${prev}[${chave}]`)
  }

  async function enviar() {
    setErro(null)
    if (!assunto.trim() || !corpo.trim()) {
      setErro('Preencha o assunto e o corpo do e-mail.')
      return
    }
    if (comEmail.length === 0) {
      setErro('Nenhum lead da seleção atual tem e-mail cadastrado.')
      return
    }
    const ok = window.confirm(
      `Enviar este e-mail para ${comEmail.length} ${comEmail.length === 1 ? 'lead' : 'leads'}?\n\nO envio não pode ser desfeito.`
    )
    if (!ok) return

    setEtapa('enviando')
    try {
      const { data: sessao } = await supabase.auth.getSession()
      const token = sessao.session?.access_token
      if (!token) throw new Error('Sessão expirada. Faça login novamente.')

      const resp = await fetch('/api/enviar-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          leadIds: comEmail.map((l) => l.id),
          assunto: assunto.trim(),
          corpo: corpo.trim(),
        }),
      })
      const dados = await resp.json()
      if (!resp.ok) throw new Error(dados.erro ?? 'Falha no envio.')
      setResultado(dados)
      setEtapa('concluido')
      onEnviado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar. Tente novamente.')
      setEtapa('edicao')
    }
  }

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={fechar}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <Mail size={18} className="text-brand-600" /> Criar campanha de e-mail
          </h2>
          <button onClick={fechar} className="text-gray-400 hover:text-gray-600" disabled={etapa === 'enviando'}>
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {etapa === 'concluido' && resultado ? (
            <div className="py-6 text-center">
              <CheckCircle2 size={40} className="mx-auto mb-3 text-green-500" />
              <p className="text-lg font-semibold text-gray-900">
                {resultado.enviados} {resultado.enviados === 1 ? 'e-mail enviado' : 'e-mails enviados'}
              </p>
              {resultado.semEmail > 0 && (
                <p className="mt-1 text-sm text-gray-500">
                  {resultado.semEmail} {resultado.semEmail === 1 ? 'lead ignorado' : 'leads ignorados'} por não ter e-mail.
                </p>
              )}
              {resultado.falhas.length > 0 && (
                <p className="mt-2 text-sm text-red-600">
                  Falha ao enviar para: {resultado.falhas.slice(0, 5).join(', ')}
                  {resultado.falhas.length > 5 && ` e mais ${resultado.falhas.length - 5}`}
                </p>
              )}
              <button onClick={fechar} className="btn-primary mx-auto mt-5">
                Fechar
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-800">
                O e-mail será enviado para os <strong>{comEmail.length}</strong> leads da seleção atual que têm
                e-mail cadastrado
                {leads.length !== comEmail.length && (
                  <> ({leads.length - comEmail.length} sem e-mail serão ignorados)</>
                )}
                . Os filtros da tela são respeitados.
              </div>

              {comEmail.length === 0 && (
                <div className="mb-4 flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  Nenhum lead da seleção atual tem e-mail. Preencha o campo e-mail nos leads (ou ajuste os
                  filtros) antes de disparar.
                </div>
              )}

              <label className="mb-1 block text-sm font-medium text-gray-700">Assunto</label>
              <input
                value={assunto}
                onChange={(e) => setAssunto(e.target.value)}
                placeholder="Ex.: [nome], encontramos oportunidades para vocês"
                className="input mb-4"
                disabled={etapa === 'enviando'}
              />

              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Mensagem</label>
                <div className="flex flex-wrap gap-1">
                  {VARIAVEIS.map((v) => (
                    <button
                      key={v.chave}
                      type="button"
                      onClick={() => inserirVariavel(v.chave)}
                      title={v.rotulo}
                      className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600 hover:bg-brand-50 hover:text-brand-700"
                      disabled={etapa === 'enviando'}
                    >
                      {`[${v.chave}]`}
                    </button>
                  ))}
                </div>
              </div>
              <textarea
                value={corpo}
                onChange={(e) => setCorpo(e.target.value)}
                rows={8}
                placeholder={'Olá, equipe da [nome]!\n\nEscreva aqui sua mensagem…'}
                className="input mb-3 font-normal"
                disabled={etapa === 'enviando'}
              />

              {exemplo && (assunto.trim() || corpo.trim()) && (
                <div className="mb-3">
                  <button
                    type="button"
                    onClick={() => setMostrarPreview((v) => !v)}
                    className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    <Eye size={14} /> {mostrarPreview ? 'Ocultar prévia' : `Ver prévia (${exemplo.nome_empresa})`}
                  </button>
                  {mostrarPreview && (
                    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm">
                      <p className="mb-1 font-semibold text-gray-900">
                        {preencherTemplate(assunto, exemplo) || <span className="text-gray-400">(sem assunto)</span>}
                      </p>
                      <p className="whitespace-pre-wrap text-gray-700">{preencherTemplate(corpo, exemplo)}</p>
                    </div>
                  )}
                </div>
              )}

              {erro && <p className="mb-3 text-sm text-red-600">{erro}</p>}
            </>
          )}
        </div>

        {etapa !== 'concluido' && (
          <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
            <button onClick={fechar} className="btn-secondary" disabled={etapa === 'enviando'}>
              Cancelar
            </button>
            <button
              onClick={enviar}
              disabled={etapa === 'enviando' || comEmail.length === 0}
              className="btn-primary"
            >
              {etapa === 'enviando' ? <Spinner /> : <Send size={16} />}
              {etapa === 'enviando'
                ? 'Enviando…'
                : `Enviar para ${comEmail.length} ${comEmail.length === 1 ? 'lead' : 'leads'}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
