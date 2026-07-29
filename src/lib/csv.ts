import Papa from 'papaparse'
import type { CsvLeadRow, Prioridade } from '../types'
import { chaveTelefone } from './utils'

/** Normaliza nome de coluna: minúsculas, sem acentos, espaços viram _ */
function normalizarHeader(h: string): string {
  return h
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
}

/** Sinônimos aceitos para cada coluna esperada (mapeamento automático) */
const MAPA_COLUNAS: Record<keyof CsvLeadRow, string[]> = {
  nome_empresa: ['nome_empresa', 'empresa', 'nome', 'title', 'name', 'razao_social'],
  telefone: ['telefone', 'phone', 'fone', 'tel'],
  whatsapp: ['whatsapp', 'whats', 'celular', 'wpp'],
  website: ['website', 'site', 'url', 'web'],
  endereco: ['endereco', 'address', 'logradouro'],
  cidade: ['cidade', 'city', 'municipio'],
  nota_gmn: ['nota_gmn', 'nota', 'score', 'score_gmn', 'pontuacao'],
  itens_faltando_gmn: ['itens_faltando_gmn', 'itens_faltando', 'faltando', 'pendencias', 'gaps'],
  argumento_vendas: ['argumento_vendas', 'argumento', 'pitch', 'abordagem'],
  prioridade: ['prioridade', 'priority', 'prio'],
}

export interface ResultadoParse {
  linhas: CsvLeadRow[]
  colunasEncontradas: Partial<Record<keyof CsvLeadRow, string>>
  colunasIgnoradas: string[]
  erros: string[]
}

export function parseCsvLeads(file: File): Promise<ResultadoParse> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (result) => {
        const headersOriginais = result.meta.fields ?? []
        const colunasEncontradas: Partial<Record<keyof CsvLeadRow, string>> = {}
        const usadas = new Set<string>()

        // Mapeia automaticamente cada coluna esperada para o header do arquivo
        for (const campo of Object.keys(MAPA_COLUNAS) as (keyof CsvLeadRow)[]) {
          const sinonimos = MAPA_COLUNAS[campo]
          const achado = headersOriginais.find((h) => sinonimos.includes(normalizarHeader(h)))
          if (achado) {
            colunasEncontradas[campo] = achado
            usadas.add(achado)
          }
        }

        const colunasIgnoradas = headersOriginais.filter((h) => !usadas.has(h))
        const erros: string[] = []

        if (!colunasEncontradas.nome_empresa) {
          erros.push(
            'Não encontrei a coluna "nome_empresa" (ou equivalente) no arquivo. ' +
              'Verifique se a primeira linha do CSV contém os nomes das colunas.'
          )
          resolve({ linhas: [], colunasEncontradas, colunasIgnoradas, erros })
          return
        }

        const linhas: CsvLeadRow[] = []
        for (const raw of result.data) {
          const get = (campo: keyof CsvLeadRow) => {
            const col = colunasEncontradas[campo]
            return col ? (raw[col] ?? '').toString().trim() : ''
          }
          const nome = get('nome_empresa')
          if (!nome) continue // pula linhas sem nome

          linhas.push({
            nome_empresa: nome,
            telefone: get('telefone') || undefined,
            whatsapp: get('whatsapp') || undefined,
            website: get('website') || undefined,
            endereco: get('endereco') || undefined,
            cidade: get('cidade') || undefined,
            nota_gmn: get('nota_gmn') || undefined,
            itens_faltando_gmn: get('itens_faltando_gmn') || undefined,
            argumento_vendas: get('argumento_vendas') || undefined,
            prioridade: get('prioridade') || undefined,
          })
        }

        resolve({ linhas, colunasEncontradas, colunasIgnoradas, erros })
      },
      error: (err) => reject(err),
    })
  })
}

export function normalizarPrioridade(p?: string): Prioridade | null {
  if (!p) return null
  const v = p.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (v.startsWith('alt')) return 'Alta'
  if (v.startsWith('med')) return 'Média'
  if (v.startsWith('bai')) return 'Baixa'
  return null
}

export function normalizarNota(n?: string): number | null {
  if (!n) return null
  const num = parseFloat(n.replace(',', '.'))
  if (isNaN(num)) return null
  return Math.max(0, Math.min(100, num))
}

/** Separa linhas novas de duplicadas (pelo telefone, só dígitos) */
export function separarDuplicatas(
  linhas: CsvLeadRow[],
  telefonesExistentes: Set<string>
): { novas: CsvLeadRow[]; duplicadas: CsvLeadRow[] } {
  const novas: CsvLeadRow[] = []
  const duplicadas: CsvLeadRow[] = []
  const vistosNoArquivo = new Set<string>()

  for (const linha of linhas) {
    const tel = chaveTelefone(linha.telefone || linha.whatsapp)
    if (tel && (telefonesExistentes.has(tel) || vistosNoArquivo.has(tel))) {
      duplicadas.push(linha)
    } else {
      if (tel) vistosNoArquivo.add(tel)
      novas.push(linha)
    }
  }
  return { novas, duplicadas }
}

/** Gera o conteúdo CSV de exportação */
export function gerarCsvExport(rows: Record<string, unknown>[]): string {
  return Papa.unparse(rows, { delimiter: ',' })
}

export function baixarCsv(nomeArquivo: string, conteudo: string) {
  const blob = new Blob(['\ufeff' + conteudo], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  a.click()
  URL.revokeObjectURL(url)
}
