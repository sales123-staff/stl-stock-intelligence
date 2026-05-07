import type {
  StockRow,
  ConsumptionRow,
  CoverageRow,
  ProductStatus,
  DashboardSummary,
  AppParams,
  DataQualityFlag,
  RiskStatus,
} from '@/types'

// ---------------------------------------------------------------------------
// Number parsing
// ---------------------------------------------------------------------------

export function parseBRL(value: string | undefined | null): number {
  if (!value) return 0
  const cleaned = String(value)
    .trim()
    .replace('R$', '')
    .replace(/\./g, '')
    .replace(',', '.')
  return parseFloat(cleaned) || 0
}

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

function splitCSVLine(line: string, sep = ';'): string[] {
  return line.split(sep)
}

export function parseStockCSV(text: string): StockRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = splitCSVLine(lines[0]).map((h) => h.trim())

  return lines
    .slice(1)
    .map((line) => {
      const vals = splitCSVLine(line)
      const get = (key: string) => (vals[headers.indexOf(key)] || '').trim()
      const codigo = get('Codigo')
      if (!codigo || codigo === 'Total') return null
      return {
        codigo,
        produto: get('Produto'),
        quantidadeDisponivel: parseBRL(get('Quantidade disponível')),
        quantidadeBloqueada: parseBRL(get('Quantidade bloqueada')),
        quantidadeTotal: parseBRL(get('Quantidade total')),
        valorMercadorias: parseBRL(get('Valor mercadorias')),
        nf: get('Nf'),
        reservaVirtual: parseBRL(get('Reserva virtual')),
      } as StockRow
    })
    .filter((r): r is StockRow => r !== null)
}

export function parseConsumptionCSV(text: string): ConsumptionRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = splitCSVLine(lines[0]).map((h) => h.trim())

  return lines
    .slice(1)
    .map((line) => {
      const vals = splitCSVLine(line)
      const get = (key: string) => (vals[headers.indexOf(key)] || '').trim()
      const codigo = get('Codigo')
      if (!codigo) return null
      return {
        codigo,
        produto: get('Produto'),
        quantidade: parseBRL(get('Quantidade')),
      } as ConsumptionRow
    })
    .filter((r): r is ConsumptionRow => r !== null)
}

export function parseCoverageCSV(text: string): CoverageRow[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = splitCSVLine(lines[0]).map((h) => h.trim())

  return lines
    .slice(1)
    .map((line) => {
      const vals = splitCSVLine(line)
      const get = (key: string) => (vals[headers.indexOf(key)] || '').trim()
      const codigo = get('Codigo')
      if (!codigo) return null
      return {
        codigo,
        produto: get('Produto'),
        meses: parseBRL(get('Meses')),
      } as CoverageRow
    })
    .filter((r): r is CoverageRow => r !== null)
}

export function detectCSVType(
  text: string
): 'stock' | 'consumption' | 'coverage' | 'unknown' {
  const firstLine = text.split(/\r?\n/)[0] || ''
  if (
    firstLine.includes('Quantidade disponível') ||
    firstLine.includes('Valor mercadorias') ||
    firstLine.includes('Reserva virtual')
  )
    return 'stock'
  if (firstLine.includes('Meses')) return 'coverage'
  if (
    firstLine.includes('Quantidade') &&
    !firstLine.includes('disponível') &&
    !firstLine.includes('bloqueada')
  )
    return 'consumption'
  return 'unknown'
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

interface StockConsolidated {
  codigo: string
  produto: string
  qtdDisponivel: number
  qtdBloqueada: number
  qtdTotal: number
  valorMercadorias: number
  reservaVirtual: number
}

function consolidateStock(rows: StockRow[]): Map<string, StockConsolidated> {
  const map = new Map<string, StockConsolidated>()

  for (const row of rows) {
    const existing = map.get(row.codigo)
    if (!existing) {
      map.set(row.codigo, {
        codigo: row.codigo,
        produto: row.produto,
        qtdDisponivel: row.quantidadeDisponivel,
        qtdBloqueada: row.quantidadeBloqueada,
        qtdTotal: row.quantidadeTotal,
        valorMercadorias: row.valorMercadorias,
        reservaVirtual: row.reservaVirtual,
      })
    } else {
      existing.qtdDisponivel += row.quantidadeDisponivel
      existing.qtdBloqueada += row.quantidadeBloqueada
      existing.qtdTotal += row.quantidadeTotal
      existing.valorMercadorias += row.valorMercadorias
      existing.reservaVirtual += row.reservaVirtual
    }
  }

  return map
}

// ---------------------------------------------------------------------------
// Risk classification
// ---------------------------------------------------------------------------

function classifyRisk(
  estoqueUtil: number,
  diasRestantes: number,
  consumo: number,
  semEstoque: boolean,
  params: AppParams
): RiskStatus {
  if (semEstoque && consumo > 0) return 'critico'
  if (estoqueUtil <= 0 && consumo > 0) return 'critico'
  if (diasRestantes <= 7) return 'critico'
  if (diasRestantes <= params.leadTimeDias) return 'vermelho'
  if (diasRestantes <= params.leadTimeDias + params.estoqueSegurancaDias)
    return 'amarelo'
  if (consumo === 0 && estoqueUtil > 50) return 'parado'
  if (diasRestantes === Infinity && consumo === 0) return 'sem-dados'
  return 'verde'
}

function buildMotivo(
  status: RiskStatus,
  diasRestantes: number,
  params: AppParams
): string {
  switch (status) {
    case 'critico':
      if (diasRestantes <= 0 || diasRestantes === Infinity)
        return 'Estoque útil zerado com consumo ativo — ruptura imediata'
      if (diasRestantes <= 7)
        return `Apenas ${Math.round(diasRestantes)} dias restantes — ruptura iminente`
      return 'Vendido sem estoque encontrado — verificar cadastro no SANCO'
    case 'vermelho':
      return `Vai acabar antes do lead time (${params.leadTimeDias} dias)`
    case 'amarelo':
      return 'Cobertura abaixo da margem de segurança — comprar no próximo pedido'
    case 'parado':
      return 'Sem consumo no período — capital parado'
    case 'sem-dados':
      return 'Dados insuficientes — revisar cadastro ou histórico'
    case 'verde':
    default:
      return 'Estoque aparentemente saudável'
  }
}

// ---------------------------------------------------------------------------
// Main processing function
// ---------------------------------------------------------------------------

export function processData(
  stockRows: StockRow[],
  consumptionRows: ConsumptionRow[],
  coverageRows: CoverageRow[],
  params: AppParams
): ProductStatus[] {
  const stockMap = consolidateStock(stockRows)

  const consumoMap = new Map<string, number>()
  const consumoProduto = new Map<string, string>()
  for (const r of consumptionRows) {
    consumoMap.set(r.codigo, (consumoMap.get(r.codigo) || 0) + r.quantidade)
    consumoProduto.set(r.codigo, r.produto)
  }

  const mesesMap = new Map<string, number>()
  for (const r of coverageRows) {
    mesesMap.set(r.codigo, r.meses)
  }

  const allCodes = new Set([
    ...stockMap.keys(),
    ...consumoMap.keys(),
  ])

  const results: ProductStatus[] = []

  for (const codigo of allCodes) {
    const stock = stockMap.get(codigo)
    const consumo = consumoMap.get(codigo) || 0
    const meses = mesesMap.get(codigo) || 0
    const produto =
      stock?.produto ||
      consumoProduto.get(codigo) ||
      codigo

    const qtdDisponivel = stock?.qtdDisponivel ?? 0
    const qtdBloqueada = stock?.qtdBloqueada ?? 0
    const qtdTotal = stock?.qtdTotal ?? 0
    const reservaVirtual = stock?.reservaVirtual ?? 0
    const valorMercadorias = stock?.valorMercadorias ?? 0
    const semEstoqueEncontrado = !stock

    const estoqueUtil = Math.max(0, qtdDisponivel - reservaVirtual)
    const valorUnitario =
      qtdDisponivel > 0 && valorMercadorias > 0
        ? valorMercadorias / qtdDisponivel
        : 0

    const consumoDiario =
      params.periodoRelatorioDias > 0
        ? consumo / params.periodoRelatorioDias
        : 0

    let diasRestantes: number
    if (consumoDiario > 0) {
      diasRestantes = estoqueUtil / consumoDiario
    } else if (meses > 0) {
      diasRestantes = meses * 30
    } else {
      diasRestantes = Infinity
    }

    const estoqueNecessario =
      consumoDiario * (params.leadTimeDias + params.estoqueSegurancaDias)
    const sugestaoCompra = Math.max(
      0,
      Math.ceil(estoqueNecessario - estoqueUtil)
    )

    const giro =
      estoqueUtil > 0
        ? consumo / estoqueUtil
        : consumo > 0
        ? 999
        : 0

    const estaParado = consumo === 0 && estoqueUtil > 50

    const status = classifyRisk(
      estoqueUtil,
      diasRestantes,
      consumo,
      semEstoqueEncontrado,
      params
    )

    const motivoAlerta = buildMotivo(status, diasRestantes, params)

    results.push({
      codigo,
      produto,
      qtdDisponivel,
      qtdBloqueada,
      qtdTotal,
      reservaVirtual,
      estoqueUtil,
      valorMercadorias,
      valorUnitario,
      consumo,
      consumoDiario,
      diasRestantes,
      mesesCobertura: meses,
      giro,
      sugestaoCompra,
      status,
      motivoAlerta,
      semEstoqueEncontrado,
      estaParado,
    })
  }

  return results
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export function buildSummary(data: ProductStatus[]): DashboardSummary {
  const valorTotal = data.reduce((a, d) => a + d.valorMercadorias, 0)
  const valorParado = data
    .filter((d) => d.estaParado)
    .reduce((a, d) => a + d.valorMercadorias, 0)

  return {
    totalSkus: data.length,
    skusCriticos: data.filter((d) => d.status === 'critico').length,
    skusVermelhos: data.filter((d) => d.status === 'vermelho').length,
    skusAmarelos: data.filter((d) => d.status === 'amarelo').length,
    skusVerdes: data.filter((d) => d.status === 'verde').length,
    skusParados: data.filter((d) => d.estaParado).length,
    skusSemDados: data.filter((d) => d.status === 'sem-dados').length,
    skusDivergentes: data.filter((d) => d.semEstoqueEncontrado).length,
    unidadesDisponiveis: data.reduce((a, d) => a + d.estoqueUtil, 0),
    valorTotal,
    valorParado,
    percentualParado: valorTotal > 0 ? (valorParado / valorTotal) * 100 : 0,
  }
}

// ---------------------------------------------------------------------------
// Quality flags
// ---------------------------------------------------------------------------

export function buildQualityFlags(data: ProductStatus[]): DataQualityFlag[] {
  const flags: DataQualityFlag[] = []

  data
    .filter((d) => d.semEstoqueEncontrado && d.consumo > 0)
    .forEach((d) =>
      flags.push({
        tipo: 'sem-estoque',
        codigo: d.codigo,
        produto: d.produto,
        detalhe: `Consumo registrado (${fmtNum(d.consumo)} un) mas produto não encontrado no estoque`,
      })
    )

  data
    .filter((d) => d.consumo === 0 && !d.semEstoqueEncontrado)
    .forEach((d) =>
      flags.push({
        tipo: 'sem-consumo',
        codigo: d.codigo,
        produto: d.produto,
        detalhe: `Nenhum consumo no período — estoque: ${fmtNum(d.estoqueUtil)} un`,
      })
    )

  data
    .filter((d) => d.estoqueUtil <= 0 && !d.semEstoqueEncontrado)
    .forEach((d) =>
      flags.push({
        tipo: 'estoque-zero',
        codigo: d.codigo,
        produto: d.produto,
        detalhe: `Estoque útil zerado. Disponível: ${fmtNum(d.qtdDisponivel)}, Reserva: ${fmtNum(d.reservaVirtual)}`,
      })
    )

  return flags
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export const STATUS_ORDER: Record<RiskStatus, number> = {
  critico: 0,
  vermelho: 1,
  amarelo: 2,
  parado: 3,
  'sem-dados': 4,
  verde: 5,
}

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

export function fmtNum(n: number): string {
  return new Intl.NumberFormat('pt-BR').format(Math.round(n))
}

export function fmtBRL(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

export function fmtDias(n: number): string {
  if (!isFinite(n)) return '—'
  return `${Math.round(n)}d`
}

export function fmtGiro(n: number): string {
  if (n === 999) return '∞'
  return `${n.toFixed(2)}x`
}

export const STATUS_LABELS: Record<RiskStatus, string> = {
  critico: 'Crítico',
  vermelho: 'Vermelho',
  amarelo: 'Amarelo',
  verde: 'Verde',
  parado: 'Parado',
  'sem-dados': 'Sem dados',
}

// ---------------------------------------------------------------------------
// CSV export
// ---------------------------------------------------------------------------

export function exportSugestaoCSV(data: ProductStatus[]): void {
  const lista = data
    .filter((d) => d.sugestaoCompra > 0)
    .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status])

  const header = [
    'Codigo',
    'Produto',
    'Status',
    'EstoqueUtil',
    'Consumo',
    'DiasRestantes',
    'SugestaoCompra',
    'MotivoAlerta',
  ]

  const rows = lista.map((d) => [
    d.codigo,
    d.produto,
    STATUS_LABELS[d.status],
    Math.round(d.estoqueUtil),
    d.consumo,
    isFinite(d.diasRestantes) ? Math.round(d.diasRestantes) : '',
    d.sugestaoCompra,
    d.motivoAlerta,
  ])

  const csv = [header, ...rows].map((r) => r.join(';')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'stl_sugestao_compra.csv'
  a.click()
  URL.revokeObjectURL(url)
}
