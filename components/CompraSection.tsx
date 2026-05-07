'use client'

import { useMemo } from 'react'
import type { ProductStatus, AppParams } from '@/types'
import {
  fmtNum,
  fmtBRL,
  fmtDias,
  STATUS_ORDER,
  exportSugestaoCSV,
} from '@/utils/dataProcessing'
import StatusBadge from './StatusBadge'
import MetricCard from './MetricCard'

interface Props {
  data: ProductStatus[]
  params: AppParams
}

export default function CompraSection({ data, params }: Props) {
  const lista = useMemo(
    () =>
      [...data]
        .filter((d) => d.sugestaoCompra > 0)
        .sort((a, b) => {
          const so = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
          if (so !== 0) return so
          return b.sugestaoCompra - a.sugestaoCompra
        }),
    [data]
  )

  const totalUnidades = useMemo(
    () => lista.reduce((a, d) => a + d.sugestaoCompra, 0),
    [lista]
  )

  const valorEstimado = useMemo(
    () => lista.reduce((a, d) => a + d.valorUnitario * d.sugestaoCompra, 0),
    [lista]
  )

  return (
    <div className="space-y-5">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="SKUs para comprar"
          value={lista.length}
          sub="com sugestão acima de zero"
        />
        <MetricCard
          label="Total de unidades"
          value={fmtNum(totalUnidades)}
          sub="soma de todas as sugestões"
        />
        <MetricCard
          label="Valor estimado"
          value={fmtBRL(valorEstimado)}
          sub="baseado no preço médio atual"
          accent="warning"
        />
        <MetricCard
          label="Cobertura comprada"
          value={`${params.leadTimeDias + params.estoqueSegurancaDias}d`}
          sub={`${params.leadTimeDias}d lead + ${params.estoqueSegurancaDias}d segurança`}
        />
      </div>

      {/* Export button */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          Revise os valores antes de fechar o pedido com o fornecedor.
        </p>
        <button
          onClick={() => exportSugestaoCSV(data)}
          className="rounded-xl bg-gray-900 text-white px-5 py-2.5 text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          Exportar CSV
        </button>
      </div>

      {/* Table */}
      {lista.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400 rounded-xl border border-gray-100">
          Nenhum SKU com sugestão de compra.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Produto</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Estoque útil</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Consumo</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Dias rest.</th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Sugestão compra</th>
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map((d) => (
                  <tr key={d.codigo} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2.5">
                      <StatusBadge status={d.status} />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-500">
                      {d.codigo}
                    </td>
                    <td className="px-3 py-2.5 max-w-[160px]">
                      <span className="truncate block text-gray-800 font-medium text-xs">
                        {d.produto}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 text-xs">
                      {fmtNum(d.estoqueUtil)}
                    </td>
                    <td className="px-3 py-2.5 text-right text-gray-700 text-xs">
                      {fmtNum(d.consumo)}
                    </td>
                    <td
                      className={`px-3 py-2.5 text-right font-medium text-xs ${
                        !isFinite(d.diasRestantes)
                          ? 'text-gray-400'
                          : d.diasRestantes <= 7
                          ? 'text-red-700'
                          : 'text-orange-600'
                      }`}
                    >
                      {fmtDias(d.diasRestantes)}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="font-bold text-sm text-red-700">
                        {fmtNum(d.sugestaoCompra)} un
                      </span>
                    </td>
                    <td className="px-3 py-2.5 max-w-[200px]">
                      <span className="text-xs text-gray-500 truncate block">
                        {d.motivoAlerta}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
