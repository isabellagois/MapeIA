import { useMemo, useState } from 'react'
import { Plus, Save, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
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

/** Uma linha em edição na grade manual */
interface LinhaManual {
  nome_empresa: string
  telefone: string
  whatsapp: string
  bairro: string
  cidade: string
  website: string
  prioridade: string
}

function linhaVazia(): LinhaManual {
  return { nome_empresa: '', telefone: '', whatsapp: '', bairro: '', cidade: '', website: '', prioridade: '' }
}

type Etapa = 'edicao' | 'salvando' | 'concluido'

const LINHAS_INICIAIS = 3

export default function ManualLeadsModal({ campaignId, orgId, aberto, onFechar, onImportado }: Props) {
  const [linhas, setLinhas] = useState<LinhaManual[]>(() =>
    Array.from({ length: LINHAS_INICIAIS }, linhaVazia)
  )
  const [etapa, setEtapa] = useState<Etapa>('edicao')
  const [erro, setErro] = useState<string | null>(null)
  const [qtdSalva, setQtdSalva] = useState(0)
  const [qtdDuplicada, setQtdDuplicada] = useState(0)

  function reset() {
    setLinhas(Array.from({ length: LINHAS_INICIAIS }, linhaVazia))
    setEtapa('edicao')
    setErro(null)
    setQtdSalva(0)
    setQtdDuplicada(0)
  }

  function fechar() {
    reset()
    onFechar()
  }

  function atualizarCampo(indice: number, campo: keyof LinhaManual, valor: string) {
    setLinhas((prev) => prev.map((l, i) => (i === indice ? { ...l, [campo]: valor } : l)))
  }

  function adicionarLinha() {
    setLinhas((prev) => [...prev, linhaVazia()])
  }

  function removerLinha(indice: number) {
    setLinhas((prev) => (prev.length === 1 ? [linhaVazia()] : prev.filter((_, i) => i !== indice)))
  }

  // Linhas com nome preenchido são as que serão salvas
  const preenchidas = useMemo(
    () => linhas.filter((l) => l.nome_empresa.trim()),
    [linhas]
  )

  async function salvar() {
    setErro(null)

    if (preenchidas.length === 0) {
      setErro('Preencha pelo menos o nome de um contato para salvar.')
      return
    }

    setEtapa('salvando')
    try {
      // Busca telefones já existentes na campanha para pular duplicatas
      const { data: existentes, error: erroExistentes } = await supabase
        .from('leads')
        .select('telefone, whatsapp')
        .eq('campaign_id', campaignId)
      if (erroExistentes) throw erroExistentes

      const telefones = new Set<string>()
      for (const l of existentes ?? []) {
        const t1 = chaveTelefone(l.telefone)
        const t2 = chaveTelefone(l.whatsapp)
        if (t1) telefones.add(t1)
        if (t2) telefones.add(t2)
      }

      // Separa novos de duplicados (por telefone), deduplicando também dentro da própria lista
      const vistos = new Set<string>()
      const novos: LinhaManual[] = []
      let duplicados = 0
      for (const l of preenchidas) {
        const chave = chaveTelefone(l.telefone || l.whatsapp)
        if (chave && (telefones.has(chave) || vistos.has(chave))) {
          duplicados += 1
          continue
        }
        if (chave) vistos.add(chave)
        novos.push(l)
      }

      if (novos.length === 0) {
        setQtdSalva(0)
        setQtdDuplicada(duplicados)
        setEtapa('concluido')
        return
      }

      const registros = novos.map((l) => ({
        campaign_id: campaignId,
        org_id: orgId,
        nome_empresa: l.nome_empresa.trim(),
        telefone: l.telefone.trim() || null,
        whatsapp: l.whatsapp.trim() || null,
        website: l.website.trim() || null,
        bairro: l.bairro.trim() || null,
        cidade: l.cidade.trim() || null,
        prioridade: (l.prioridade || null) as 'Alta' | 'Média' | 'Baixa' | null,
      }))

      const TAMANHO_LOTE = 200
      let inseridos = 0
      for (let i = 0; i < registros.length; i += TAMANHO_LOTE) {
        const lote = registros.slice(i, i + TAMANHO_LOTE)
        const { error } = await supabase.from('leads').insert(lote)
        if (error) throw error
        inseridos += lote.length
      }

      setQtdSalva(inseridos)
      setQtdDuplicada(duplicados)
      setEtapa('concluido')
      notificarLeadsAtualizados()
      onImportado(inseridos)
    } catch {
      setErro('Não foi possível salvar os contatos. Verifique sua conexão e tente novamente.')
      setEtapa('edicao')
    }
  }

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={fechar} />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">Adicionar contatos manualmente</h2>
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

          {etapa === 'concluido' ? (
            <div className="py-8 text-center">
              <p className="text-2xl">🎉</p>
              <p className="mt-2 text-lg font-semibold text-gray-900">
                {qtdSalva} {qtdSalva === 1 ? 'contato adicionado' : 'contatos adicionados'} com sucesso
              </p>
              {qtdDuplicada > 0 && (
                <p className="mt-1 text-sm text-gray-500">
                  {qtdDuplicada} {qtdDuplicada === 1 ? 'contato foi pulado' : 'contatos foram pulados'} (telefone já
                  existente na campanha).
                </p>
              )}
            </div>
          ) : (
            <>
              <p className="mb-3 text-sm text-gray-500">
                Preencha uma linha por contato. Apenas o nome é obrigatório — os demais campos são opcionais.
                Contatos com telefone já cadastrado na campanha são pulados automaticamente.
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-3 py-2 font-medium">
                        Nome da empresa <span className="text-red-500">*</span>
                      </th>
                      <th className="px-3 py-2 font-medium">Telefone</th>
                      <th className="px-3 py-2 font-medium">WhatsApp</th>
                      <th className="px-3 py-2 font-medium">Bairro</th>
                      <th className="px-3 py-2 font-medium">Cidade</th>
                      <th className="px-3 py-2 font-medium">Website</th>
                      <th className="px-3 py-2 font-medium">Prioridade</th>
                      <th className="w-10 px-2 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhas.map((l, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="px-2 py-1.5">
                          <input
                            value={l.nome_empresa}
                            onChange={(e) => atualizarCampo(i, 'nome_empresa', e.target.value)}
                            className="input"
                            placeholder="Empresa Ltda"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={l.telefone}
                            onChange={(e) => atualizarCampo(i, 'telefone', e.target.value)}
                            className="input"
                            placeholder="(61) 99999-0000"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={l.whatsapp}
                            onChange={(e) => atualizarCampo(i, 'whatsapp', e.target.value)}
                            className="input"
                            placeholder="(61) 99999-0000"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={l.bairro}
                            onChange={(e) => atualizarCampo(i, 'bairro', e.target.value)}
                            className="input"
                            placeholder="Centro"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={l.cidade}
                            onChange={(e) => atualizarCampo(i, 'cidade', e.target.value)}
                            className="input"
                            placeholder="Brasília"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={l.website}
                            onChange={(e) => atualizarCampo(i, 'website', e.target.value)}
                            className="input"
                            placeholder="www.empresa.com.br"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <select
                            value={l.prioridade}
                            onChange={(e) => atualizarCampo(i, 'prioridade', e.target.value)}
                            className="input"
                          >
                            <option value="">—</option>
                            <option value="Alta">Alta</option>
                            <option value="Média">Média</option>
                            <option value="Baixa">Baixa</option>
                          </select>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => removerLinha(i)}
                            className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                            title="Remover linha"
                            aria-label="Remover linha"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={adicionarLinha}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:border-brand-500 hover:text-brand-600"
              >
                <Plus size={15} /> Adicionar linha
              </button>
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-5 py-3">
          {etapa === 'concluido' ? (
            <div className="flex w-full justify-end gap-2">
              <button onClick={reset} className="btn-secondary">
                Adicionar mais
              </button>
              <button onClick={fechar} className="btn-primary">
                Concluir
              </button>
            </div>
          ) : (
            <>
              <span className="text-sm text-gray-500">
                {preenchidas.length} {preenchidas.length === 1 ? 'contato' : 'contatos'} a salvar
              </span>
              <div className="flex gap-2">
                <button onClick={fechar} className="btn-secondary" disabled={etapa === 'salvando'}>
                  Cancelar
                </button>
                <button
                  onClick={salvar}
                  disabled={etapa === 'salvando' || preenchidas.length === 0}
                  className="btn-primary"
                >
                  {etapa === 'salvando' ? <Spinner /> : <Save size={16} />} Salvar contatos ({preenchidas.length})
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
