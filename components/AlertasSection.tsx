'use client'

import { useMemo } from 'react'
import type { ProductStatus } from '@/types'
import { fmtNum, fmtDias, STATUS_ORDER } from '@/utils/dataProcessing'
import StatusBadge from './StatusBadge'

interface Props {
  data: ProductStatus[]
}

interface AlertCardProps {
  d: ProductStatus
  variant: 'critico' | 'vermelho' | 'parado' | 'divergente'
}

const variantStyles = {
  critico: 'bg-red-50 border-red-200 border-l-red-500',
  vermelho: 'bg-orange-50 border-orange-200 border-l-orange-500',
  parado: 'bg-purple-50 border-purple-200 border-l-purple-500',
  divergente: 'bg-amber-50 border-amber-200 border-l-amber-500',
}

function AlertCard({ d, variant }: AlertCardProps) {
  return (
    <div
      className={`rounded-lg border border-l-4 px-4 py-3 ${variantStyles[variant]}`}
    >
      <div className="flex items-start gap-3">
        <StatusBadge status={d.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">
            {d.produto}
            <span className="ml-1.5 font-mono text-xs font-normal text-gray-400">
              {d.codigo}
            </span>
          </p>
          <p className="text-xs text-gray-600 mt-0.5">{d.motivoAlerta}</p>
        </div>
        <div className="shrink-0 text-right text-xs">
          <p className="font-semibold text-gray-700">
            {fmtDias(d.diasRestantes)}
          </p>
          <p className="text-gray-400">
            {fmtNum(d.estoqueUtil)} un úteis
          </p>
          {d.sugestaoCompra > 0 && (
            <p className="text-red-600 font-medium mt-0.5">
              Comprar: {fmtNum(d.sugestaoCompra)} un
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AlertasSection({ data }: Props) {
  const criticos = useMemo(
    () =>
      [...data]
        .filter((d) => d.status === 'critico')
        .sort((a, b) => a.estoqueUtil - b.estoqueUtil),
    [data]
  )

  const vermelhos = useMemo(
    () =>
      [...data]
        .filter((d) => d.status === 'vermelho')
        .sort(
          (a, b) =>
            (isFinite(a.diasRestantes) ? a.diasRestantes : 99999) -
            (isFinite(b.diasRestantes) ? b.diasRestantes : 99999)
        ),
    [data]
  )

  const parados = useMemo(
    () =>
      [...data]
        .filter((d) => d.estaParado)
        .sort((a, b) => b.valorMercadorias - a.valorMercadorias),
    [data]
  )

  const divergentes = useMemo(
    () => data.filter((d) => d.semEstoqueEncontrado),
    [data]
  )

  return (
    <div className="space-y-8">
      {/* Criticos */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-red-700">
            Ruptura iminente
          </h2>
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-semibold">
            {criticos.length} SKUs
          </span>
        </div>
        {criticos.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum SKU em situação crítica.</p>
        ) : (
          <div className="space-y-2">
            {criticos.map((d) => (
              <AlertCard key={d.codigo} d={d} variant="critico" />
            ))}
          </div>
        )}
      </section>

      {/* Vermelhos */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-orange-700">
            Atenção — estoque abaixo do lead time
          </h2>
          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
            {vermelhos.length} SKUs
          </span>
        </div>
        {vermelhos.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum SKU em estado vermelho.</p>
        ) : (
          <div className="space-y-2">
            {vermelhos.map((d) => (
              <AlertCard key={d.codigo} d={d} variant="vermelho" />
            ))}
          </div>
        )}
      </section>

      {/* Parados */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-sm font-bold text-purple-700">
            Capital parado — produtos sem giro
          </h2>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-semibold">
            {parados.length} SKUs
          </span>
        </div>
        {parados.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum produto parado identificado.</p>
        ) : (
          <div className="space-y-2">
            {parados.map((d) => (
              <AlertCard key={d.codigo} d={d} variant="parado" />
            ))}
          </div>
        )}
      </section>

      {/* Divergentes */}
      {divergentes.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-amber-700">
              Divergências cadastrais — consumo sem estoque
            </h2>
            <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
              {divergentes.length} SKUs
            </span>
          </div>
          <div className="space-y-2">
            {divergentes.map((d) => (
              <AlertCard key={d.codigo} d={d} variant="divergente" />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
