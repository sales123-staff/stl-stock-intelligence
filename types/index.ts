export interface StockRow {
  codigo: string
  produto: string
  quantidadeDisponivel: number
  quantidadeBloqueada: number
  quantidadeTotal: number
  valorMercadorias: number
  nf: string
  reservaVirtual: number
}

export interface ConsumptionRow {
  codigo: string
  produto: string
  quantidade: number
}

export interface CoverageRow {
  codigo: string
  produto: string
  meses: number
}

export type RiskStatus = 'critico' | 'vermelho' | 'amarelo' | 'verde' | 'parado' | 'sem-dados'

export interface ProductStatus {
  codigo: string
  produto: string
  qtdDisponivel: number
  qtdBloqueada: number
  qtdTotal: number
  reservaVirtual: number
  estoqueUtil: number
  valorMercadorias: number
  valorUnitario: number
  consumo: number
  consumoDiario: number
  diasRestantes: number
  mesesCobertura: number
  giro: number
  sugestaoCompra: number
  status: RiskStatus
  motivoAlerta: string
  semEstoqueEncontrado: boolean
  estaParado: boolean
}

export interface DashboardSummary {
  totalSkus: number
  skusCriticos: number
  skusVermelhos: number
  skusAmarelos: number
  skusVerdes: number
  skusParados: number
  skusSemDados: number
  skusDivergentes: number
  unidadesDisponiveis: number
  valorTotal: number
  valorParado: number
  percentualParado: number
}

export interface AppParams {
  leadTimeDias: number
  periodoRelatorioDias: number
  estoqueSegurancaDias: number
}

export interface DataQualityFlag {
  tipo: 'sem-estoque' | 'sem-consumo' | 'sem-meses' | 'estoque-zero'
  codigo: string
  produto: string
  detalhe: string
}
