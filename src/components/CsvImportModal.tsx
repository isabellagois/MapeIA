import { useRef, useState } from 'react'
import { FileUp, Upload, X } from 'lucide-react'
import type { CsvLeadRow } from '../types'
import { supabase } from '../lib/supabase'
import {
  normalizarNota,
  normalizarPrioridade,
  parseCsvLeads,
  separarDuplicatas,
  type ResultadoParse,
} from '../lib/csv'
import { chaveTelefone } from '../lib/utils'
import Spinner from './Spinner'
import { notificarLeadsAtualizados } from './Layout'

interface Props {
  campaignId: string
  orgId: string
  aberto: boolean
  onFechar: () => void
  onImportado: (qtd: number) => void
}

type Etapa = 'arquivo' | 'preview' | 'importando' | 'concluido'

export default function CsvImportModal({ campaignId, orgId, aberto, onFechar, onImportado }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [etapa, setEtapa] = useState<Etapa>('arquivo')
  const [parse, setParse] = useState<ResultadoParse | null>(null)
  const [novas, setNovas] = useState<CsvLeadRow[]>([])
  const [duplicadas, setDuplicadas] = useState<CsvLeadRow[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [progresso, setProgresso] = useState(0)
  const [qtdImportada, setQtdImportada] = useState(0)
  const [analisando, setAnalisando] = useState(false)

  function reset() {
    setEtapa('arquivo')
    setParse(null)
    setNovas([])
    setDuplicadas([])
    setErro(null)
    setProgresso(0)
    setQtdImportada(0)
  }

  function fechar() {
    reset()
    onFechar()
  }

  async function aoEscolherArquivo(file: File | undefined) {
    if (!file) return
    setErro(null)
    setAnalisando(true)
    try {
      const resultado = await parseCsvLeads(file)
      if (resultado.erros.length > 0) {
        setErro(resultado.erros.join(' '))
        setAnalisando(false)
        return
      }
      if (resultado.linhas.length === 0) {
        setErro('O arquivo não contém nenhuma linha de lead válida.')
        setAnalisando(false)
        return
      }

      // Busca telefones já existentes na campanha para pular duplicatas
      const { data: existentes, error } = await supabase
        .from('leads')
        .select('telefone, whatsapp')
        .eq('campaign_id', campaignId)
      if (error) throw error

      const telefones = new Set<string>()
      for (const l of existentes ?? []) {
        const t1 = chaveTelefone(l.telefone)
        const t2 = chaveTelefone(l.whatsapp)
        if (t1) telefones.add(t1)
        if (t2) telefones.add(t2)
      }

      const { novas: n, duplicadas: d } = separarDuplicatas(resultado.linhas, telefones)
      setParse(resultado)
      setNovas(n)
      setDuplicadas(d)
      setEtapa('preview')
    } catch (e) {
      setErro('Não consegui ler o arquivo. Confirme que é um CSV válido com cabeçalho na primeira linha.')
    } finally {
      setAnalisando(false)
    }
  }

  async function confirmarImportacao() {
    setEtapa('importando')
    setErro(null)
    const TAMANHO_LOTE = 200
    let inseridos = 0

    try {
      const { data: userData } = await supabase.auth.getUser()
      for (let i = 0; i < novas.length; i += TAMANHO_LOTE) {
        const lote = novas.slice(i, i + TAMANHO_LOTE).map((l) => ({
          campaign_id: campaignId,
          org_id: orgId,
          nome_empresa: l.nome_empresa,
          telefone: l.telefone ?? null,
          whatsapp: l.whatsapp ?? null,
          website: l.website ?? null,
          endereco: l.endereco ?? null,
          cidade: l.cidade ?? null,
          nota_gmn: normalizarNota(l.nota_gmn),
          itens_faltando_gmn: l.itens_faltando_gmn ?? null,
          argumento_vendas: l.argumento_vendas ?? null,
          prioridade: normalizarPrioridade(l.prioridade),
        }))
        const { error } = await supabase.from('leads').insert(lote)
        if (error) throw error
        inseridos += lote.length
        setProgresso(Math.round((inseridos / novas.length) * 100))
      }

      // Registra a importação no histórico (uma atividade resumo por campanha não tem lead_id,
      // então registramos apenas a contagem na própria UI)
      void userData
      setQtdImportada(inseridos)
      setEtapa('concluido')
      notificarLeadsAtualizados()
      onImportado(inseridos)
    } catch (e) {
      setErro('Erro ao importar os leads. Nada além do que foi mostrado na barra de progresso foi salvo. Tente novamente.')
      setEtapa('preview')
    }
  }

  if (!aberto) return null

  const colunas = parse?.colunasEncontradas ?? {}

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={fechar} />
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">Importar CSV de leads</h2>
          <button onClick={fechar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {erro && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {erro}
            </div>
          )}

          {etapa === 'arquivo' && (
            <div>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={analisando}
                className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-gray-300 px-6 py-12 text-gray-500 transition hover:border-brand-500 hover:text-brand-600"
              >
                {analisando ? (
                  <Spinner texto="Analisando arquivo…" />
                ) : (
                  <>
                    <FileUp size={32} />
                    <span className="font-medium">Clique para escolher o arquivo CSV</span>
                    <span className="text-xs text-gray-400">
                      Colunas esperadas: nome_empresa, telefone, whatsapp, website, endereco, cidade,
                      nota_gmn, itens_faltando_gmn, argumento_vendas, prioridade
                    </span>
                  </>
                )}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => aoEscolherArquivo(e.target.files?.[0])}
              />
            </div>
          )}

          {etapa === 'preview' && parse && (
            <div>
              {/* Resumo */}
              <div className="mb-4 grid grid-cols-3 gap-3">
                <ResumoCard valor={parse.linhas.length} rotulo="linhas no arquivo" cor="text-gray-900" />
                <ResumoCard valor={novas.length} rotulo="novos leads" cor="text-green-700" />
                <ResumoCard valor={duplicadas.length} rotulo="duplicatas (serão puladas)" cor="text-amber-600" />
              </div>

              {/* Mapeamento de colunas */}
              <div className="mb-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                <p className="mb-1 font-semibold text-gray-700">Mapeamento automático de colunas</p>
                <p>
                  {Object.entries(colunas)
                    .map(([campo, original]) => `${original} → ${campo}`)
                    .join(' · ')}
                </p>
                {parse.colunasIgnoradas.length > 0 && (
                  <p className="mt-1 text-gray-400">
                    Ignoradas: {parse.colunasIgnoradas.join(', ')}
                  </p>
                )}
              </div>

              {/* Preview das 10 primeiras */}
              <p className="mb-2 text-sm font-medium text-gray-700">
                Pré-visualização (primeiros 10 leads novos)
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2">Empresa</th>
                      <th className="px-3 py-2">Telefone</th>
                      <th className="px-3 py-2">Cidade</th>
                      <th className="px-3 py-2">Nota</th>
                      <th className="px-3 py-2">Prioridade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {novas.slice(0, 10).map((l, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="max-w-52 truncate px-3 py-2 font-medium text-gray-800">{l.nome_empresa}</td>
                        <td className="px-3 py-2 text-gray-600">{l.telefone || l.whatsapp || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{l.cidade || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{l.nota_gmn || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{l.prioridade || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {etapa === 'importando' && (
            <div className="py-8 text-center">
              <Spinner texto={`Importando leads… ${progresso}%`} />
              <div className="mx-auto mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full bg-brand-600 transition-all"
                  style={{ width: `${progresso}%` }}
                />
              </div>
            </div>
          )}

          {etapa === 'concluido' && (
            <div className="py-8 text-center">
              <p className="text-2xl">🎉</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {qtdImportada} leads importados com sucesso
              </p>
              {duplicadas.length > 0 && (
                <p className="mt-1 text-sm text-gray-500">
                  {duplicadas.length} duplicatas foram puladas (telefone já existente).
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          {etapa === 'preview' && (
            <>
              <button onClick={reset} className="btn-secondary">
                Escolher outro arquivo
              </button>
              <button
                onClick={confirmarImportacao}
                disabled={novas.length === 0}
                className="btn-primary"
              >
                <Upload size={16} /> Confirmar importação ({novas.length})
              </button>
            </>
          )}
          {(etapa === 'arquivo' || etapa === 'concluido') && (
            <button onClick={fechar} className="btn-secondary">
              {etapa === 'concluido' ? 'Concluir' : 'Cancelar'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ResumoCard({ valor, rotulo, cor }: { valor: number; rotulo: string; cor: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-4 py-3 text-center">
      <p className={`text-2xl font-bold ${cor}`}>{valor}</p>
      <p className="text-xs text-gray-500">{rotulo}</p>
    </div>
  )
}
