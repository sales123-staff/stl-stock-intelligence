'use client'

import { useRef, useState } from 'react'
import type { AppParams } from '@/types'
import {
  detectCSVType,
  parseStockCSV,
  parseConsumptionCSV,
  parseCoverageCSV,
} from '@/utils/dataProcessing'
import {
  DEMO_STOCK_CSV,
  DEMO_CONSUMO_CSV,
  DEMO_MESES_CSV,
} from '@/utils/demoData'

interface Props {
  params: AppParams
  onParamsChange: (p: AppParams) => void
  onProcess: (stock: string, consumo: string, meses: string) => void
}

interface FileState {
  name: string
  type: 'stock' | 'consumption' | 'coverage' | 'unknown'
  raw: string
  rows: number
}

export default function ImportSection({
  params,
  onParamsChange,
  onProcess,
}: Props) {
  const [files, setFiles] = useState<FileState[]>([])
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(fileList: FileList) {
    setError(null)
    Array.from(fileList).forEach((file) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const text = e.target?.result as string
        const type = detectCSVType(text)
        let rows = 0
        if (type === 'stock') rows = parseStockCSV(text).length
        else if (type === 'consumption') rows = parseConsumptionCSV(text).length
        else if (type === 'coverage') rows = parseCoverageCSV(text).length

        setFiles((prev) => {
          const filtered = prev.filter((f) => f.type !== type)
          return [
            ...filtered,
            { name: file.name, type, raw: text, rows },
          ]
        })
      }
      reader.readAsText(file, 'UTF-8')
    })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFiles(e.dataTransfer.files)
  }

  function loadDemo() {
    const stockRows = parseStockCSV(DEMO_STOCK_CSV).length
    const consumoRows = parseConsumptionCSV(DEMO_CONSUMO_CSV).length
    const mesesRows = parseCoverageCSV(DEMO_MESES_CSV).length
    setFiles([
      { name: 'estoque_atual.csv', type: 'stock', raw: DEMO_STOCK_CSV, rows: stockRows },
      { name: 'consumo.csv', type: 'consumption', raw: DEMO_CONSUMO_CSV, rows: consumoRows },
      { name: 'meses_cobertura.csv', type: 'coverage', raw: DEMO_MESES_CSV, rows: mesesRows },
    ])
    setError(null)
  }

  function handleProcess() {
    const stockFile = files.find((f) => f.type === 'stock')
    const consumoFile = files.find((f) => f.type === 'consumption')
    const mesesFile = files.find((f) => f.type === 'coverage')

    if (!stockFile || !consumoFile) {
      setError(
        'Necessário ao menos o arquivo de estoque e o de consumo/quantidade.'
      )
      return
    }

    onProcess(
      stockFile.raw,
      consumoFile.raw,
      mesesFile?.raw ?? ''
    )
  }

  function removeFile(type: FileState['type']) {
    setFiles((prev) => prev.filter((f) => f.type !== type))
  }

  const fileTypeLabels = {
    stock: 'Estoque atual',
    consumption: 'Consumo / Quantidade',
    coverage: 'Meses de cobertura',
    unknown: 'Tipo não identificado',
  }

  const fileTypeColors = {
    stock: 'bg-blue-50 border-blue-200 text-blue-800',
    consumption: 'bg-amber-50 border-amber-200 text-amber-800',
    coverage: 'bg-green-50 border-green-200 text-green-800',
    unknown: 'bg-gray-50 border-gray-200 text-gray-600',
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Drop zone */}
      <div
        className="border-2 border-dashed border-gray-200 rounded-2xl p-10 text-center cursor-pointer hover:border-gray-300 hover:bg-gray-50 transition-colors"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
            <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
          </div>
          <p className="text-sm text-gray-600 font-medium">
            Arraste os CSVs aqui ou clique para selecionar
          </p>
          <p className="text-xs text-gray-400">
            Exportações de painel da SANCO — estoque, consumo e meses de cobertura
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".csv"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Loaded files */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.type}
              className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${fileTypeColors[f.type]}`}
            >
              <div>
                <span className="font-medium">{fileTypeLabels[f.type]}</span>
                <span className="ml-2 opacity-60 text-xs">{f.name} · {f.rows} registros</span>
              </div>
              <button
                onClick={() => removeFile(f.type)}
                className="text-current opacity-50 hover:opacity-100 transition-opacity ml-4"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Parameters */}
      <div className="rounded-xl border border-gray-200 p-5 space-y-4">
        <p className="text-sm font-semibold text-gray-700">Parâmetros de cálculo</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Lead time China (dias)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={params.leadTimeDias}
              onChange={(e) =>
                onParamsChange({ ...params, leadTimeDias: Number(e.target.value) })
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Período do relatório (dias)</label>
            <input
              type="number"
              min={1}
              max={365}
              value={params.periodoRelatorioDias}
              onChange={(e) =>
                onParamsChange({
                  ...params,
                  periodoRelatorioDias: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1.5">Estoque de segurança (dias)</label>
            <input
              type="number"
              min={0}
              max={180}
              value={params.estoqueSegurancaDias}
              onChange={(e) =>
                onParamsChange({
                  ...params,
                  estoqueSegurancaDias: Number(e.target.value),
                })
              }
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-300"
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleProcess}
          className="rounded-xl bg-gray-900 text-white px-6 py-3 text-sm font-semibold hover:bg-gray-700 transition-colors"
        >
          Processar dados
        </button>
        <button
          onClick={loadDemo}
          className="rounded-xl border border-gray-200 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Carregar dados de exemplo
        </button>
      </div>

      <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700 space-y-1">
        <p className="font-medium">Como usar</p>
        <p>1. Exporte os três relatórios de painel da SANCO em CSV.</p>
        <p>2. Faça upload aqui — o sistema identifica o tipo automaticamente.</p>
        <p>3. Ajuste lead time e período, depois clique em Processar.</p>
      </div>
    </div>
  )
}
