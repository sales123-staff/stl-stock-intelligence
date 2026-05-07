'use client'

import { useState, useMemo } from 'react'
import type { ProductStatus, RiskStatus } from '@/types'
import {
  fmtNum,
  fmtBRL,
  fmtDias,
  fmtGiro,
  STATUS_ORDER,
  STATUS_LABELS,
} from '@/utils/dataProcessing'
import StatusBadge from './StatusBadge'

type SortKey =
  | 'status'
  | 'codigo'
  | 'produto'
  | 'estoqueUtil'
  | 'consumo'
  | 'diasRestantes'
  | 'giro'
  | 'sugestaoCompra'
  | 'valorMercadorias'

interface Props {
  data: ProductStatus[]
}

const ALL_STATUSES: Array<RiskStatus | 'all'> = [
  'all',
  'critico',
  'vermelho',
  'amarelo',
  'verde',
  'parado',
  'sem-dados',
]

export default function TabelaSection({ data }: Props) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<RiskStatus | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('status')
  const [sortAsc, setSortAsc] = useState(true)

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortAsc((v) => !v)
    else { setSortKey(key); setSortAsc(true) }
  }

  const filtered = useMemo(() => {
    let result = [...data]

    if (statusFilter !== 'all') {
      result = result.filter((d) =>
        statusFilter === 'parado' ? d.estaParado : d.status === statusFilter
      )
    }

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (d) =>
          d.codigo.toLowerCase().includes(q) ||
          d.produto.toLowerCase().includes(q)
      )
    }

    result.sort((a, b) => {
      let diff = 0
      switch (sortKey) {
        case 'status':
          diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
          break
        case 'codigo':
          diff = a.codigo.localeCompare(b.codigo)
          break
        case 'produto':
          diff = a.produto.localeCompare(b.produto)
          break
        case 'estoqueUtil':
          diff = a.estoqueUtil - b.estoqueUtil
          break
        case 'consumo':
          diff = a.consumo - b.consumo
          break
        case 'diasRestantes':
          diff =
            (isFinite(a.diasRestantes) ? a.diasRestantes : 99999) -
            (isFinite(b.diasRestantes) ? b.diasRestantes : 99999)
          break
        case 'giro':
          diff = a.giro - b.giro
          break
        case 'sugestaoCompra':
          diff = a.sugestaoCompra - b.sugestaoCompra
          break
        case 'valorMercadorias':
          diff = a.valorMercadorias - b.valorMercadorias
          break
      }
      return sortAsc ? diff : -diff
    })

    return result
  }, [data, search, statusFilter, sortKey, sortAsc])

  const Th = ({
    label,
    k,
    align = 'left',
  }: {
    label: string
    k: SortKey
    align?: 'left' | 'right'
  }) => (
    <th
      className={`px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700 whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => handleSort(k)}
    >
      {label}{' '}
      {sortKey === k ? (
        <span className="text-gray-400">{sortAsc ? '↑' : '↓'}</span>
      ) : null}
    </th>
  )

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Buscar por código ou produto..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300 min-w-[220px] flex-1 max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as RiskStatus | 'all')}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
        >
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === 'all' ? 'Todos os status' : STATUS_LABELS[s as RiskStatus]}
            </option>
          ))}
        </select>
        <span className="text-xs text-gray-400 bg-gray-100 px-3 py-2 rounded-lg">
          {filtered.length} SKUs
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <Th label="Status" k="status" />
                <Th label="Código" k="codigo" />
                <Th label="Produto" k="produto" />
                <Th label="Útil" k="estoqueUtil" align="right" />
                <Th label="Bloqueado" k="estoqueUtil" align="right" />
                <Th label="Reserva" k="estoqueUtil" align="right" />
                <Th label="Consumo" k="consumo" align="right" />
                <Th label="Dias" k="diasRestantes" align="right" />
                <Th label="Giro" k="giro" align="right" />
                <Th label="Sugestão" k="sugestaoCompra" align="right" />
                <Th label="Valor R$" k="valorMercadorias" align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.slice(0, 100).map((d) => (
                <tr key={d.codigo} className="hover:bg-gray-50 transition-colors">
                  <td className="px-3 py-2.5">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-gray-500">
                    {d.codigo}
                  </td>
                  <td className="px-3 py-2.5 max-w-[200px]">
                    <span className="truncate block text-gray-800 font-medium text-xs">
                      {d.produto}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-700">
                    {fmtNum(d.estoqueUtil)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">
                    {fmtNum(d.qtdBloqueada)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-500 text-xs">
                    {fmtNum(d.reservaVirtual)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-700">
                    {fmtNum(d.consumo)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-medium text-xs ${
                      !isFinite(d.diasRestantes)
                        ? 'text-gray-400'
                        : d.diasRestantes <= 7
                        ? 'text-red-700'
                        : d.diasRestantes <= 30
                        ? 'text-orange-600'
                        : 'text-gray-700'
                    }`}
                  >
                    {fmtDias(d.diasRestantes)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-600 text-xs">
                    {fmtGiro(d.giro)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-semibold text-xs ${
                      d.sugestaoCompra > 0 ? 'text-red-700' : 'text-gray-300'
                    }`}
                  >
                    {d.sugestaoCompra > 0 ? fmtNum(d.sugestaoCompra) + ' un' : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-right text-gray-600 text-xs">
                    {fmtBRL(d.valorMercadorias)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length > 100 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-400 text-center">
            Mostrando 100 de {filtered.length}. Use filtros para refinar.
          </div>
        )}
      </div>
    </div>
  )
}
