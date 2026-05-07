'use client'

import { useMemo } from 'react'
import type { ProductStatus, DashboardSummary } from '@/types'
import { fmtBRL, fmtNum, fmtDias, STATUS_ORDER } from '@/utils/dataProcessing'
import MetricCard from './MetricCard'
import StatusBadge from './StatusBadge'

interface Props {
  data: ProductStatus[]
  summary: DashboardSummary
}

export default function DashboardSection({ data, summary }: Props) {
  const topRuptura = useMemo(
    () =>
      [...data]
        .filter((d) => d.status === 'critico' || d.status === 'vermelho')
        .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])
        .slice(0, 6),
    [data]
  )

  const topParado = useMemo(
    () =>
      [...data]
        .filter((d) => d.estaParado)
        .sort((a, b) => b.valorMercadorias - a.valorMercadorias)
        .slice(0, 5),
    [data]
  )

  const topConsumo = useMemo(
    () =>
      [...data]
        .filter((d) => d.consumo > 0)
        .sort((a, b) => b.consumo - a.consumo)
        .slice(0, 5),
    [data]
  )

  const statusDist = useMemo(() => {
    const total = data.length
    if (total === 0) return []
    return [
      { label: 'Crítico', count: summary.skusCriticos, color: 'bg-red-500' },
      { label: 'Vermelho', count: summary.skusVermelhos, color: 'bg-orange-400' },
      { label: 'Amarelo', count: summary.skusAmarelos, color: 'bg-amber-400' },
      { label: 'Verde', count: summary.skusVerdes, color: 'bg-green-500' },
      { label: 'Parado', count: summary.skusParados, color: 'bg-purple-400' },
      { label: 'Sem dados', count: summary.skusSemDados, color: 'bg-gray-300' },
    ].map((item) => ({ ...item, pct: (item.count / total) * 100 }))
  }, [data, summary])

  return (
    <div className="space-y-6">
      {/* KPI grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Total em estoque"
          value={fmtBRL(summary.valorTotal)}
          sub={`${fmtNum(summary.unidadesDisponiveis)} unidades disponíveis`}
        />
        <MetricCard
          label="Capital parado"
          value={fmtBRL(summary.valorParado)}
          sub={`${summary.percentualParado.toFixed(1)}% do inventário`}
          accent="danger"
        />
        <MetricCard
          label="SKUs críticos"
          value={summary.skusCriticos}
          sub={`${summary.skusVermelhos} em vermelho`}
          accent="danger"
        />
        <MetricCard
          label="SKUs sem giro"
          value={summary.skusParados}
          sub={`${summary.skusDivergentes} divergências cadastrais`}
          accent="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Status distribution */}
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4">Distribuição por status</p>
          <div className="space-y-2.5">
            {statusDist.map((item) => (
              <div key={item.label}>
                <div className="flex justify-between text-xs text-gray-600 mb-1">
                  <span>{item.label}</span>
                  <span className="font-medium">{item.count} SKUs · {item.pct.toFixed(1)}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color} transition-all`}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Capital parado ranking */}
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4">
            Capital parado — top produtos
          </p>
          {topParado.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">
              Nenhum produto parado identificado
            </p>
          ) : (
            <div className="space-y-3">
              {topParado.map((d) => (
                <div key={d.codigo}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-700 font-medium truncate max-w-[200px]">
                      {d.produto}
                    </span>
                    <span className="text-purple-700 font-semibold shrink-0 ml-2">
                      {fmtBRL(d.valorMercadorias)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-purple-400"
                      style={{
                        width: `${(d.valorMercadorias / topParado[0].valorMercadorias) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rupture alerts */}
      {topRuptura.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <p className="text-sm font-semibold text-gray-700 mb-4">
            Alertas prioritários de ruptura
          </p>
          <div className="divide-y divide-gray-50">
            {topRuptura.map((d) => (
              <div key={d.codigo} className="py-3 flex items-start gap-3">
                <StatusBadge status={d.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {d.produto}
                    <span className="ml-1.5 font-mono text-xs text-gray-400">
                      {d.codigo}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{d.motivoAlerta}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs font-medium text-gray-700">
                    {fmtDias(d.diasRestantes)}
                  </p>
                  <p className="text-xs text-gray-400">{fmtNum(d.estoqueUtil)} un</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top consumo */}
      <div className="rounded-xl border border-gray-100 bg-white p-5">
        <p className="text-sm font-semibold text-gray-700 mb-4">
          Produtos campeões de consumo
        </p>
        <div className="space-y-3">
          {topConsumo.map((d, i) => (
            <div key={d.codigo} className="flex items-center gap-3">
              <span className="w-5 h-5 rounded-full bg-gray-100 text-gray-500 text-xs flex items-center justify-center font-semibold">
                {i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 font-medium truncate">
                  {d.produto}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-800">
                  {fmtNum(d.consumo)} un
                </p>
                <p className="text-xs text-gray-400">
                  giro {d.giro === 999 ? '∞' : d.giro.toFixed(2)}x
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
