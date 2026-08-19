import { useEffect, useState } from 'react'
import { MapPin, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import {
  criarLocalidade,
  atualizarLocalidade,
  listarLocalidades,
  removerLocalidade,
  type Localidade,
  type LocalidadeInput,
} from '../lib/localidades'
import Spinner from '../components/Spinner'

/** Converte "a, b, c" em ['a','b','c'] (sem vazios/repetidos). */
function paraLista(texto: string): string[] {
  return Array.from(
    new Set(
      texto
        .split(/[,\n]/)
        .map((t) => t.trim())
        .filter(Boolean)
    )
  )
}

const VAZIO: LocalidadeInput = { nome: '', uf: '', pais: 'Brasil', apelidos: [], ddds: [], bairros: [] }

export default function Localidades() {
  const { profile } = useAuth()
  const ehAdmin = profile?.role === 'admin'
  const [locais, setLocais] = useState<Localidade[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [editando, setEditando] = useState<Localidade | 'novo' | null>(null)

  async function carregar() {
    setCarregando(true)
    try {
      setLocais(await listarLocalidades())
    } catch {
      setErro('Não foi possível carregar as localidades.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  async function excluir(l: Localidade) {
    if (!window.confirm(`Remover "${l.nome}" da base de localidades?`)) return
    setErro(null)
    try {
      await removerLocalidade(l.id)
      setLocais((prev) => prev.filter((x) => x.id !== l.id))
    } catch {
      setErro('Não foi possível remover. Verifique se você é administrador.')
    }
  }

  if (!ehAdmin) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <MapPin className="mx-auto mb-3 text-gray-300" size={40} />
        <h1 className="text-lg font-semibold text-gray-900">Acesso restrito</h1>
        <p className="mt-1 text-sm text-gray-500">
          Apenas administradores podem gerenciar as localidades usadas nas buscas.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Localidades</h1>
          <p className="mt-1 text-sm text-gray-500">
            Cidades, bairros e DDDs usados para refinar as buscas por localização.
          </p>
        </div>
        <button onClick={() => setEditando('novo')} className="btn-primary">
          <Plus size={16} /> Nova cidade
        </button>
      </div>

      {erro && <p className="mb-4 text-sm text-red-600">{erro}</p>}

      {carregando ? (
        <div className="flex justify-center py-20">
          <Spinner texto="Carregando localidades…" />
        </div>
      ) : locais.length === 0 ? (
        <div className="card p-8 text-center text-sm text-gray-500">
          Nenhuma cidade cadastrada ainda. Clique em <span className="font-medium">Nova cidade</span> para começar.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {locais.map((l) => (
            <div key={l.id} className="card p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold text-gray-900">
                    {l.nome}
                    {l.uf && <span className="text-gray-400"> · {l.uf}</span>}
                  </p>
                  <p className="text-xs text-gray-400">{l.pais}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditando(l)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => excluir(l)}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remover"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
              <dl className="mt-3 space-y-1.5 text-xs">
                <ChipLinha rotulo="DDDs" itens={l.ddds} />
                <ChipLinha rotulo="Apelidos" itens={l.apelidos} />
                <ChipLinha rotulo="Bairros" itens={l.bairros} />
              </dl>
            </div>
          ))}
        </div>
      )}

      {editando && (
        <FormularioLocalidade
          inicial={editando === 'novo' ? null : editando}
          onFechar={() => setEditando(null)}
          onSalvo={() => {
            setEditando(null)
            carregar()
          }}
        />
      )}
    </div>
  )
}

function ChipLinha({ rotulo, itens }: { rotulo: string; itens: string[] }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 font-medium text-gray-400">{rotulo}</dt>
      <dd className="flex flex-wrap gap-1">
        {itens.length === 0 ? (
          <span className="text-gray-300">—</span>
        ) : (
          itens.map((i) => (
            <span key={i} className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
              {i}
            </span>
          ))
        )}
      </dd>
    </div>
  )
}

function FormularioLocalidade({
  inicial,
  onFechar,
  onSalvo,
}: {
  inicial: Localidade | null
  onFechar: () => void
  onSalvo: () => void
}) {
  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [uf, setUf] = useState(inicial?.uf ?? '')
  const [pais, setPais] = useState(inicial?.pais ?? 'Brasil')
  const [apelidos, setApelidos] = useState((inicial?.apelidos ?? []).join(', '))
  const [ddds, setDdds] = useState((inicial?.ddds ?? []).join(', '))
  const [bairros, setBairros] = useState((inicial?.bairros ?? []).join(', '))
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function salvar() {
    if (!nome.trim()) {
      setErro('Informe o nome da cidade.')
      return
    }
    setSalvando(true)
    setErro(null)
    const dados: LocalidadeInput = {
      nome: nome.trim(),
      uf: uf.trim() || null,
      pais: pais.trim() || 'Brasil',
      apelidos: paraLista(apelidos),
      ddds: paraLista(ddds),
      bairros: paraLista(bairros),
    }
    try {
      if (inicial) await atualizarLocalidade(inicial.id, dados)
      else await criarLocalidade(dados)
      onSalvo()
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setErro(
        msg.toLowerCase().includes('duplicate')
          ? 'Já existe uma cidade com esse nome neste país.'
          : 'Não foi possível salvar. Verifique se você é administrador.'
      )
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onFechar} />
      <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h2 className="text-lg font-bold text-gray-900">{inicial ? 'Editar cidade' : 'Nova cidade'}</h2>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {erro && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">{erro}</div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">Cidade</label>
              <input value={nome} onChange={(e) => setNome(e.target.value)} className="input" placeholder="Brasília" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">UF</label>
              <input value={uf} onChange={(e) => setUf(e.target.value)} className="input" placeholder="DF" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">País</label>
            <input value={pais} onChange={(e) => setPais(e.target.value)} className="input" placeholder="Brasil" />
          </div>
          <CampoLista
            rotulo="DDDs"
            valor={ddds}
            onChange={setDdds}
            placeholder="61"
            ajuda="Códigos de área que confirmam a região pelo telefone. Separe por vírgula."
          />
          <CampoLista
            rotulo="Apelidos / variações do nome"
            valor={apelidos}
            onChange={setApelidos}
            placeholder="Brasilia, BSB, DF, Distrito Federal"
            ajuda="Como a cidade também aparece escrita nos perfis. Separe por vírgula."
          />
          <CampoLista
            rotulo="Bairros / regiões"
            valor={bairros}
            onChange={setBairros}
            placeholder="Samambaia, Ceilândia, Taguatinga, Águas Claras"
            ajuda="Bairros que contam como esta cidade (ex.: 'Dentista Samambaia'). Separe por vírgula."
          />
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button onClick={onFechar} className="btn-secondary">Cancelar</button>
          <button onClick={salvar} disabled={salvando} className="btn-primary">
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

function CampoLista({
  rotulo,
  valor,
  onChange,
  placeholder,
  ajuda,
}: {
  rotulo: string
  valor: string
  onChange: (v: string) => void
  placeholder: string
  ajuda: string
}) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700">{rotulo}</label>
      <textarea
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        className="input min-h-[64px] resize-y"
        placeholder={placeholder}
      />
      <p className="mt-1 text-xs text-gray-400">{ajuda}</p>
    </div>
  )
}
