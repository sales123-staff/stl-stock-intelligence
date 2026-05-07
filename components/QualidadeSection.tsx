'use client'

import { useMemo } from 'react'
import type { ProductStatus, DataQualityFlag } from '@/types'
import { buildQualityFlags, fmtNum } from '@/utils/dataProcessing'
import MetricCard from './MetricCard'

interface Props {
  data: ProductStatus[]
}

const flagStyles: Record<DataQualityFlag['tipo'], string> = {
  'sem-estoque': 'bg-red-50 border-red-200 text-red-700',
  'sem-consumo': 'bg-purple-50 border-purple-200 text-purple-700',
  'sem-meses': 'bg-gray-50 border-gray-200 text-gray-600',
  'estoque-zero': 'bg-orange-50 border-orange-200 text-orange-700',
}

const flagLabels: Record<DataQualityFlag['tipo'], string> = {
  'sem-estoque': 'Sem estoque cadastrado',
  'sem-consumo': 'Sem consumo registrado',
  'sem-meses': 'Sem dados de cobertura',
  'estoque-zero': 'Estoque útil zerado',
}

export default function QualidadeSection({ data }: Props) {
  const flags = useMemo(() => buildQualityFlags(data), [data])

  const semEstoque = flags.filter((f) => f.tipo === 'sem-estoque')
  const semConsumo = flags.filter((f) => f.tipo === 'sem-consumo')
  const estoqueZero = flags.filter((f) => f.tipo === 'estoque-zero')

  const healthScore = useMemo(() => {
    if (data.length === 0) return 100
    const problematicos = data.filter(
      (d) => d.semEstoqueEncontrado || d.status === 'sem-dados' || d.estoqueUtil <= 0
    ).length
    return Math.round(((data.length - problematicos) / data.length) * 100)
  }, [data])

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MetricCard
          label="Score de qualidade"
          value={`${healthScore}%`}
          sub={`${data.length} SKUs processados`}
          accent={healthScore >= 80 ? 'green' : healthScore >= 60 ? 'warning' : 'danger'}
        />
        <MetricCard
          label="Consumo sem estoque"
          value={semEstoque.length}
          sub="verificar no SANCO"
          accent={semEstoque.length > 0 ? 'danger' : 'default'}
        />
        <MetricCard
          label="Sem consumo registrado"
          value={semConsumo.length}
          sub="histórico ausente"
          accent={semConsumo.length > 5 ? 'purple' : 'default'}
        />
        <MetricCard
          label="Estoque útil zerado"
          value={estoqueZero.length}
          sub="disponível - reserva = 0"
          accent={estoqueZero.length > 0 ? 'warning' : 'default'}
        />
      </div>

      {/* Sem estoque */}
      {semEstoque.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-bold text-red-700">
              Consumo sem estoque encontrado
            </h2>
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
              {semEstoque.length}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Estes produtos aparecem no relatório de consumo mas não foram encontrados no estoque.
            Podem estar zerados no SANCO ou com código diferente. Trate como divergência cadastral.
          </p>
          <div className="space-y-2">
            {semEstoque.map((f) => (
              <div
                key={f.codigo}
                className={`flex items-start justify-between rounded-lg border px-4 py-3 ${flagStyles[f.tipo]}`}
              >
                <div>
                  <p className="font-semibold text-sm">
                    {f.codigo}
                    <span className="ml-2 font-normal text-xs opacity-70">
                      {f.produto}
                    </span>
                  </p>
                  <p className="text-xs mt-0.5 opacity-75">{f.detalhe}</p>
                </div>
                <span className="text-xs font-semibold bg-white bg-opacity-60 px-2 py-0.5 rounded-md shrink-0 ml-4">
                  {flagLabels[f.tipo]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estoque zero */}
      {estoqueZero.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-bold text-orange-700">
              Estoque útil zerado
            </h2>
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
              {estoqueZero.length}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Estes produtos têm quantidade disponível igual ou menor que a reserva virtual.
            Estoque útil = max(0, disponível − reserva).
          </p>
          <div className="space-y-2">
            {estoqueZero.map((f) => (
              <div
                key={f.codigo}
                className={`flex items-start justify-between rounded-lg border px-4 py-3 ${flagStyles[f.tipo]}`}
              >
                <div>
                  <p className="font-semibold text-sm">
                    {f.codigo}
                    <span className="ml-2 font-normal text-xs opacity-70">
                      {f.produto}
                    </span>
                  </p>
                  <p className="text-xs mt-0.5 opacity-75">{f.detalhe}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sem consumo */}
      {semConsumo.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-sm font-bold text-purple-700">
              Produtos sem consumo no período
            </h2>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              {semConsumo.length}
            </span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Estes produtos têm estoque mas nenhum consumo registrado no período do relatório.
            Podem estar parados ou com código divergente no relatório de vendas.
          </p>
          <div className="divide-y divide-gray-100">
            {semConsumo.slice(0, 30).map((f) => (
              <div key={f.codigo} className="flex justify-between py-2.5 text-sm">
                <span className="text-gray-700">
                  <span className="font-mono text-xs text-gray-400 mr-2">{f.codigo}</span>
                  {f.produto}
                </span>
                <span className="text-xs text-gray-400 shrink-0 ml-4">{f.detalhe}</span>
              </div>
            ))}
            {semConsumo.length > 30 && (
              <p className="pt-2 text-xs text-gray-400">
                + {semConsumo.length - 30} mais...
              </p>
            )}
          </div>
        </div>
      )}

      {flags.length === 0 && (
        <div className="text-center py-12 rounded-xl border border-green-100 bg-green-50">
          <p className="text-green-700 font-semibold text-sm">
            Dados sem inconsistências detectadas.
          </p>
          <p className="text-green-600 text-xs mt-1">
            Todos os {data.length} SKUs processados com qualidade adequada.
          </p>
        </div>
      )}
    </div>
  )
}
