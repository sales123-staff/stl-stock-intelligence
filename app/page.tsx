'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
   STL BUSINESS STOCK INTELLIGENCE
   Command Center de compra, estoque, vendas e caixa
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── TYPES ─────────────────────────────────────────────────────────────────

type Classification = 'critico' | 'ruptura' | 'atencao' | 'saudavel' | 'excesso' | 'parado'
type Tab = 'overview' | 'current-stock' | 'cash-leak' | 'revenue-risk' | 'import-ai' | 'not-buy' | 'simulation' | 'security' | 'integrations'
type Recommendation = 'comprar-urgente' | 'comprar' | 'manter' | 'pausar' | 'promover' | 'liquidar' | 'descontinuar'
type Tone = 'emerald' | 'rose' | 'violet' | 'cyan' | 'amber' | 'zinc' | 'blue'

interface SKU {
  codigo: string
  produto: string
  qtdDisponivel: number
  qtdBloqueada: number
  reservaVirtual: number
  estoqueUtil: number
  valorUnitario: number
  precoVenda: number
  precoMedioVenda: number
  receitaPeriodo: number
  precoVendaFonte: 'woocommerce' | 'estimado'
  margem: number
  valorEstoque: number
  consumo: number
  consumoDiario: number
  demandaAteReposicao: number
  unidadesQuePodePerder: number
  estoqueIdeal: number
  diasCobertura: number
  giro: number
  classification: Classification
  recommendation: Recommendation
  sugestaoCompra: number
  valorSugestaoCompra: number
  receitaEmRisco: number
  capitalParado: number
  scorePrioridade: number
  motivo: string
  semEstoqueEncontrado: boolean
}

interface SimParams {
  leadTimeDias: number
  estoqueSegurancaDias: number
  orcamentoCompra: number
  metaReducaoParado: number
}

interface AppParams {
  leadTimeDias: number
  periodoRelatorioDias: number
  estoqueSegurancaDias: number
  margemPadrao: number
}

interface DataSourceState {
  stockSource: string
  demandSource: string
  lastProcessed: string
  wooOrders?: number
  wooSkus?: number
  wooItems?: number
  wooRevenue?: number
}

// ─── SECURITY TYPES ────────────────────────────────────────────────────────

interface SecurityOrder {
  id: number
  number: string
  status: string
  total: number
  dateCreated: string
  billingName: string
  billingEmail: string
  billingPhone: string
  billingAddress: string
}

type RiskLevel = 'alto' | 'medio' | 'baixo'

interface SuspiciousCluster {
  id: string
  riskLevel: RiskLevel
  riskScore: number
  reasons: string[]
  displayNames: string[]
  displayEmails: string[]
  displayPhones: string[]
  displayAddresses: string[]
  orderIds: number[]
  orderNumbers: string[]
  statuses: string[]
  totalValue: number
  firstAttempt: string
  lastAttempt: string
  orderCount: number
  suggestedAction: string
  clusterType: 'email' | 'telefone' | 'endereco' | 'nome'
}

const DEFAULT_PARAMS: AppParams = {
  leadTimeDias: 60,
  periodoRelatorioDias: 90,
  estoqueSegurancaDias: 15,
  margemPadrao: 0.45,
}

// Modo Demo/Pitch: usa faturamento bruto de venda, não margem/lucro.
// Enquanto a rota do WooCommerce não enviar receita por SKU de forma confiável,
// filamentos PLA usam R$ 75 como preço médio bruto de venda para comunicar impacto financeiro.
const PRECO_MEDIO_BRUTO_FILAMENTO = 75
const USAR_FATURAMENTO_BRUTO_NO_PITCH = true

// Regra operacional de compra: filamentos chegam em caixa inner de 12 unidades.
// Qualquer sugestão de compra precisa ser arredondada para múltiplos de 12.
const INNER_BOX_FILAMENT_QTY = 12

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

const CLASS_LABELS: Record<Classification, string> = {
  critico: 'Crítico',
  ruptura: 'Ruptura iminente',
  atencao: 'Atenção',
  saudavel: 'Saudável',
  excesso: 'Excesso',
  parado: 'Parado',
}

const REC_LABELS: Record<Recommendation, string> = {
  'comprar-urgente': 'Comprar urgente',
  comprar: 'Comprar',
  manter: 'Manter',
  pausar: 'Pausar compra',
  promover: 'Promover',
  liquidar: 'Liquidar',
  descontinuar: 'Descontinuar',
}

const CLASS_TONES: Record<Classification, {
  badge: string
  dot: string
  soft: string
  border: string
  text: string
  accent: string
}> = {
  critico: {
    badge: 'border-rose-200 bg-rose-50 text-rose-700 shadow-none',
    dot: 'bg-rose-500',
    soft: 'bg-rose-50',
    border: 'border-rose-200',
    text: 'text-rose-700',
    accent: 'from-rose-50 via-white to-white',
  },
  ruptura: {
    badge: 'border-orange-200 bg-orange-50 text-orange-700 shadow-none',
    dot: 'bg-orange-500',
    soft: 'bg-orange-50',
    border: 'border-orange-200',
    text: 'text-orange-700',
    accent: 'from-orange-50 via-white to-white',
  },
  atencao: {
    badge: 'border-amber-200 bg-amber-50 text-amber-700 shadow-none',
    dot: 'bg-amber-500',
    soft: 'bg-amber-50',
    border: 'border-amber-200',
    text: 'text-amber-700',
    accent: 'from-amber-50 via-white to-white',
  },
  saudavel: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-none',
    dot: 'bg-emerald-500',
    soft: 'bg-emerald-50',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
    accent: 'from-emerald-50 via-white to-white',
  },
  excesso: {
    badge: 'border-sky-200 bg-sky-50 text-sky-700 shadow-none',
    dot: 'bg-sky-500',
    soft: 'bg-sky-50',
    border: 'border-sky-200',
    text: 'text-sky-700',
    accent: 'from-sky-50 via-white to-white',
  },
  parado: {
    badge: 'border-violet-200 bg-violet-50 text-violet-700 shadow-none',
    dot: 'bg-violet-500',
    soft: 'bg-violet-50',
    border: 'border-violet-200',
    text: 'text-violet-700',
    accent: 'from-violet-50 via-white to-white',
  },
}

const REC_TONES: Record<Recommendation, string> = {
  'comprar-urgente': 'border-rose-200 bg-rose-50 text-rose-700',
  comprar: 'border-orange-200 bg-orange-50 text-orange-700',
  manter: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  pausar: 'border-amber-200 bg-amber-50 text-amber-700',
  promover: 'border-violet-200 bg-violet-50 text-violet-700',
  liquidar: 'border-pink-200 bg-pink-50 text-pink-700',
  descontinuar: 'border-slate-300 bg-slate-100 text-slate-700',
}

const TONE_STYLES: Record<Tone, {
  text: string
  border: string
  bg: string
  glow: string
  icon: string
  chip: string
  gradient: string
}> = {
  emerald: {
    text: 'text-emerald-700',
    border: 'border-slate-200',
    bg: 'bg-emerald-50',
    glow: 'shadow-sm',
    icon: 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100',
    chip: 'border-slate-200 bg-white text-slate-600',
    gradient: 'from-emerald-50 via-white to-white',
  },
  rose: {
    text: 'text-rose-700',
    border: 'border-slate-200',
    bg: 'bg-rose-50',
    glow: 'shadow-sm',
    icon: 'bg-rose-50 text-rose-600 ring-1 ring-rose-100',
    chip: 'border-slate-200 bg-white text-slate-600',
    gradient: 'from-rose-50 via-white to-white',
  },
  violet: {
    text: 'text-violet-700',
    border: 'border-slate-200',
    bg: 'bg-violet-50',
    glow: 'shadow-sm',
    icon: 'bg-violet-50 text-violet-600 ring-1 ring-violet-100',
    chip: 'border-slate-200 bg-white text-slate-600',
    gradient: 'from-violet-50 via-white to-white',
  },
  cyan: {
    text: 'text-sky-700',
    border: 'border-slate-200',
    bg: 'bg-sky-50',
    glow: 'shadow-sm',
    icon: 'bg-sky-50 text-sky-600 ring-1 ring-sky-100',
    chip: 'border-slate-200 bg-white text-slate-600',
    gradient: 'from-sky-50 via-white to-white',
  },
  amber: {
    text: 'text-amber-700',
    border: 'border-slate-200',
    bg: 'bg-amber-50',
    glow: 'shadow-sm',
    icon: 'bg-amber-50 text-amber-600 ring-1 ring-amber-100',
    chip: 'border-slate-200 bg-white text-slate-600',
    gradient: 'from-amber-50 via-white to-white',
  },
  zinc: {
    text: 'text-slate-900',
    border: 'border-slate-200',
    bg: 'bg-white',
    glow: 'shadow-sm',
    icon: 'bg-slate-100 text-slate-600 ring-1 ring-slate-200',
    chip: 'border-slate-200 bg-white text-slate-600',
    gradient: 'from-slate-50 via-white to-white',
  },
  blue: {
    text: 'text-blue-700',
    border: 'border-slate-200',
    bg: 'bg-blue-50',
    glow: 'shadow-sm',
    icon: 'bg-blue-50 text-blue-600 ring-1 ring-blue-100',
    chip: 'border-slate-200 bg-white text-slate-600',
    gradient: 'from-blue-50 via-white to-white',
  },
}


const RISK_CONFIG: Record<RiskLevel, { badge: string; dot: string; text: string; label: string }> = {
  alto:  { badge: 'border-rose-200 bg-rose-50 text-rose-700',    dot: 'bg-rose-500',  text: 'text-rose-700',  label: 'Risco alto' },
  medio: { badge: 'border-amber-200 bg-amber-50 text-amber-700', dot: 'bg-amber-500', text: 'text-amber-700', label: 'Risco médio' },
  baixo: { badge: 'border-sky-200 bg-sky-50 text-sky-700',       dot: 'bg-sky-500',   text: 'text-sky-700',   label: 'Risco baixo' },
}

// ─── FORMATTING ────────────────────────────────────────────────────────────

const cn = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ')
const fmtNum = (n: number) => new Intl.NumberFormat('pt-BR').format(Math.round(n))
const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0)
const fmtBRLcompact = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 }).format(n || 0)
const fmtDias = (n: number) => (!isFinite(n) ? '∞' : `${Math.round(n)}d`)
const fmtPct = (n: number) => `${(n || 0).toFixed(1)}%`
const fmtDateTime = (d: string | Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d))
const fmtDate = (d: string | Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(new Date(d))
const fmtDateShort = (d: string | Date) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d))
  } catch {
    return String(d)
  }
}

// ─── CSV PARSING ───────────────────────────────────────────────────────────

function parseBRL(s: string | undefined | null): number {
  if (s === undefined || s === null) return 0
  const raw = String(s).trim()
  if (!raw) return 0

  // Aceita BRL/pt-BR (R$ 1.878,66) e números vindos de APIs (1878.66).
  const cleaned = raw.replace(/R\$/g, '').replace(/\s/g, '').replace(/[^0-9,.-]/g, '')
  if (!cleaned) return 0

  if (cleaned.includes(',')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }

  return parseFloat(cleaned) || 0
}

function detectCSVType(text: string): 'stock' | 'consumption' | 'coverage' | 'unknown' {
  const line = text.split(/\r?\n/)[0] || ''
  if (line.includes('Quantidade disponível') || line.includes('Reserva virtual')) return 'stock'
  if (line.includes('Meses')) return 'coverage'
  if (line.includes('Quantidade') && !line.includes('disponível')) return 'consumption'
  return 'unknown'
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(';').map(h => h.trim())
  return lines.slice(1).map(line => {
    const vals = line.split(';')
    const obj: Record<string, string> = {}
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim() })
    return obj
  }).filter(r => r[headers[0]] && r[headers[0]] !== 'Total')
}

function roundUpToInnerBox(quantity: number): number {
  if (!isFinite(quantity) || quantity <= 0) return 0
  return Math.ceil(quantity / INNER_BOX_FILAMENT_QTY) * INNER_BOX_FILAMENT_QTY
}

function isFilamentProduct(input: string | undefined | null): boolean {
  const text = normalizeText(String(input || ''))
  if (!text) return false

  const includeTerms = [
    'filamento',
    'pla',
    'petg',
    'abs',
    'asa',
    'tpu',
    'silk',
    'matte',
    'pla+',
    'pla plus',
  ]

  const excludeTerms = [
    'impressora',
    'printer',
    'bambulab',
    'bambu lab',
    'a1 combo',
    'a1 mini',
    'ams',
    'snapmaker',
    'creality',
    'ender',
    'k1',
    'k1c',
    'prusa',
    'anycubic',
    'curso',
    'academy',
    'stlacademy',
    'assinatura',
    'bonus',
    'bônus',
    'acelerador',
    'parcelado',
    'pagamento',
    'frete',
    'suporte',
    'mentoria',
    'licenca',
    'licença',
    'download',
    'arquivo',
    'modelo 3d',
  ]

  const hasInclude = includeTerms.some(term => text.includes(term))
  const hasExclude = excludeTerms.some(term => text.includes(term))

  return hasInclude && !hasExclude
}

// ─── BUSINESS LOGIC ────────────────────────────────────────────────────────

function classify(estoqueUtil: number, diasCobertura: number, consumo: number, semEstoque: boolean): Classification {
  if (semEstoque && consumo > 0) return 'critico'
  if (estoqueUtil <= 0 && consumo > 0) return 'critico'
  if (isFinite(diasCobertura) && diasCobertura < 7) return 'critico'
  if (isFinite(diasCobertura) && diasCobertura <= 15) return 'ruptura'
  if (isFinite(diasCobertura) && diasCobertura <= 30) return 'atencao'
  if (consumo === 0 && estoqueUtil > 0) return 'parado'
  if (isFinite(diasCobertura) && diasCobertura > 90) return 'excesso'
  return 'saudavel'
}

function recommend(c: Classification, sku: { giro: number; valorEstoque: number; consumo: number }): Recommendation {
  if (c === 'critico') return 'comprar-urgente'
  if (c === 'ruptura') return 'comprar'
  if (c === 'parado' && sku.valorEstoque > 5000) return 'liquidar'
  if (c === 'parado') return 'promover'
  if (c === 'excesso' && sku.giro < 0.3) return 'descontinuar'
  if (c === 'excesso') return 'pausar'
  if (c === 'atencao') return 'comprar'
  return 'manter'
}

function buildMotivo(
  c: Classification,
  dias: number,
  valorEstoque: number,
  receitaEmRisco: number,
  consumo: number,
  estoqueUtil: number,
  periodoDias: number,
  precoVendaFonte: 'woocommerce' | 'estimado',
  demandaAteReposicao: number,
  unidadesQuePodePerder: number,
): string {
  const fontePreco = precoVendaFonte === 'woocommerce' ? 'preço médio real do WooCommerce' : 'preço médio bruto estimado para pitch'

  switch (c) {
    case 'critico':
      if (!isFinite(dias) || dias <= 0) {
        return `Vendeu ${fmtNum(consumo)} un em ${periodoDias} dias. Com ${fmtNum(estoqueUtil)} em estoque, o faturamento bruto potencial não atendido é ${fmtNum(unidadesQuePodePerder)} un = ${fmtBRLcompact(receitaEmRisco)} (${fontePreco}).`
      }
      return `Vendeu ${fmtNum(consumo)} un em ${periodoDias} dias. Cobertura atual ${Math.round(dias)}d; faturamento bruto potencial não atendido: ${fmtNum(unidadesQuePodePerder)} un = ${fmtBRLcompact(receitaEmRisco)}.`
    case 'ruptura':
      return `Cobertura crítica de ${Math.round(dias)}d. Demanda real de ${fmtNum(consumo)} un em ${periodoDias} dias pode virar venda perdida.`
    case 'atencao':
      return `${Math.round(dias)}d de cobertura — abaixo do lead time + segurança. Monitorar compra.`
    case 'parado':
      return `${fmtNum(estoqueUtil)} un em estoque e ${fmtNum(consumo)} vendidas em ${periodoDias} dias — ${fmtBRLcompact(valorEstoque)} de capital travado.`
    case 'excesso':
      return `Cobertura excessiva de ${Math.round(dias)}d com base nas vendas dos últimos ${periodoDias} dias — capital subutilizado.`
    case 'saudavel':
    default:
      return 'Operando dentro da margem saudável.'
  }
}

function processData(stockRaw: string, consumoRaw: string, _mesesRaw: string, params: AppParams): SKU[] {
  const stockRows = parseCSV(stockRaw)
  const consumoRows = parseCSV(consumoRaw)

  const stockMap = new Map<string, { produto: string; qtdDisp: number; qtdBloq: number; qtdTotal: number; reserva: number; valor: number }>()
  stockRows.forEach(r => {
    const cod = r['Codigo']
    if (!cod || cod === 'Total') return
    const e = stockMap.get(cod)
    const qtdDisp = parseBRL(r['Quantidade disponível'])
    const qtdBloq = parseBRL(r['Quantidade bloqueada'])
    const qtdTotal = parseBRL(r['Quantidade total']) || qtdDisp + qtdBloq
    const reserva = parseBRL(r['Reserva virtual'])
    const valor = parseBRL(r['Valor mercadorias'])
    if (!e) stockMap.set(cod, { produto: r['Produto'] || cod, qtdDisp, qtdBloq, qtdTotal, reserva, valor })
    else {
      e.qtdDisp += qtdDisp
      e.qtdBloq += qtdBloq
      e.qtdTotal += qtdTotal
      e.reserva += reserva
      e.valor += valor
    }
  })

  const estoqueValorTotal = Array.from(stockMap.values()).reduce((total, item) => total + item.valor, 0)
  const estoqueQtdBaseTotal = Array.from(stockMap.values()).reduce((total, item) => total + (item.qtdTotal > 0 ? item.qtdTotal : item.qtdDisp + item.qtdBloq), 0)
  const valorUnitarioMedioEstoque = estoqueQtdBaseTotal > 0 ? estoqueValorTotal / estoqueQtdBaseTotal : 0

  const consumoMap = new Map<string, { produto: string; quantidade: number; receita: number }>()
  consumoRows.forEach(r => {
    const cod = r['Codigo']
    if (!cod) return
    const e = consumoMap.get(cod)
    const qtd = parseBRL(r['Quantidade'])
    const receita = parseBRL(r['Receita'] || r['Receita WooCommerce'] || r['Total'] || r['Subtotal'] || r['Revenue'])
    if (!e) consumoMap.set(cod, { produto: r['Produto'] || cod, quantidade: qtd, receita })
    else {
      e.quantidade += qtd
      e.receita += receita
    }
  })

  const allCodes = new Set([...stockMap.keys(), ...consumoMap.keys()])
  const skus: SKU[] = []

  allCodes.forEach(codigo => {
    const stock = stockMap.get(codigo)
    const consumoData = consumoMap.get(codigo)
    const produto = stock?.produto || consumoData?.produto || codigo

    if (!isFilamentProduct(`${codigo} ${produto}`)) return

    const qtdDisponivel = stock?.qtdDisp ?? 0
    const qtdBloqueada = stock?.qtdBloq ?? 0
    const qtdTotal = stock?.qtdTotal ?? qtdDisponivel + qtdBloqueada
    const reservaVirtual = stock?.reserva ?? 0
    const valorMercadorias = stock?.valor ?? 0
    const consumo = consumoData?.quantidade || 0
    const receitaPeriodo = consumoData?.receita || 0
    const semEstoqueEncontrado = !stock

    // Regra de negócio: estoque < 5 trata como zero (devoluções pontuais)
    let estoqueUtilCalc = Math.max(0, qtdDisponivel - reservaVirtual)
    if (estoqueUtilCalc < 5) estoqueUtilCalc = 0
    const estoqueUtil = estoqueUtilCalc

    // Valor unitário de estoque deve usar o total da mercadoria quando existir.
    // Antes o cálculo usava apenas a quantidade disponível, o que distorcia SKUs com reserva/bloqueio
    // e fazia alguns filamentos parecerem muito mais caros do que são.
    const baseValorEstoque = qtdTotal > 0 ? qtdTotal : (qtdDisponivel + qtdBloqueada > 0 ? qtdDisponivel + qtdBloqueada : qtdDisponivel)
    const valorUnitarioCalculado = baseValorEstoque > 0 && valorMercadorias > 0 ? valorMercadorias / baseValorEstoque : 0
    const valorUnitario = valorUnitarioCalculado > 0 ? valorUnitarioCalculado : valorUnitarioMedioEstoque
    const margem = params.margemPadrao

    // Receita que podemos deixar de ganhar usa faturamento bruto, não lucro líquido.
    // Prioridade para preço médio real do WooCommerce.
    // Fallback de demo/pitch: filamentos PLA usam R$ 75 como preço médio bruto de venda.
    const precoMedioVendaReal = consumo > 0 && receitaPeriodo > 0 ? receitaPeriodo / consumo : 0
    const isFilamento = isFilamentProduct(`${codigo} ${produto}`)
    const precoVendaEstimadoSku = valorUnitario > 0 ? valorUnitario / (1 - margem) : 0
    const precoVendaEstimadoPortfolio = valorUnitarioMedioEstoque > 0 ? valorUnitarioMedioEstoque / (1 - margem) : precoVendaEstimadoSku
    const limiteInferiorPreco = precoVendaEstimadoPortfolio > 0 ? precoVendaEstimadoPortfolio * 0.70 : 0
    const limiteSuperiorPreco = precoVendaEstimadoPortfolio > 0 ? precoVendaEstimadoPortfolio * 1.30 : Number.POSITIVE_INFINITY
    const precoVendaEstimadoPorCusto = precoVendaEstimadoSku > 0
      ? Math.min(Math.max(precoVendaEstimadoSku, limiteInferiorPreco), limiteSuperiorPreco)
      : precoVendaEstimadoPortfolio
    const precoVendaEstimado = USAR_FATURAMENTO_BRUTO_NO_PITCH && isFilamento
      ? PRECO_MEDIO_BRUTO_FILAMENTO
      : precoVendaEstimadoPorCusto
    const precoMedioVenda = precoMedioVendaReal > 0 ? precoMedioVendaReal : precoVendaEstimado
    const precoVendaFonte: 'woocommerce' | 'estimado' = precoMedioVendaReal > 0 ? 'woocommerce' : 'estimado'
    const precoVenda = precoMedioVenda
    const valorEstoque = estoqueUtil * valorUnitario

    const consumoDiario = params.periodoRelatorioDias > 0 ? consumo / params.periodoRelatorioDias : 0
    const diasCobertura = consumoDiario > 0 ? estoqueUtil / consumoDiario : (consumo === 0 ? Infinity : 0)
    const giro = estoqueUtil > 0 ? consumo / estoqueUtil : (consumo > 0 ? 999 : 0)

    const classification = classify(estoqueUtil, diasCobertura, consumo, semEstoqueEncontrado)

    const estoqueIdeal = consumoDiario * (params.leadTimeDias + params.estoqueSegurancaDias)
    const sugestaoCompraBase = Math.max(0, estoqueIdeal - estoqueUtil)
    const sugestaoCompra = roundUpToInnerBox(sugestaoCompraBase)
    const valorSugestaoCompra = sugestaoCompra * valorUnitario

    // Receita que pode ser perdida = preço médio bruto de venda x quantidade que podemos deixar de vender.
    // Para o pitch/demo de hoje, quando o SKU está crítico, usamos a venda real do período como
    // faturamento bruto potencial não atendido. Ex.: PLA Preto 3.063 un x R$ 75 = ~R$ 230 mil.
    // A sugestão de compra continua usando lead time + estoque de segurança.
    const demandaAteReposicao = consumoDiario * params.leadTimeDias
    const perdaPorLeadTime = Math.max(0, demandaAteReposicao - estoqueUtil)
    const perdaBrutaPeriodo = Math.max(0, consumo - estoqueUtil)
    const unidadesQuePodePerder = USAR_FATURAMENTO_BRUTO_NO_PITCH && consumo > 0 && (estoqueUtil <= 0 || classification === 'critico' || classification === 'ruptura')
      ? Math.max(perdaPorLeadTime, perdaBrutaPeriodo)
      : perdaPorLeadTime
    const receitaEmRisco = unidadesQuePodePerder * precoMedioVenda

    // Caixa parado: estoque acima do necessário para cobrir lead time + segurança.
    // Se não vendeu nada no período, todo o estoque útil é tratado como capital parado.
    const estoqueExcedente = consumo > 0 ? Math.max(0, estoqueUtil - estoqueIdeal) : estoqueUtil
    const capitalParado = estoqueExcedente * valorUnitario
    const recommendation = recommend(classification, { giro, valorEstoque: capitalParado || valorEstoque, consumo })

    let scorePrioridade = 0
    const pesoReceita = Math.min(45, Math.log10(receitaEmRisco + 1) * 9)
    const pesoDemanda = Math.min(20, Math.log10(consumo + 1) * 4.5)
    const pesoEstoque = estoqueUtil <= 0 && consumo > 0 ? 20 : isFinite(diasCobertura) && diasCobertura < 7 ? 15 : isFinite(diasCobertura) && diasCobertura < 15 ? 10 : 0

    if (classification === 'critico') scorePrioridade = 35 + pesoReceita + pesoDemanda + pesoEstoque
    else if (classification === 'ruptura') scorePrioridade = 28 + pesoReceita + pesoDemanda + pesoEstoque
    else if (classification === 'atencao') scorePrioridade = 18 + pesoReceita + pesoDemanda
    else if (classification === 'parado') scorePrioridade = 18 + Math.min(35, Math.log10(capitalParado + 1) * 7)
    else if (classification === 'excesso') scorePrioridade = 12 + Math.min(30, Math.log10(capitalParado + 1) * 6)
    else scorePrioridade = 5
    scorePrioridade = Math.min(100, Math.round(scorePrioridade))

    const motivo = buildMotivo(classification, diasCobertura, capitalParado || valorEstoque, receitaEmRisco, consumo, estoqueUtil, params.periodoRelatorioDias, precoVendaFonte, demandaAteReposicao, unidadesQuePodePerder)

    skus.push({
      codigo, produto, qtdDisponivel, qtdBloqueada, reservaVirtual, estoqueUtil,
      valorUnitario, precoVenda, precoMedioVenda, receitaPeriodo, precoVendaFonte, margem, valorEstoque, consumo, consumoDiario,
      demandaAteReposicao, unidadesQuePodePerder, estoqueIdeal,
      diasCobertura, giro, classification, recommendation, sugestaoCompra,
      valorSugestaoCompra, receitaEmRisco, capitalParado, scorePrioridade,
      motivo, semEstoqueEncontrado,
    })
  })

  return skus
}

// ─── CSV EXPORT ────────────────────────────────────────────────────────────

function exportCSV(rows: Record<string, any>[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => {
      const v = r[h]
      if (typeof v === 'number') return Math.round(v * 100) / 100
      return String(v ?? '').replace(/;/g, ',').replace(/[\r\n]+/g, ' ')
    }).join(';')),
  ].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

function escapeCsvValue(value: any) {
  return String(value ?? '')
    .replace(/;/g, ',')
    .replace(/[\r\n]+/g, ' ')
    .trim()
}

function buildConsumoCsvFromWoo(skuSummary: any[]) {
  const rows = skuSummary
    .filter((item) => {
      const sku = String(item.sku || '')
      const name = String(item.name || item.product_name || item.sku || '')

      return (
        Number(item.quantity || 0) > 0 &&
        isFilamentProduct(`${sku} ${name}`)
      )
    })
    .map((item) => {
      const sku = escapeCsvValue(item.sku)
      const name = escapeCsvValue(item.name || item.product_name || item.sku)
      const quantity = Number(item.quantity || 0)

      // A rota pode retornar revenue, total, subtotal ou campos agregados equivalentes.
      // Essa receita é a base correta para calcular venda perdida projetada.
      const revenue = Number(
        item.revenue ??
        item.totalRevenue ??
        item.total_revenue ??
        item.total ??
        item.subtotal ??
        item.sales ??
        0
      ) || 0

      return `${sku};${name};${quantity};${revenue.toFixed(2)}`
    })

  return ['Codigo;Produto;Quantidade;Receita', ...rows].join('\n')
}


// ─── SECURITY HELPERS ──────────────────────────────────────────────────────

function normalizeText(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePhone(s: string): string {
  return (s || '').replace(/\D/g, '')
}

function normalizeEmail(s: string): string {
  return (s || '').toLowerCase().trim()
}

function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email || 'n/a'
  const [user, domain] = email.split('@')
  if (!domain) return email
  return `${user.slice(0, 2)}***@${domain}`
}

function maskPhone(phone: string): string {
  const digits = normalizePhone(phone)
  if (digits.length < 6) return phone || 'n/a'
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)}***${digits.slice(-2)}`
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 70) return 'alto'
  if (score >= 40) return 'medio'
  return 'baixo'
}

function dateSortAsc(a: SecurityOrder, b: SecurityOrder) {
  return a.dateCreated.localeCompare(b.dateCreated)
}

function analyzeSecurityOrders(orders: SecurityOrder[]): SuspiciousCluster[] {
  const RISK_STATUSES = new Set(['failed', 'cancelled', 'pending', 'on-hold', 'refunded', 'checkout-draft'])
  const riskOrders = orders.filter(o => RISK_STATUSES.has(o.status))
  if (!riskOrders.length) return []

  const clusters: SuspiciousCluster[] = []
  const processedOrderIds = new Set<number>()

  function makeCluster(
    clusterType: SuspiciousCluster['clusterType'],
    key: string,
    clusterOrders: SecurityOrder[],
    baseScore: number,
    baseReason: string,
  ) {
    if (clusterOrders.length < 2) return

    let score = baseScore
    const reasons: string[] = [baseReason]
    const totalValue = clusterOrders.reduce((s, o) => s + Number(o.total || 0), 0)
    const uniqueNames = [...new Set(clusterOrders.map(o => normalizeText(o.billingName)).filter(Boolean))]
    const uniqueAddresses = [...new Set(clusterOrders.map(o => normalizeText(o.billingAddress)).filter(Boolean))]
    const days = clusterOrders.map(o => (o.dateCreated || '').slice(0, 10)).filter(Boolean)
    const hasSameDay = days.some((d, i) => days.indexOf(d) !== i)

    if (clusterOrders.length >= 3) score += 15
    if (uniqueNames.length > 1) { score += 20; reasons.push(`${uniqueNames.length} nomes diferentes no mesmo padrão`) }
    if (uniqueAddresses.length > 1 && clusterType !== 'endereco') { score += 10; reasons.push(`${uniqueAddresses.length} endereços diferentes no mesmo padrão`) }
    if (totalValue >= 2000) { score += 15; reasons.push(`Valor total alto: ${fmtBRLcompact(totalValue)}`) }
    else if (totalValue >= 1000) { score += 10; reasons.push(`Valor total relevante: ${fmtBRLcompact(totalValue)}`) }
    if (hasSameDay) { score += 10; reasons.push('Múltiplas tentativas no mesmo dia') }

    const sorted = [...clusterOrders].sort(dateSortAsc)
    const riskLevel = riskLevelFromScore(score)
    clusterOrders.forEach(o => processedOrderIds.add(o.id))

    clusters.push({
      id: `${clusterType}-${key}`,
      riskLevel,
      riskScore: Math.min(100, Math.round(score)),
      reasons,
      displayNames: [...new Set(clusterOrders.map(o => o.billingName).filter(Boolean))],
      displayEmails: [...new Set(clusterOrders.map(o => maskEmail(o.billingEmail)).filter(Boolean))],
      displayPhones: [...new Set(clusterOrders.map(o => maskPhone(o.billingPhone)).filter(Boolean))],
      displayAddresses: [...new Set(clusterOrders.map(o => o.billingAddress).filter(Boolean))],
      orderIds: clusterOrders.map(o => o.id),
      orderNumbers: clusterOrders.map(o => o.number || String(o.id)),
      statuses: [...new Set(clusterOrders.map(o => o.status))],
      totalValue,
      firstAttempt: sorted[0]?.dateCreated || '',
      lastAttempt: sorted[sorted.length - 1]?.dateCreated || '',
      orderCount: clusterOrders.length,
      suggestedAction: riskLevel === 'alto'
        ? 'Revisar manualmente e não liberar envio sem validação.'
        : riskLevel === 'medio'
          ? 'Verificar antifraude antes de qualquer liberação.'
          : 'Monitorar novas tentativas e marcar como falso positivo se confirmado.',
      clusterType,
    })
  }

  const byEmail = new Map<string, SecurityOrder[]>()
  riskOrders.forEach(o => {
    const key = normalizeEmail(o.billingEmail)
    if (!key || !key.includes('@')) return
    byEmail.set(key, [...(byEmail.get(key) || []), o])
  })
  byEmail.forEach((grp, key) => makeCluster('email', key, grp, grp.length >= 3 ? 30 : 15, `E-mail repetido em ${grp.length} pedidos malsucedidos`))

  const byPhone = new Map<string, SecurityOrder[]>()
  riskOrders.forEach(o => {
    const key = normalizePhone(o.billingPhone)
    if (!key || key.length < 8) return
    byPhone.set(key, [...(byPhone.get(key) || []), o])
  })
  byPhone.forEach((grp, key) => {
    const unprocessed = grp.filter(o => !processedOrderIds.has(o.id))
    makeCluster('telefone', key, unprocessed.length >= 2 ? unprocessed : grp, grp.length >= 3 ? 25 : 15, `Telefone repetido em ${grp.length} pedidos malsucedidos`)
  })

  const byAddress = new Map<string, SecurityOrder[]>()
  riskOrders.forEach(o => {
    const key = normalizeText(o.billingAddress)
    if (!key || key.length < 10) return
    byAddress.set(key, [...(byAddress.get(key) || []), o])
  })
  byAddress.forEach((grp, key) => {
    if (grp.length < 2) return
    const unprocessed = grp.filter(o => !processedOrderIds.has(o.id))
    makeCluster('endereco', key.slice(0, 40), unprocessed.length >= 2 ? unprocessed : grp, grp.length >= 3 ? 40 : 25, `Endereço repetido em ${grp.length} pedidos malsucedidos`)
  })

  const byName = new Map<string, SecurityOrder[]>()
  riskOrders.forEach(o => {
    const key = normalizeText(o.billingName)
    if (!key || key.length < 5) return
    byName.set(key, [...(byName.get(key) || []), o])
  })
  byName.forEach((grp, key) => {
    if (grp.length < 3) return
    const unprocessed = grp.filter(o => !processedOrderIds.has(o.id))
    makeCluster('nome', key, unprocessed.length >= 2 ? unprocessed : grp, 20, `Mesmo nome em ${grp.length} pedidos malsucedidos`)
  })

  const uniqueById = new Map<string, SuspiciousCluster>()
  clusters.forEach(c => uniqueById.set(c.id, c))
  return [...uniqueById.values()].sort((a, b) => b.riskScore - a.riskScore || b.totalValue - a.totalValue)
}

// ─── MOCK DATA ─────────────────────────────────────────────────────────────

const MOCK_STOCK = `Codigo;Produto;Quantidade disponível;Quantidade bloqueada;Quantidade total;Volume;Valor mercadorias;Nf;Reserva virtual
PLAPR1;PLA Preto;1,00;1,00;1,00;0;R$24,30;3407;0,00
PLAMA2;PLA Marmore Branco;52,00;0,00;71,00;25;R$1.878,66;4363;1,00
PLAMABR1;PLA Branco Matte;252,00;0,00;252,00;21;R$6.667,92;4363;0,00
PLAMAPR1;PLA Preto Matte;351,00;0,00;351,00;30;R$8.908,38;4363;0,00
PLABR1;PLA Branco;689,00;0,00;749,00;83;R$18.200,70;4363;4,00
PLASIL15;PLA Silk Preto Iron;3,00;0,00;39,00;10;R$1.053,00;3408;11,00
PLAMARO1;PLA Rosa Matte;300,00;0,00;300,00;25;R$7.938,00;4363;0,00
PLACO1;PLA Silk Cobre;769,00;0,00;771,00;67;R$20.817,00;3407;0,00
PLAVE2;PLA Silk Verde;504,00;0,00;504,00;42;R$13.608,00;3407;0,00
PLADO1;PLA Silk Dourado;708,00;0,00;708,00;59;R$19.116,00;3408;0,00
PLAMAAZ1;PLA Azul Matte;453,00;0,00;459,00;48;R$11.649,42;3407;0,00
PLAMALA1;PLA Lavanda Matte;583,00;0,00;585,00;50;R$14.847,30;3407;0,00
PLABI14;PLA Silk Vermelho e Preto;360,00;0,00;360,00;30;R$10.440,00;3407;0,00
PLAGRA4;PLA Gradiente Rosa e Roxo Matte;178,00;0,00;182,00;20;R$4.914,00;5240;1,00
PLAGRA5;PLA Rainbow Azul, Roxo e Rosa Matte;199,00;0,00;202,00;21;R$5.454,00;5332;1,00
PLAGRA3;PLA Gradiente Vermelho e Amarelo Matte;189,00;0,00;192,00;20;R$5.184,00;5240;1,00
PLAGRA1;PLA Gradiente Amarelo e Azul Matte;161,00;0,00;169,00;20;R$4.563,00;5240;1,00
PLAGRA2;PLA Gradiente Azul e Roxo Matte;239,00;0,00;239,00;20;R$6.453,00;5240;0,00
PLAMAAM2;PLA Amarelo Pastel Matte;209,00;0,00;213,00;20;R$5.751,00;5240;0,00
PLAMACI1;PLA Cinza Matte;349,00;0,00;352,00;47;R$8.933,76;3407;1,00
PLAMALLI1;PLA Lilas Matte;528,00;0,00;529,00;44;R$13.426,02;3407;0,00
PLABI17;PLA Silk Bronze;254,00;0,00;259,00;44;R$6.993,00;3407;4,00
PLABI16;PLA Silk Azul e Prata;356,00;1,00;356,00;32;R$10.324,00;3407;0,00
PLALI10;PLA Lilas;257,00;2,00;260,00;26;R$6.318,00;3407;0,00
PLAMA3;PLA Marmore Cinza;598,00;0,00;600,00;79;R$15.876,00;3407;1,00
PLAMABE1;PLA Bege Matte;300,00;0,00;300,00;25;R$7.938,00;4363;0,00
PLASIL13;PLA Silk Vermelho;484,00;0,00;489,00;50;R$13.203,00;3407;0,00
PLASIL21;PLA Silk Dourado e Preto;354,00;0,00;357,00;32;R$10.353,00;3407;0,00
PLAMAVE2;PLA Verde Escuro Matte;300,00;0,00;300,00;25;R$7.938,00;3408;0,00
PLAMAAM1;PLA Amarelo Matte;439,00;0,00;444,00;50;R$11.268,72;3407;1,00
PLARO1;PLA Roxo;300,00;0,00;300,00;25;R$7.290,00;4363;0,00
PLAAMA2;PLA Mostarda;257,00;0,00;277,00;49;R$6.731,10;3407;2,00
PLAMARA1;PLA Rainbow Pastel Matte;123,00;0,00;130,00;20;R$3.510,00;5240;1,00
PLABI10;PLA Silk Roxo e Prata;180,00;0,00;180,00;15;R$5.220,00;3407;0,00
PLABE1;PLA Bege;207,00;0,00;214,00;27;R$5.200,20;4363;0,00
PLABO1;PLA Bordo;204,00;0,00;204,00;17;R$4.957,20;4363;0,00
PLAVER11;PLA Verde Menta;204,00;0,00;204,00;17;R$4.957,20;4363;0,00
PLAVER12;PLA Verde Escuro;204,00;0,00;204,00;17;R$4.957,20;4363;0,00
PLACIN12;PLA Cinza Escuro;300,00;0,00;300,00;25;R$7.290,00;4363;0,00
PLACIA1;PLA Ciano;204,00;0,00;204,00;17;R$4.957,20;4363;0,00
PLABIA;PLA Silk Azul e Roxo;180,00;0,00;180,00;15;R$5.220,00;3408;0,00
PLAMABR2;PLA Branco Osso Matte;152,00;0,00;166,00;20;R$4.482,00;5240;1,00
PLAMAVER1;PLA Vermelho Matte;96,00;0,00;104,00;20;R$2.808,00;5240;1,00
PLAMAVE3;PLA Verde Menta Matte;191,00;0,00;194,00;19;R$5.238,00;5240;0,00
PLAAZ1;PLA Azul Claro;238,00;0,00;240,00;20;R$5.832,00;3408;1,00
PLAAZU10;PLA Azul Esverdeado;162,00;0,00;165,00;17;R$4.009,50;4363;1,00
PLABR2;PLA Silk Branco;381,00;0,00;387,00;42;R$10.449,00;4363;0,00
PLASIL9;PLA Silk Azul;307,00;0,00;314,00;49;R$8.478,00;3407;0,00
PLARO2;PLA Rosa Claro;472,00;4,00;477,00;60;R$11.591,10;4363;0,00
PLAMAAZ2;PLA Azul Escuro Matte;239,00;0,00;239,00;20;R$6.453,00;5240;0,00
PLABI1;PLA Silk Verde e Azul;360,00;0,00;360,00;30;R$10.440,00;3407;0,00
PLABI3;PLA Silk Verde e Amarelo;384,00;0,00;384,00;32;R$11.136,00;3407;0,00
PLABI9;PLA Rosa e Dourado;192,00;0,00;192,00;16;R$5.568,00;3407;0,00
PLABI15;PLA Silk Vermelho e Verde;159,00;0,00;159,00;15;R$4.611,00;3407;0,00
PLABIR;PLA Silk Roxo e Dourado;192,00;0,00;192,00;16;R$5.568,00;3407;0,00
PLABIV;PLA Silk Vermelho e Dourado;192,00;0,00;192,00;16;R$5.568,00;3407;0,00
PLAVBI13;PLA Silk Vermelho e Azul;267,00;0,00;267,00;23;R$7.743,00;3407;0,00
PLACI2;PLA Silk Cinza;310,00;0,00;313,00;46;R$8.451,00;3407;0,00
PLASIL16;PLA Silk Prata;65,00;0,00;84,00;20;R$2.268,00;3407;10,00
PLASIL18;PLA Silk Dourado Claro;77,00;0,00;84,00;17;R$2.268,00;4363;1,00
PLARO3;PLA Silk Rosa Pink;600,00;0,00;600,00;50;R$16.200,00;3407;0,00
PLAMAMA1;PLA Marrom Claro Matte;101,00;0,00;104,00;20;R$2.808,00;5240;0,00
PLAMACA1;PLA Cafe Com Leite Matte;118,00;0,00;139,00;25;R$3.677,94;4363;1,00
PLAMABA1;PLA Bala de Arco Iris Matte;300,00;0,00;300,00;25;R$7.938,00;3408;0,00
PLAVER13;PLA Verde Amarelado;204,00;0,00;204,00;17;R$4.957,20;4363;0,00
PLACIN11;PLA Cinza Claro;182,00;0,00;185,00;17;R$4.495,50;4363;0,00
PLAMAVE1;PLA Verde Matte;264,00;0,00;264,00;22;R$6.985,44;4363;0,00`

const MOCK_CONSUMO = `Codigo;Produto;Quantidade
PLAPR1;PLA Preto;3063
PLAMA2;PLA Marmore Branco;1840
PLAVE1;PLA Vermelho;1287
PLAMA1;PLA Marrom;1413
PLAMAPR1;PLA Preto Matte;1239
PLAMABR1;PLA Branco Matte;902
PLAVER2;PLA Vermelho Dragao;982
PLASIL15;PLA Silk Preto Iron;854
PLABR1;PLA Branco;563
PLADO1;PLA Silk Dourado;411
PLACO1;PLA Silk Cobre;371
PLAVE2;PLA Silk Verde;346
PLAMALA1;PLA Lavanda Matte;341
PLAMA3;PLA Marmore Cinza;331
PLABI14;PLA Silk Vermelho e Preto;313
PLARO1;PLA Roxo;297
PLAMACI1;PLA Cinza Matte;261
PLARO3;PLA Silk Rosa Pink;258
PLAMARO1;PLA Rosa Matte;258
PLAMAAM1;PLA Amarelo Matte;253
PLASIL13;PLA Silk Vermelho;237
PLAMAAZ1;PLA Azul Matte;233
PLASIL21;PLA Silk Dourado e Preto;227
PLABI17;PLA Silk Bronze;211
PLAMAVE1;PLA Verde Matte;205
PLAAMA2;PLA Mostarda;202
PLAMALLI1;PLA Lilas Matte;196
PLAAZ1;PLA Azul Claro;196
PLASIL9;PLA Silk Azul;188
PLALI10;PLA Lilas;186
PLAMABA1;PLA Bala de Arco Iris Matte;178
PLAVER11;PLA Verde Menta;175
PLACIN12;PLA Cinza Escuro;175
PLABI16;PLA Silk Azul e Prata;168
PLARO2;PLA Rosa Claro;168
PLABI3;PLA Silk Verde e Amarelo;169
PLACI2;PLA Silk Cinza;170
PLAAZU10;PLA Azul Esverdeado;159
PLABI10;PLA Silk Roxo e Prata;149
PLASIL16;PLA Silk Prata;142
PLABI1;PLA Silk Verde e Azul;138
PLAVER12;PLA Verde Escuro;137
PLAMAVE2;PLA Verde Escuro Matte;118
PLABR2;PLA Silk Branco;118
PLAMAVER1;PLA Vermelho Matte;117
PLABI9;PLA Rosa e Dourado;111
PLABO1;PLA Bordo;111
PLABI15;PLA Silk Vermelho e Verde;107
PLABIR;PLA Silk Roxo e Dourado;99
PLABIA;PLA Silk Azul e Roxo;91
PLAMABE1;PLA Bege Matte;88
PLAMARA1;PLA Rainbow Pastel Matte;84
PLACIN11;PLA Cinza Claro;82
PLAGRA1;PLA Gradiente Amarelo e Azul Matte;79
PLABE1;PLA Bege;74
PLAGRA5;PLA Rainbow Azul, Roxo e Rosa Matte;73
PLAGRA3;PLA Gradiente Vermelho e Amarelo Matte;72
PLABIV;PLA Silk Vermelho e Dourado;68
PLAMAAZ2;PLA Azul Escuro Matte;66
PLAMAMA1;PLA Marrom Claro Matte;66
PLAMACA1;PLA Cafe Com Leite Matte;68
PLAGRA4;PLA Gradiente Rosa e Roxo Matte;67
PLASIL18;PLA Silk Dourado Claro;58
PLAVER13;PLA Verde Amarelado;55
PLAGRA2;PLA Gradiente Azul e Roxo Matte;52
PLAMAAM2;PLA Amarelo Pastel Matte;46
PLAMAVE3;PLA Verde Menta Matte;37
PLALA1;PLA Laranja;31
PLAAMA1;PLA Amarelo;22
PLASIL20;PLA Silk Preto e Dourado;12
AMOSTRAS;AMOSTRAS;2`

// Mock para demonstração da aba de segurança enquanto a rota não retornar riskOrders
const MOCK_SECURITY_ORDERS: SecurityOrder[] = [
  { id: 10001, number: '10453', status: 'failed', total: 485.90, dateCreated: '2026-05-10T14:23:00', billingName: 'Carlos Silva', billingEmail: 'carloss.xxx@hotmail.com', billingPhone: '11987654321', billingAddress: 'Rua das Flores 123, Vila Nova, São Paulo SP 01234-567' },
  { id: 10002, number: '10454', status: 'failed', total: 612.50, dateCreated: '2026-05-10T14:47:00', billingName: 'Carlos Souza', billingEmail: 'carloss.xxx@hotmail.com', billingPhone: '11987654321', billingAddress: 'Rua das Flores 123, Vila Nova, São Paulo SP 01234-567' },
  { id: 10003, number: '10461', status: 'cancelled', total: 723.00, dateCreated: '2026-05-11T09:12:00', billingName: 'C. Silva', billingEmail: 'csilva.novo@outlook.com', billingPhone: '11912345678', billingAddress: 'Rua das Flores 123, Vila Nova, São Paulo SP 01234-567' },
  { id: 10004, number: '10467', status: 'failed', total: 892.00, dateCreated: '2026-05-12T10:00:00', billingName: 'Ana Costa', billingEmail: 'compras_fast@tempmail.io', billingPhone: '21900001111', billingAddress: 'Av. Brasil 500, Centro, Rio de Janeiro RJ 20000-000' },
  { id: 10005, number: '10468', status: 'failed', total: 1200.00, dateCreated: '2026-05-12T10:15:00', billingName: 'Ana C.', billingEmail: 'compras_fast@tempmail.io', billingPhone: '21900001111', billingAddress: 'Av. Brasil 500, Centro, Rio de Janeiro RJ 20000-000' },
  { id: 10006, number: '10469', status: 'failed', total: 950.00, dateCreated: '2026-05-12T10:31:00', billingName: 'Ana Costa', billingEmail: 'compras_fast@tempmail.io', billingPhone: '21987654321', billingAddress: 'Av. Brasil 502, Centro, Rio de Janeiro RJ 20000-002' },
  { id: 10007, number: '10472', status: 'on-hold', total: 340.00, dateCreated: '2026-05-13T08:20:00', billingName: 'Pedro Lima', billingEmail: 'pedro.lima@gmail.com', billingPhone: '51934567890', billingAddress: 'Rua Alegre 77, Jardim, Porto Alegre RS 90000-123' },
  { id: 10008, number: '10480', status: 'failed', total: 280.00, dateCreated: '2026-05-14T16:05:00', billingName: 'Pedro J. Lima', billingEmail: 'p.lima.novo@gmail.com', billingPhone: '51934567890', billingAddress: 'Rua Alegre 77, Jardim, Porto Alegre RS 90000-123' },
  { id: 10009, number: '10481', status: 'failed', total: 510.00, dateCreated: '2026-05-14T16:22:00', billingName: 'P Lima', billingEmail: 'plima_xx@yahoo.com', billingPhone: '51934567890', billingAddress: 'Rua Alegre 77, Jardim, Porto Alegre RS 90000-123' },
]

// ─── ICONS ─────────────────────────────────────────────────────────────────

const Icon = ({ name, className = 'h-4 w-4' }: { name: string; className?: string }) => {
  const paths: Record<string, ReactNode> = {
    upload: <><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 7.5m0 0L7.5 12M12 7.5v9" /></>,
    chart: <><path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" /></>,
    alert: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" /></>,
    cash: <><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V12Zm-12 0h.008v.008H6V12Z" /></>,
    truck: <><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></>,
    block: <><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" /></>,
    sliders: <><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" /></>,
    download: <><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></>,
    bolt: <><path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></>,
    database: <><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 1.243-3.694 2.25-8.25 2.25s-8.25-1.007-8.25-2.25m16.5 0c0-1.243-3.694-2.25-8.25-2.25s-8.25 1.007-8.25 2.25m16.5 0v11.25c0 1.243-3.694 2.25-8.25 2.25s-8.25-1.007-8.25-2.25V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0c0 1.243-3.694 2.25-8.25 2.25s-8.25-1.007-8.25-2.25m16.5 0v3.75c0 1.243-3.694 2.25-8.25 2.25s-8.25-1.007-8.25-2.25v-3.75" /></>,
    sparkles: <><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 0 0 2.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z" /></>,
    check: <><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></>,
    x: <><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></>,
    store: <><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5A.75.75 0 0 1 14.25 12h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.25m11.25 0H21m-18.75 0v-6.75A.75.75 0 0 1 3 13.5h7.5a.75.75 0 0 1 .75.75V21M3 3h18M4.5 3v3.75A2.25 2.25 0 0 0 6.75 9h10.5a2.25 2.25 0 0 0 2.25-2.25V3" /></>,
    file: <><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-.988-2.387l-5.25-5.25A3.375 3.375 0 0 0 10.875 3H8.25A2.25 2.25 0 0 0 6 5.25v13.5A2.25 2.25 0 0 0 8.25 21h7.5A2.25 2.25 0 0 0 18 18.75m-6-15v4.5A2.25 2.25 0 0 0 14.25 10.5h4.5" /></>,
    brain: <><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 3.055A9 9 0 1 0 20.945 14.19M9.813 3.055A9 9 0 0 1 20.945 14.19M9.813 3.055c.358.165.75.258 1.164.258 1.279 0 2.39-.88 2.69-2.086M20.945 14.19a2.777 2.777 0 0 1-2.69-2.086 2.777 2.777 0 0 0-2.69-2.086 2.777 2.777 0 0 0-2.69 2.086M8.25 9.75h.008v.008H8.25V9.75Zm3.75 5.25h.008v.008H12V15Zm3-8.25h.008v.008H15V6.75Z" /></>,
    clock: <><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></>,
    shield: <><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.75c0 5.592 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.75h-.152c-3.196 0-6.1-1.25-8.25-3.286Z" /></>,
    package: <><path strokeLinecap="round" strokeLinejoin="round" d="m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25m0-9L3 7.5m9 5.25v9M3 7.5v9l9 5.25" /></>,
    arrowRight: <><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" /></>,
    refresh: <><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></>,
    plug: <><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18m-4.5 0V3.75M18 6V3.75m0 2.25v4.5a6 6 0 0 1-12 0V6m0 0V3.75M6 6H3.75M6 6h7.5m-1.5 9.75V21" /></>,
    command: <><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5m-10.5 9h10.5M4.5 12h15" /></>,
    layers: <><path strokeLinecap="round" strokeLinejoin="round" d="m6.429 9.75 5.571 3 5.571-3M3.75 7.5 12 3l8.25 4.5L12 12 3.75 7.5Zm0 6 8.25 4.5 8.25-4.5" /></>,
  }

  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      {paths[name]}
    </svg>
  )
}

// ─── COMPONENTS ────────────────────────────────────────────────────────────

function GlassPanel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>
      {children}
    </div>
  )
}

function StatusPill({ label, tone = 'emerald', pulse = false }: { label: string; tone?: Tone; pulse?: boolean }) {
  const dot = tone === 'emerald' ? 'bg-emerald-500' : tone === 'rose' ? 'bg-rose-500' : tone === 'violet' ? 'bg-violet-500' : tone === 'cyan' ? 'bg-sky-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'blue' ? 'bg-blue-500' : 'bg-slate-400'
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm">
      <span className={cn('h-1.5 w-1.5 rounded-full', dot, pulse && 'animate-pulse')} />
      {label}
    </span>
  )
}

function ClassBadge({ c }: { c: Classification }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', CLASS_TONES[c].badge)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', CLASS_TONES[c].dot)} />
      {CLASS_LABELS[c]}
    </span>
  )
}

function RecBadge({ r }: { r: Recommendation }) {
  return <span className={cn('inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap', REC_TONES[r])}>{REC_LABELS[r]}</span>
}


function RiskBadge({ level }: { level: RiskLevel }) {
  const cfg = RISK_CONFIG[level]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold', cfg.badge)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dot)} />
      {cfg.label}
    </span>
  )
}

function KpiCard({
  label, value, sub, icon, tone = 'zinc', action, emphasis = false,
}: {
  label: string
  value: string | number
  sub?: string
  icon?: string
  tone?: Tone
  action?: string
  emphasis?: boolean
}) {
  const styles = TONE_STYLES[tone]
  return (
    <div className={cn(
      'group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md',
      emphasis ? 'min-h-[154px]' : 'min-h-[136px]',
    )}>
      <div className="flex h-full flex-col justify-between gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
            <p className={cn('mt-4 font-bold tracking-tight', emphasis ? 'text-4xl sm:text-5xl' : 'text-3xl', styles.text)}>{value}</p>
          </div>
          {icon && (
            <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', styles.icon)}>
              <Icon name={icon} className="h-5 w-5" />
            </div>
          )}
        </div>
        <div>
          {sub && <p className="text-sm leading-5 text-slate-500">{sub}</p>}
          {action && <p className={cn('mt-3 text-xs font-semibold', styles.text)}>{action}</p>}
        </div>
      </div>
    </div>
  )
}

function SectionTitle({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>}
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h2>
        {subtitle && <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

function EmptyState({ title, subtitle, icon = 'package' }: { title: string; subtitle: string; icon?: string }) {
  return (
    <GlassPanel className="p-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-500 ring-1 ring-slate-200">
        <Icon name={icon} className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </GlassPanel>
  )
}

function DataSourceCard({ icon, title, status, detail, tone = 'zinc' }: { icon: string; title: string; status: string; detail: string; tone?: Tone }) {
  const styles = TONE_STYLES[tone]
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', styles.icon)}>
          <Icon name={icon} className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className={cn('mt-1 text-xs font-semibold', styles.text)}>{status}</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
        </div>
      </div>
    </div>
  )
}

function DecisionCard({ sku, rank }: { sku: SKU; rank: number }) {
  const scoreTone = sku.scorePrioridade >= 70 ? 'text-rose-700' : sku.scorePrioridade >= 40 ? 'text-amber-700' : 'text-emerald-700'
  return (
    <div className="border-b border-slate-100 p-4 transition last:border-b-0 hover:bg-slate-50">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-center gap-4 lg:w-[34%]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-sm font-bold text-slate-700">
            #{rank}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-950">{sku.produto}</h3>
            <p className="mt-1 font-mono text-[11px] text-slate-400">{sku.codigo}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:w-[24%]">
          <ClassBadge c={sku.classification} />
          <RecBadge r={sku.recommendation} />
        </div>

        <div className="grid grid-cols-3 gap-4 lg:flex-1">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Receita que pode ser perdida</p>
            <p className="mt-1 text-sm font-bold text-rose-700">{fmtBRLcompact(sku.receitaEmRisco)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Comprar</p>
            <p className="mt-1 text-sm font-bold text-emerald-700">{fmtNum(sku.sugestaoCompra)} un</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Score</p>
            <p className={cn('mt-1 text-sm font-bold', scoreTone)}>{sku.scorePrioridade}</p>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500 lg:ml-14">{sku.motivo}</p>
    </div>
  )
}

function SkuCompactRow({ sku, index, right }: { sku: SKU; index?: number; right?: ReactNode }) {
  return (
    <div className="group flex items-center gap-4 border-b border-slate-100 px-4 py-4 transition hover:bg-slate-50 sm:px-5">
      {typeof index === 'number' && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
          {index + 1}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <ClassBadge c={sku.classification} />
          <span className="font-mono text-[10px] text-slate-400">{sku.codigo}</span>
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-slate-900">{sku.produto}</p>
        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{sku.motivo}</p>
      </div>
      {right}
    </div>
  )
}

function SliderControl({ label, value, min, max, step = 1, suffix, onChange }: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  onChange: (value: number) => void
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-bold text-slate-700">
          {suffix ? `${fmtNum(value)}${suffix}` : fmtNum(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-slate-900"
      />
    </div>
  )
}

function IntegrationCard({
  title, status, description, icon, tone, children,
}: {
  title: string
  status: string
  description: string
  icon: string
  tone: Tone
  children?: ReactNode
}) {
  const styles = TONE_STYLES[tone]
  return (
    <GlassPanel className="p-6">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
            <p className={cn('mt-1 text-xs font-semibold uppercase tracking-[0.14em]', styles.text)}>{status}</p>
          </div>
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-lg', styles.icon)}>
            <Icon name={icon} className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-5 text-sm leading-6 text-slate-500">{description}</p>
        {children && <div className="mt-5">{children}</div>}
      </div>
    </GlassPanel>
  )
}

// ─── MAIN ──────────────────────────────────────────────────────────────────

export default function Page() {
  const [tab, setTab] = useState<Tab>('overview')
  const [params, setParams] = useState<AppParams>(DEFAULT_PARAMS)
  const [data, setData] = useState<SKU[]>([])
  const [hasData, setHasData] = useState(false)
  const [showImport, setShowImport] = useState(true)

  const [stockRaw, setStockRaw] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; type: string; rows: number }[]>([])
  const [error, setError] = useState('')
  const [processSuccess, setProcessSuccess] = useState('')
  const [processLoading, setProcessLoading] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [dataSource, setDataSource] = useState<DataSourceState>({ stockSource: 'Demo interna', demandSource: 'Demo interna', lastProcessed: '' })
  const inputRef = useRef<HTMLInputElement>(null)

  const [sim, setSim] = useState<SimParams>({
    leadTimeDias: 60,
    estoqueSegurancaDias: 15,
    orcamentoCompra: 999999999,
    metaReducaoParado: 30,
  })

  const [wcLoading, setWcLoading] = useState(false)
  const [wcResult, setWcResult] = useState<any>(null)
  const [wcError, setWcError] = useState('')
  const [sancoStatus, setSancoStatus] = useState('CSV SANCO ativo no MVP. A próxima fase é substituir upload manual por API oficial da SANCO/Escalasoft.')

  const [aiOpen, setAiOpen] = useState(false)
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [stockSearch, setStockSearch] = useState('')

  const [securityOrders, setSecurityOrders] = useState<SecurityOrder[]>([])
  const [securityLoading, setSecurityLoading] = useState(false)
  const [securityError, setSecurityError] = useState('')
  const [securityFetched, setSecurityFetched] = useState(false)
  const [securityIsDemo, setSecurityIsDemo] = useState(false)

  useEffect(() => {
    const result = processData(MOCK_STOCK, MOCK_CONSUMO, '', DEFAULT_PARAMS)
    setData(result)
    setHasData(true)
    setShowImport(false)
    setDataSource({
      stockSource: 'Demo interna',
      demandSource: 'Demo interna',
      lastProcessed: new Date().toISOString(),
    })
  }, [])

  const summary = useMemo(() => {
    if (!data.length) return null
    const valorTotal = data.reduce((a, d) => a + d.valorEstoque, 0)
    const capitalParado = data.reduce((a, d) => a + d.capitalParado, 0)
    const receitaEmRisco = data.reduce((a, d) => a + d.receitaEmRisco, 0)
    const sugestaoTotal = data.reduce((a, d) => a + d.valorSugestaoCompra, 0)
    const unidadesVendidas = data.reduce((a, d) => a + d.consumo, 0)
    const compraRecomendadaUn = data.reduce((a, d) => a + d.sugestaoCompra, 0)
    const skusComDemanda = data.filter(d => d.consumo > 0).length
    const caixaLiberavel = capitalParado * 0.6
    const estoqueDisponivelTotal = data.reduce((a, d) => a + d.qtdDisponivel, 0)
    const estoqueUtilTotal = data.reduce((a, d) => a + d.estoqueUtil, 0)
    const estoqueBloqueadoTotal = data.reduce((a, d) => a + d.qtdBloqueada, 0)
    const reservaVirtualTotal = data.reduce((a, d) => a + d.reservaVirtual, 0)
    return {
      totalSkus: data.length,
      criticos: data.filter(d => d.classification === 'critico').length,
      ruptura: data.filter(d => d.classification === 'ruptura').length,
      atencao: data.filter(d => d.classification === 'atencao').length,
      saudavel: data.filter(d => d.classification === 'saudavel').length,
      excesso: data.filter(d => d.classification === 'excesso').length,
      parado: data.filter(d => d.classification === 'parado').length,
      valorTotal,
      capitalParado,
      receitaEmRisco,
      sugestaoTotal,
      unidadesVendidas,
      compraRecomendadaUn,
      skusComDemanda,
      caixaLiberavel,
      estoqueDisponivelTotal,
      estoqueUtilTotal,
      estoqueBloqueadoTotal,
      reservaVirtualTotal,
      pctParado: valorTotal > 0 ? (capitalParado / valorTotal) * 100 : 0,
      oportunidadeFinanceira: caixaLiberavel + receitaEmRisco,
    }
  }, [data])


  const securityClusters = useMemo(() => analyzeSecurityOrders(securityOrders), [securityOrders])

  const securitySummary = useMemo(() => {
    const totalValue = securityOrders.reduce((s, o) => s + Number(o.total || 0), 0)
    const alto = securityClusters.filter(c => c.riskLevel === 'alto').length
    const medio = securityClusters.filter(c => c.riskLevel === 'medio').length
    const baixo = securityClusters.filter(c => c.riskLevel === 'baixo').length
    const uniqueAddresses = new Set(securityOrders.map(o => normalizeText(o.billingAddress)).filter(Boolean)).size
    const uniqueContacts = new Set([
      ...securityOrders.map(o => normalizeEmail(o.billingEmail)).filter(Boolean),
      ...securityOrders.map(o => normalizePhone(o.billingPhone)).filter(v => v.length >= 8),
    ]).size
    return { totalOrders: securityOrders.length, totalValue, alto, medio, baixo, uniqueAddresses, uniqueContacts, clusterCount: securityClusters.length }
  }, [securityOrders, securityClusters])

  const topDecisions = useMemo(() => {
    if (!data.length) return []
    return [...data]
      .sort((a, b) =>
        b.receitaEmRisco - a.receitaEmRisco ||
        b.consumo - a.consumo ||
        a.diasCobertura - b.diasCobertura ||
        b.capitalParado - a.capitalParado ||
        b.scorePrioridade - a.scorePrioridade
      )
      .slice(0, 5)
  }, [data])

  const currentStockData = useMemo(() => {
    const q = stockSearch.trim().toLowerCase()
    return [...data]
      .filter(d => {
        if (!q) return true
        return d.codigo.toLowerCase().includes(q) || d.produto.toLowerCase().includes(q)
      })
      .sort((a, b) =>
        b.estoqueUtil - a.estoqueUtil ||
        b.valorEstoque - a.valorEstoque ||
        a.produto.localeCompare(b.produto)
      )
  }, [data, stockSearch])

  const cashLeakData = useMemo(() => {
    return [...data]
      .filter(d => d.classification === 'parado' || d.classification === 'excesso')
      .sort((a, b) => b.valorEstoque - a.valorEstoque)
  }, [data])

  const revenueRiskData = useMemo(() => {
    return [...data]
      .filter(d => d.classification === 'critico' || d.classification === 'ruptura' || d.classification === 'atencao')
      .sort((a, b) => b.receitaEmRisco - a.receitaEmRisco)
  }, [data])

  const importOrderData = useMemo(() => {
    return [...data]
      .filter(d => d.sugestaoCompra > 0)
      .sort((a, b) =>
        b.receitaEmRisco - a.receitaEmRisco ||
        b.consumo - a.consumo ||
        a.diasCobertura - b.diasCobertura ||
        b.scorePrioridade - a.scorePrioridade
      )
  }, [data])

  const notBuyData = useMemo(() => {
    return [...data]
      .filter(d => ['pausar', 'liquidar', 'descontinuar', 'promover'].includes(d.recommendation))
      .sort((a, b) => b.valorEstoque - a.valorEstoque)
  }, [data])

  const simulation = useMemo(() => {
    const customData = data.map(d => {
      const estoqueNec = d.consumoDiario * (sim.leadTimeDias + sim.estoqueSegurancaDias)
      const sugBase = Math.max(0, estoqueNec - d.estoqueUtil)
      const sug = roundUpToInnerBox(sugBase)
      const demandaAteReposicao = d.consumoDiario * sim.leadTimeDias
      const perdaPorLeadTime = Math.max(0, demandaAteReposicao - d.estoqueUtil)
      const perdaBrutaPeriodo = Math.max(0, d.consumo - d.estoqueUtil)
      const unidadesQuePodePerder = USAR_FATURAMENTO_BRUTO_NO_PITCH && d.consumo > 0 && (d.estoqueUtil <= 0 || d.classification === 'critico' || d.classification === 'ruptura')
        ? Math.max(perdaPorLeadTime, perdaBrutaPeriodo)
        : perdaPorLeadTime
      const receitaEmRisco = unidadesQuePodePerder * d.precoMedioVenda
      return {
        ...d,
        estoqueIdeal: estoqueNec,
        demandaAteReposicao,
        unidadesQuePodePerder,
        receitaEmRisco,
        sugestaoCompra: sug,
        valorSugestaoCompra: sug * d.valorUnitario,
      }
    })

    const sorted = [...customData].sort((a, b) => b.scorePrioridade - a.scorePrioridade)
    let orcamentoUsado = 0
    const compradosDentroOrcamento: SKU[] = []
    const evitados: SKU[] = []

    for (const d of sorted) {
      if (d.valorSugestaoCompra <= 0) continue
      if (orcamentoUsado + d.valorSugestaoCompra <= sim.orcamentoCompra) {
        compradosDentroOrcamento.push(d)
        orcamentoUsado += d.valorSugestaoCompra
      } else {
        evitados.push(d)
      }
    }

    const compraObrigatoria = customData
      .filter(d => d.classification === 'critico' && d.sugestaoCompra > 0)
      .sort((a, b) => b.receitaEmRisco - a.receitaEmRisco)

    const criticosForaOrcamento = evitados
      .filter(d => d.classification === 'critico')
      .sort((a, b) => b.receitaEmRisco - a.receitaEmRisco)

    const naoComprar = customData.filter(d => ['pausar', 'liquidar', 'descontinuar'].includes(d.recommendation))
    const valorEvitarRecompra = naoComprar.reduce((a, d) => a + (d.consumoDiario * sim.leadTimeDias * d.valorUnitario), 0)

    const capitalParado = customData.reduce((a, d) => a + d.capitalParado, 0)
    const reducaoEstimada = capitalParado * (sim.metaReducaoParado / 100)
    const caixaLiberado = reducaoEstimada * 0.6
    const riscoRupturaResidual = evitados.reduce((a, d) => a + d.receitaEmRisco, 0)
    const saldoCaixa = caixaLiberado + valorEvitarRecompra - orcamentoUsado

    return {
      orcamentoUsado,
      compradosDentroOrcamento,
      evitados,
      criticosForaOrcamento,
      compraObrigatoria,
      naoComprar,
      valorEvitarRecompra,
      caixaLiberado,
      riscoRupturaResidual,
      saldoCaixa,
      totalCompras: compradosDentroOrcamento.length,
    }
  }, [data, sim])

  function handleFiles(files: FileList) {
    setError('')
    setProcessSuccess('')

    const file = Array.from(files)[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const type = detectCSVType(text)
      const rows = parseCSV(text).length

      const looksLikeSancoStock =
        type === 'stock' ||
        (text.includes('Codigo') && text.includes('Produto') && text.includes('Quantidade disponível'))

      if (!looksLikeSancoStock) {
        setError(`Arquivo "${file.name}" não parece ser o CSV de estoque atual da SANCO. Exporte a tabela de estoque atual e tente novamente.`)
        return
      }

      setStockRaw(text)
      setUploadedFiles([{ name: file.name, type: 'stock', rows }])
      setDataSource(prev => ({ ...prev, stockSource: `CSV SANCO · ${file.name}` }))
      setProcessSuccess(`Arquivo carregado: ${file.name} · ${fmtNum(rows)} linhas de estoque atual.`)
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleProcess() {
    setError('')
    setProcessSuccess('')
    setProcessLoading(true)

    try {
      if (!stockRaw) {
        throw new Error('Importe o CSV de estoque atual da SANCO. A demanda será puxada automaticamente do WooCommerce.')
      }

      const response = await fetch('/api/woocommerce/orders', {
        method: 'GET',
        cache: 'no-store',
      })

      const wooData = await response.json()

      if (!response.ok || !wooData.ok) {
        throw new Error(wooData?.error || 'Erro ao buscar pedidos do WooCommerce.')
      }

      if (!Array.isArray(wooData.skuSummary) || wooData.skuSummary.length === 0) {
        throw new Error('Nenhuma venda por SKU encontrada no WooCommerce para o período configurado.')
      }

      const wooConsumoCsv = buildConsumoCsvFromWoo(wooData.skuSummary)
      const periodoDias = Number(params.periodoRelatorioDias || 90)
      const paramsComWoo = { ...params, periodoRelatorioDias: periodoDias }

      setParams(paramsComWoo)

      const result = processData(stockRaw, wooConsumoCsv, '', paramsComWoo)

      setData(result)
      setHasData(true)
      setShowImport(false)
      setTab('overview')
      setDataSource({
        stockSource: uploadedFiles[0]?.name ? `CSV SANCO · ${uploadedFiles[0].name}` : 'CSV SANCO',
        demandSource: `WooCommerce · ${wooData.count ?? 0} pedidos válidos`,
        lastProcessed: new Date().toISOString(),
        wooOrders: wooData.count ?? 0,
        wooSkus: wooData.skuCount ?? wooData.skuSummary.length,
        wooItems: wooData.totalItems ?? 0,
        wooRevenue: wooData.totalRevenue ?? 0,
      })
      setProcessSuccess('Dados processados: estoque SANCO + pedidos WooCommerce.')
    } catch (error: any) {
      setError(error?.message || 'Erro ao processar estoque SANCO com pedidos WooCommerce.')
    } finally {
      setProcessLoading(false)
    }
  }

  function handleLoadMock() {
    const result = processData(MOCK_STOCK, MOCK_CONSUMO, '', params)
    setData(result)
    setHasData(true)
    setShowImport(false)
    setTab('overview')
    setError('')
    setProcessSuccess('Demo interna carregada para navegação do MVP.')
    setDataSource({
      stockSource: 'Demo interna',
      demandSource: 'Demo interna',
      lastProcessed: new Date().toISOString(),
    })
  }


  async function fetchSecurityData() {
    setSecurityLoading(true)
    setSecurityError('')

    try {
      const response = await fetch('/api/woocommerce/orders?days=7&includeRiskStatuses=true', { method: 'GET', cache: 'no-store' })
      const contentType = response.headers.get('content-type') || ''
      const result = contentType.includes('application/json') ? await response.json() : { ok: false, raw: await response.text() }

      if (Array.isArray(result?.riskOrders) && result.riskOrders.length > 0) {
        setSecurityOrders(result.riskOrders.map((o: any) => ({
          id: Number(o.id),
          number: String(o.number ?? o.id ?? ''),
          status: String(o.status ?? ''),
          total: Number(o.total || 0),
          dateCreated: String(o.dateCreated ?? o.date_created ?? ''),
          billingName: String(o.billingName ?? ''),
          billingEmail: String(o.billingEmail ?? ''),
          billingPhone: String(o.billingPhone ?? ''),
          billingAddress: String(o.billingAddress ?? ''),
        })))
        setSecurityIsDemo(false)
      } else {
        setSecurityOrders([])
        setSecurityIsDemo(false)
        setSecurityError(result?.error || 'A rota retornou 0 pedidos com status de risco nos últimos 7 dias.')
      }
    } catch (error: any) {
      setSecurityOrders([])
      setSecurityIsDemo(false)
      setSecurityError(error?.message || 'Não foi possível buscar pedidos de risco no WooCommerce.')
    } finally {
      setSecurityLoading(false)
      setSecurityFetched(true)
    }
  }

  useEffect(() => {
    if (tab === 'security' && !securityFetched && !securityLoading) {
      fetchSecurityData()
    }
  }, [tab, securityFetched, securityLoading])

  async function testWooCommerceConnection() {
    setWcLoading(true)
    setWcError('')
    setWcResult(null)

    try {
      const response = await fetch('/api/woocommerce/orders', {
        method: 'GET',
        cache: 'no-store',
      })

      const contentType = response.headers.get('content-type') || ''
      const result = contentType.includes('application/json')
        ? await response.json()
        : { ok: false, raw: await response.text() }

      if (!response.ok || !result.ok) {
        throw new Error(result?.error || result?.message || `Erro HTTP ${response.status} ao consultar WooCommerce`)
      }

      setWcResult(result)
    } catch (err: any) {
      setWcError(err?.message || 'Erro desconhecido ao testar WooCommerce')
    } finally {
      setWcLoading(false)
    }
  }

  async function testSancoConnection() {
    setSancoStatus('CSV SANCO ativo no MVP. A API oficial ainda depende da URL operacional correta da Escalasoft/SANCO.')

    try {
      const response = await fetch('/api/cron/sync-hourly', {
        method: 'GET',
        cache: 'no-store',
      })

      const contentType = response.headers.get('content-type') || ''
      const result = contentType.includes('application/json')
        ? await response.json()
        : { raw: await response.text() }

      if (!response.ok) {
        setSancoStatus('CSV SANCO ativo no MVP. Estrutura de integração criada, mas API SANCO ainda não validada.')
        return
      }

      setSancoStatus(`Estrutura de integração respondendo. Hoje o estoque oficial do MVP vem do CSV SANCO. Retorno técnico: ${JSON.stringify(result).slice(0, 160)}`)
    } catch {
      setSancoStatus('CSV SANCO ativo no MVP. A integração por API está preparada para quando a SANCO confirmar a URL operacional correta.')
    }
  }

  async function askAI(customQuestion?: string) {
    const questionToSend = (customQuestion || aiQuestion).trim()
    if (!questionToSend) return

    setAiLoading(true)
    setAiError('')
    setAiAnswer('')
    if (customQuestion) setAiQuestion(customQuestion)

    try {
      const context = {
        summary,
        fontes: dataSource,
        parametros: params,
        simulacao: {
          leadTimeDias: sim.leadTimeDias,
          estoqueSegurancaDias: sim.estoqueSegurancaDias,
          orcamentoCompra: sim.orcamentoCompra >= 999000000 ? 'ilimitado' : sim.orcamentoCompra,
          metaReducaoParado: sim.metaReducaoParado,
          riscoRupturaResidual: simulation.riscoRupturaResidual,
          caixaLiberado: simulation.caixaLiberado,
        },

        seguranca: {
          fonteDemo: securityIsDemo,
          totalPedidosAnalisados: securitySummary.totalOrders,
          valorTotalTentativas: securitySummary.totalValue,
          clustersAltoRisco: securitySummary.alto,
          clustersMedioRisco: securitySummary.medio,
          totalClusters: securitySummary.clusterCount,
          principaisClusters: securityClusters.slice(0, 8).map(c => ({
            nivel: c.riskLevel,
            score: c.riskScore,
            tipo: c.clusterType,
            motivos: c.reasons,
            pedidos: c.orderNumbers,
            status: c.statuses,
            valorTotal: c.totalValue,
            primeiraTentativa: c.firstAttempt,
            ultimaTentativa: c.lastAttempt,
            acaoSugerida: c.suggestedAction,
          })),
        },
        skus: data.slice(0, 150).map((d) => ({
          codigo: d.codigo,
          produto: d.produto,
          estoqueUtil: d.estoqueUtil,
          qtdDisponivel: d.qtdDisponivel,
          reservaVirtual: d.reservaVirtual,
          consumo: d.consumo,
          consumoDiario: d.consumoDiario,
          demandaAteReposicao: d.demandaAteReposicao,
          unidadesQuePodePerder: d.unidadesQuePodePerder,
          estoqueIdeal: d.estoqueIdeal,
          diasCobertura: d.diasCobertura,
          classification: d.classification,
          recommendation: d.recommendation,
          receitaPeriodo: d.receitaPeriodo,
          precoMedioVenda: d.precoMedioVenda,
          precoVendaFonte: d.precoVendaFonte,
          receitaEmRisco: d.receitaEmRisco,
          capitalParado: d.capitalParado,
          sugestaoCompra: d.sugestaoCompra,
          valorSugestaoCompra: d.valorSugestaoCompra,
          scorePrioridade: d.scorePrioridade,
          motivo: d.motivo,
        })),
      }

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionToSend, context }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Erro ao consultar IA.')
      }

      setAiAnswer(result.answer || 'Sem resposta.')
    } catch (error: any) {
      setAiError(error?.message || 'Erro ao consultar IA.')
    } finally {
      setAiLoading(false)
    }
  }

  const tabs: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: 'overview', label: 'Visão geral', icon: 'chart' },
    { id: 'current-stock', label: 'Estoque atual', icon: 'database', badge: data.length },
    { id: 'cash-leak', label: 'Caixa parado', icon: 'cash', badge: summary ? summary.parado + summary.excesso : 0 },
    { id: 'revenue-risk', label: 'Receita que pode ser perdida', icon: 'alert', badge: summary ? summary.criticos + summary.ruptura : 0 },
    { id: 'import-ai', label: 'Pedido recomendado', icon: 'truck', badge: importOrderData.length },
    { id: 'not-buy', label: 'Não recomprar', icon: 'block', badge: notBuyData.length },
    { id: 'simulation', label: 'Simulação', icon: 'sliders' },
    { id: 'security', label: 'Radar de pedidos', icon: 'shield', badge: securitySummary.clusterCount },
    { id: 'integrations', label: 'Integrações', icon: 'plug' },
  ]

  const heroDecision = topDecisions[0]
  const estoqueSourceLabel = dataSource.stockSource || 'Aguardando CSV SANCO'
  const demandSourceLabel = dataSource.demandSource || 'WooCommerce últimos 90 dias'

  return (
    <div
      className="relative isolate min-h-screen overflow-hidden bg-[#F8FAFC] text-slate-900"
      style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}
    >
      <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-40 bg-white/70" />

      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-md">
        <div className="mx-auto max-w-screen-2xl px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-[72px] flex-wrap items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                <Icon name="bolt" className="relative h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-base font-semibold tracking-tight text-slate-900">STL Business Stock Intelligence</p>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                    MVP Hackathon
                  </span>
                </div>
                <p className="mt-1 hidden text-xs text-slate-500 sm:block">Compra, estoque, vendas e caixa em um command center operacional.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="hidden items-center gap-2 xl:flex">
                <StatusPill label="WooCommerce conectado" tone="emerald" pulse />
                <StatusPill label="SANCO CSV" tone="cyan" />
                <StatusPill label="Somente filamentos" tone="amber" />
                <StatusPill label="IA operacional" tone="violet" />
              </div>
              <button
                onClick={() => setAiOpen(true)}
                className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 sm:flex"
              >
                <Icon name="sparkles" className="h-4 w-4" />
                Copiloto IA
              </button>
              <button
                onClick={() => setShowImport(v => !v)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
              >
                <Icon name="upload" className="h-4 w-4" />
                Importar dados
              </button>
            </div>
          </div>

          {hasData && (
            <nav className="flex gap-2 overflow-x-auto pb-3">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'group inline-flex items-center gap-2 whitespace-nowrap rounded-full border px-4 py-2 text-xs font-bold transition',
                    tab === t.id
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <Icon name={t.icon} className="h-3.5 w-3.5" />
                  {t.label}
                  {!!t.badge && t.badge > 0 && (
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black', tab === t.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600')}>
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      {/* IMPORT PANEL */}
      {showImport && (
        <section className="border-b border-slate-200 bg-white/70 backdrop-blur-md">
          <div className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
            <div className="grid gap-5 lg:grid-cols-[1.35fr_0.85fr]">
              <GlassPanel className="overflow-hidden p-1">
                <div
                  onDrop={e => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files) }}
                  onDragOver={e => { e.preventDefault(); setDragActive(true) }}
                  onDragLeave={() => setDragActive(false)}
                  onClick={() => inputRef.current?.click()}
                  className={cn(
                    'group relative flex min-h-[290px] cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center transition',
                    dragActive ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-emerald-200 hover:bg-emerald-50',
                  )}
                >
                  <div className="absolute inset-x-0 top-0 h-1 bg-slate-200" />
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 shadow-sm transition group-hover:scale-105">
                    <Icon name="upload" className="h-7 w-7" />
                  </div>
                  <div className="relative mt-5 max-w-xl">
                    <p className="text-lg font-semibold text-slate-900">Arraste o CSV de estoque SANCO ou clique para importar</p>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      O estoque atual vem do CSV SANCO. A demanda continua vindo automaticamente do WooCommerce, considerando pedidos válidos do período configurado.
                    </p>
                  </div>
                  <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
                  {uploadedFiles.length > 0 && (
                    <div className="relative mt-6 flex flex-wrap justify-center gap-2">
                      {uploadedFiles.map(f => (
                        <span key={f.name} className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700">
                          <Icon name="file" className="h-3.5 w-3.5" />
                          {f.name} · {fmtNum(f.rows)} linhas
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </GlassPanel>

              <div className="space-y-4">
                <GlassPanel className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Parâmetros operacionais</p>
                      <p className="mt-1 text-sm text-slate-500">Ajuste lead time, período e margem sem alterar o motor de dados.</p>
                    </div>
                    <Icon name="sliders" className="h-5 w-5 text-emerald-700" />
                  </div>

                  <div className="mt-5 grid gap-3">
                    {([
                      ['Lead time China', 'leadTimeDias', 'dias'],
                      ['Período WooCommerce', 'periodoRelatorioDias', 'dias'],
                      ['Estoque de segurança', 'estoqueSegurancaDias', 'dias'],
                    ] as const).map(([label, key, unit]) => (
                      <label key={key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                        <span className="text-xs font-medium text-slate-500">{label}</span>
                        <span className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0}
                            value={params[key]}
                            onChange={e => setParams(p => ({ ...p, [key]: Number(e.target.value) }))}
                            className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-400/60"
                          />
                          <span className="text-[11px] text-slate-500">{unit}</span>
                        </span>
                      </label>
                    ))}
                    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                      <span className="text-xs font-medium text-slate-500">Margem padrão</span>
                      <span className="flex items-center gap-2">
                        <input
                          type="number"
                          min={0}
                          max={95}
                          value={Math.round(params.margemPadrao * 100)}
                          onChange={e => setParams(p => ({ ...p, margemPadrao: Number(e.target.value) / 100 }))}
                          className="w-20 rounded-xl border border-slate-200 bg-white px-3 py-2 text-right text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-400/60"
                        />
                        <span className="text-[11px] text-slate-500">%</span>
                      </span>
                    </label>
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <button
                      onClick={handleProcess}
                      disabled={processLoading}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {processLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Icon name="refresh" className="h-4 w-4" />}
                      {processLoading ? 'Processando...' : 'Processar SANCO + WooCommerce'}
                    </button>
                    <button onClick={handleLoadMock} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50">
                      Carregar demo
                    </button>
                  </div>
                </GlassPanel>

                {processLoading && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 shadow-sm">
                    <p className="font-bold">Cruzando dados agora...</p>
                    <p className="mt-1 text-xs leading-5 text-emerald-700/70">Estoque SANCO + pedidos WooCommerce válidos dos últimos {params.periodoRelatorioDias} dias.</p>
                  </div>
                )}

                {processSuccess && !processLoading && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 shadow-sm">
                    <div className="flex items-start gap-3">
                      <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                      <p>{processSuccess}</p>
                    </div>
                  </div>
                )}

                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 shadow-sm">
                    <div className="flex items-start gap-3">
                      <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-rose-700" />
                      <div>
                        <p className="font-bold">Não foi possível processar</p>
                        <p className="mt-1 text-xs leading-5 text-rose-700/70">{error}</p>
                      </div>
                    </div>
                  </div>
                )}

                {dataSource.lastProcessed && (
                  <GlassPanel className="p-4">
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Fonte atual</p>
                    <div className="mt-3 space-y-2 text-xs text-slate-500">
                      <p><span className="text-slate-500">Estoque:</span> {dataSource.stockSource}</p>
                      <p><span className="text-slate-500">Demanda:</span> {dataSource.demandSource}</p>
                      <p><span className="text-slate-500">Processado:</span> {fmtDateTime(dataSource.lastProcessed)}</p>
                    </div>
                  </GlassPanel>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      <main className="mx-auto max-w-screen-2xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        {/* OVERVIEW */}
        {tab === 'overview' && summary && (
          <div className="space-y-8 lg:space-y-10">
            <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
              <GlassPanel className="relative overflow-hidden p-7 sm:p-8 lg:p-10">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-slate-200" />
                <div className="hidden" />
                <div className="relative max-w-4xl">
                  <div className="flex flex-wrap gap-2">
                    <StatusPill label="Command Center executivo" tone="emerald" pulse />
                    <StatusPill label="Venda real + estoque atual" tone="cyan" />
                    <StatusPill label="Copiloto IA ativo" tone="violet" />
                  </div>
                  <h1 className="mt-7 max-w-4xl text-4xl font-bold tracking-[-0.04em] text-slate-900 sm:text-5xl lg:text-6xl">
                    Command Center de Compra e Estoque
                  </h1>
                  <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
                    Venda real + estoque atual para decidir o que comprar, pausar e priorizar. Em poucos segundos, a diretoria vê risco, capital parado e pedido recomendado.
                  </p>

                  <div className="mt-8 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Volume analisado</p>
                      <p className="mt-2 text-xl font-bold text-slate-900">{fmtNum(dataSource.wooItems || summary.unidadesVendidas)} un</p>
                      <p className="mt-1 text-xs text-slate-500">{fmtNum(dataSource.wooOrders || 3217)} pedidos / {fmtNum(dataSource.wooSkus || summary.skusComDemanda)} SKUs com demanda</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Atualizado</p>
                      <p className="mt-2 text-xl font-bold text-slate-900">{dataSource.lastProcessed ? fmtDate(dataSource.lastProcessed) : 'Hoje'}</p>
                      <p className="mt-1 text-xs text-slate-500">Fonte pronta para decisão de compra</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">SKUs avaliados</p>
                      <p className="mt-2 text-xl font-bold text-slate-900">{fmtNum(summary.totalSkus)}</p>
                      <p className="mt-1 text-xs text-slate-500">Estoque atual + demanda real</p>
                    </div>
                  </div>
                </div>
              </GlassPanel>

              <GlassPanel className="relative overflow-hidden p-6">
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-rose-200" />
                <div className="relative">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">Próxima decisão</p>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-700">AGORA</span>
                  </div>

                  {heroDecision ? (
                    <div className="mt-6">
                      <div className="flex flex-wrap gap-2">
                        <ClassBadge c={heroDecision.classification} />
                        <RecBadge r={heroDecision.recommendation} />
                      </div>
                      <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">{heroDecision.produto}</h2>
                      <p className="mt-1 font-mono text-xs text-slate-500">{heroDecision.codigo}</p>
                      <div className="mt-6 grid grid-cols-2 gap-3">
                        <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-rose-700/70">Receita que pode ser perdida</p>
                          <p className="mt-2 text-2xl font-black text-rose-700">{fmtBRLcompact(heroDecision.receitaEmRisco)}</p>
                        </div>
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-700/70">Sugestão</p>
                          <p className="mt-2 text-2xl font-black text-emerald-700">{fmtNum(heroDecision.sugestaoCompra)} un</p>
                        </div>
                      </div>
                      <p className="mt-5 text-sm leading-6 text-slate-500">{heroDecision.motivo}</p>
                      <button onClick={() => setTab('import-ai')} className="mt-6 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm transition hover:border-slate-300 hover:bg-slate-50">
                        Ver pedido recomendado
                        <Icon name="arrowRight" className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <EmptyState title="Sem decisão pendente" subtitle="Importe dados para gerar a priorização." />
                  )}
                </div>
              </GlassPanel>
            </section>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Receita que pode ser perdida" value={fmtBRLcompact(summary.receitaEmRisco)} sub={`${summary.criticos + summary.ruptura} SKUs críticos ou em ruptura`} icon="alert" tone="rose" emphasis />
              <KpiCard label="Capital parado" value={fmtBRLcompact(summary.capitalParado)} sub={`${fmtPct(summary.pctParado)} do estoque em parado/excesso`} icon="cash" tone="violet" emphasis />
              <KpiCard label="Compra recomendada" value={fmtBRLcompact(summary.sugestaoTotal)} sub={`${fmtNum(summary.compraRecomendadaUn)} unidades sugeridas`} icon="truck" tone="emerald" emphasis />
              <KpiCard label="Caixa liberável" value={fmtBRLcompact(summary.caixaLiberavel)} sub="Estimativa ao promover/liquidar travados" icon="bolt" tone="cyan" emphasis />
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <DataSourceCard icon="store" title="WooCommerce" status={`Últimos ${params.periodoRelatorioDias} dias`} detail={`${demandSourceLabel}. Status válidos: processing e shipped-out.`} tone="emerald" />
              <DataSourceCard icon="file" title="SANCO CSV" status="Estoque atual do dia" detail={`${estoqueSourceLabel}. Fonte oficial do saldo operacional atual.`} tone="cyan" />
              <DataSourceCard icon="brain" title="OpenAI" status="Copiloto operacional" detail="Perguntas sobre ruptura, compra urgente, produtos parados e simulação de orçamento." tone="violet" />
            </section>

            <section className="space-y-5">
              <SectionTitle
                eyebrow="Prioridade executiva"
                title="Decisões de hoje"
                subtitle="Top 5 SKUs em cards executivos. O ranking combina receita que pode ser perdida, receita em risco, capital travado e recomendação operacional."
                right={<button onClick={() => setAiOpen(true)} className="rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:bg-violet-100">Perguntar para IA</button>}
              />
              <GlassPanel className="overflow-hidden">
                <div className="hidden grid-cols-[72px_minmax(0,1.55fr)_180px_160px_150px] border-b border-slate-100 bg-slate-50 px-5 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 lg:grid">
                  <span>Rank</span>
                  <span>Produto</span>
                  <span>Status</span>
                  <span className="text-right">Receita que pode ser perdida</span>
                  <span className="text-right">Comprar</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {topDecisions.map((d, i) => (
                    <div key={d.codigo} className="grid gap-4 px-5 py-5 transition hover:bg-slate-50 lg:grid-cols-[72px_minmax(0,1.55fr)_180px_160px_150px] lg:items-center">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-bold text-slate-700 shadow-sm">#{i + 1}</span>
                        <span className={cn('text-sm font-bold lg:hidden', d.scorePrioridade >= 70 ? 'text-rose-700' : d.scorePrioridade >= 40 ? 'text-amber-700' : 'text-emerald-700')}>Score {d.scorePrioridade}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{d.produto}</p>
                        <p className="mt-1 font-mono text-[11px] text-slate-400">{d.codigo}</p>
                        <p className="mt-2 line-clamp-1 text-xs leading-5 text-slate-500">{d.motivo}</p>
                      </div>
                      <div className="flex flex-wrap gap-2"><ClassBadge c={d.classification} /><RecBadge r={d.recommendation} /></div>
                      <div className="text-left lg:text-right">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 lg:hidden">Receita que pode ser perdida</p>
                        <p className="text-sm font-bold text-rose-700">{fmtBRLcompact(d.receitaEmRisco)}</p>
                      </div>
                      <div className="text-left lg:text-right">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-slate-400 lg:hidden">Comprar</p>
                        <p className="text-sm font-bold text-emerald-700">{fmtNum(d.sugestaoCompra)} un</p>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassPanel>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <button onClick={() => setTab('cash-leak')} className="group rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-violet-100"><Icon name="cash" className="h-5 w-5" /></div>
                <p className="mt-5 text-lg font-semibold text-slate-900">Onde meu dinheiro está parado?</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{fmtBRLcompact(summary.capitalParado)} travado em {summary.parado + summary.excesso} SKUs.</p>
                <p className="mt-4 text-sm font-bold text-violet-700">Ver caixa parado →</p>
              </button>
              <button onClick={() => setTab('revenue-risk')} className="group rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-700 ring-1 ring-rose-100"><Icon name="alert" className="h-5 w-5" /></div>
                <p className="mt-5 text-lg font-semibold text-slate-900">O que pode romper?</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{summary.criticos + summary.ruptura} SKUs em risco e {fmtBRLcompact(summary.receitaEmRisco)} em jogo.</p>
                <p className="mt-4 text-sm font-bold text-rose-700">Ver receita que pode ser perdida →</p>
              </button>
              <button onClick={() => setTab('not-buy')} className="group rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100"><Icon name="block" className="h-5 w-5" /></div>
                <p className="mt-5 text-lg font-semibold text-slate-900">O que não deve comprar?</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">{notBuyData.length} SKUs com recomendação de pausar, promover, liquidar ou descontinuar.</p>
                <p className="mt-4 text-sm font-bold text-amber-700">Ver não recomprar →</p>
              </button>
            </section>

            <GlassPanel className="p-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Pulso do portfólio</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">Distribuição por classificação</p>
                </div>
                <p className="text-sm text-slate-500">{fmtNum(summary.totalSkus)} SKUs avaliados</p>
              </div>
              <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-slate-50">
                {[
                  { count: summary.criticos, color: 'bg-rose-500' },
                  { count: summary.ruptura, color: 'bg-orange-500' },
                  { count: summary.atencao, color: 'bg-amber-500' },
                  { count: summary.saudavel, color: 'bg-emerald-500' },
                  { count: summary.excesso, color: 'bg-sky-500' },
                  { count: summary.parado, color: 'bg-violet-500' },
                ].map((s, i) => s.count > 0 && <div key={i} className={s.color} style={{ width: `${(s.count / summary.totalSkus) * 100}%` }} />)}
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {([
                  ['Crítico', summary.criticos, 'bg-rose-400', 'text-rose-700'],
                  ['Ruptura', summary.ruptura, 'bg-orange-400', 'text-orange-700'],
                  ['Atenção', summary.atencao, 'bg-amber-400', 'text-amber-700'],
                  ['Saudável', summary.saudavel, 'bg-emerald-500', 'text-emerald-700'],
                  ['Excesso', summary.excesso, 'bg-sky-400', 'text-sky-700'],
                  ['Parado', summary.parado, 'bg-violet-500', 'text-violet-700'],
                ] as const).map(([label, count, dot, text]) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500"><span className={cn('h-2 w-2 rounded-full', dot)} />{label}</div>
                    <p className={cn('mt-2 text-2xl font-black', text)}>{count}</p>
                  </div>
                ))}
              </div>
            </GlassPanel>
          </div>
        )}

        {/* ESTOQUE ATUAL */}
        {tab === 'current-stock' && summary && (
          <div className="space-y-6">
            <SectionTitle
              eyebrow="SANCO Stock View"
              title="Estoque atual"
              subtitle="Visão limpa do saldo importado da SANCO. Aqui você confere o que existe hoje, quanto está útil para venda e quanto está bloqueado ou reservado."
              right={
                <button onClick={() => exportCSV(currentStockData.map(d => ({
                  Codigo: d.codigo,
                  Produto: d.produto,
                  QuantidadeDisponivelSANCO: d.qtdDisponivel,
                  QuantidadeBloqueada: d.qtdBloqueada,
                  ReservaVirtual: d.reservaVirtual,
                  EstoqueUtil: d.estoqueUtil,
                  ValorUnitarioSANCO: d.valorUnitario,
                  ValorEstoqueUtil: d.valorEstoque,
                  VendidosPeriodo: d.consumo,
                  CoberturaDias: isFinite(d.diasCobertura) ? Math.round(d.diasCobertura) : '∞',
                  Classificacao: CLASS_LABELS[d.classification],
                  Recomendacao: REC_LABELS[d.recommendation],
                })), 'estoque_atual_sanco.csv')} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                  <Icon name="download" className="h-4 w-4" /> Exportar estoque
                </button>
              }
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="SKUs no estoque" value={fmtNum(summary.totalSkus)} tone="cyan" icon="database" sub={estoqueSourceLabel} />
              <KpiCard label="Estoque disponível" value={`${fmtNum(summary.estoqueDisponivelTotal)} un`} tone="emerald" icon="package" sub="Quantidade disponível informada pela SANCO" />
              <KpiCard label="Estoque útil" value={`${fmtNum(summary.estoqueUtilTotal)} un`} tone="blue" icon="shield" sub="Disponível menos reservas, com regra de mínimo operacional" />
              <KpiCard label="Valor em estoque" value={fmtBRLcompact(summary.valorTotal)} tone="violet" icon="cash" sub="Valor estimado do estoque útil" />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <GlassPanel className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                    <Icon name="package" className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Saldo disponível</p>
                    <p className="mt-1 text-2xl font-black text-emerald-700">{fmtNum(summary.estoqueDisponivelTotal)} un</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">Tudo que veio na coluna “Quantidade disponível” do CSV SANCO.</p>
                  </div>
                </div>
              </GlassPanel>
              <GlassPanel className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                    <Icon name="shield" className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Bloqueado + reserva</p>
                    <p className="mt-1 text-2xl font-black text-amber-700">{fmtNum(summary.estoqueBloqueadoTotal + summary.reservaVirtualTotal)} un</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">Soma de quantidade bloqueada e reserva virtual, para separar saldo bruto de saldo realmente útil.</p>
                  </div>
                </div>
              </GlassPanel>
              <GlassPanel className="p-5">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                    <Icon name="chart" className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Com venda no período</p>
                    <p className="mt-1 text-2xl font-black text-sky-700">{fmtNum(summary.skusComDemanda)} SKUs</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">Produtos que têm demanda real no WooCommerce e aparecem na análise cruzada.</p>
                  </div>
                </div>
              </GlassPanel>
            </div>

            <GlassPanel className="overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-900">Lista de estoque SANCO</p>
                  <p className="mt-1 text-sm text-slate-500">Pesquise por SKU ou produto para conferir saldo, valor, cobertura e recomendação.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="relative">
                    <input
                      value={stockSearch}
                      onChange={(e) => setStockSearch(e.target.value)}
                      placeholder="Buscar SKU ou produto..."
                      className="w-full rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-300 sm:w-72"
                    />
                  </div>
                  {stockSearch && (
                    <button onClick={() => setStockSearch('')} className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 transition hover:bg-slate-50">
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              {currentStockData.length === 0 ? (
                <EmptyState title="Nenhum SKU encontrado" subtitle="Tente buscar por outro código ou produto." icon="database" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-white">
                      <tr>
                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Produto</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Status</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Disponível</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Bloqueado</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Reserva</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Útil</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Valor útil</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Vendidos 90d</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Cobertura</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {currentStockData.map((d) => (
                        <tr key={d.codigo} className="transition hover:bg-slate-50">
                          <td className="max-w-[320px] px-5 py-4">
                            <p className="truncate font-semibold text-slate-900">{d.produto}</p>
                            <p className="font-mono text-[10px] text-slate-500">{d.codigo}</p>
                          </td>
                          <td className="px-5 py-4"><ClassBadge c={d.classification} /></td>
                          <td className="px-5 py-4 text-right font-semibold text-slate-700">{fmtNum(d.qtdDisponivel)}</td>
                          <td className="px-5 py-4 text-right text-slate-500">{fmtNum(d.qtdBloqueada)}</td>
                          <td className="px-5 py-4 text-right text-slate-500">{fmtNum(d.reservaVirtual)}</td>
                          <td className="px-5 py-4 text-right font-black text-sky-700">{fmtNum(d.estoqueUtil)}</td>
                          <td className="px-5 py-4 text-right font-semibold text-violet-700">{fmtBRL(d.valorEstoque)}</td>
                          <td className="px-5 py-4 text-right text-slate-500">{fmtNum(d.consumo)}</td>
                          <td className="px-5 py-4 text-right text-slate-500">{fmtDias(d.diasCobertura)}</td>
                          <td className="px-5 py-4"><RecBadge r={d.recommendation} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassPanel>
          </div>
        )}

        {/* CAIXA PARADO */}
        {tab === 'cash-leak' && summary && (
          <div className="space-y-6">
            <SectionTitle
              eyebrow="Cash Command"
              title="Caixa parado"
              subtitle="Produtos que prendem capital e reduzem a capacidade de compra dos itens que vendem."
              right={
                <button onClick={() => exportCSV(cashLeakData.map(d => ({
                  Codigo: d.codigo,
                  Produto: d.produto,
                  ValorParado: d.valorEstoque,
                  EstoqueUtil: d.estoqueUtil,
                  VendidoPeriodo: d.consumo,
                  DemandaMediaDia: d.consumoDiario,
                  Cobertura: isFinite(d.diasCobertura) ? Math.round(d.diasCobertura) : '∞',
                  Recomendacao: REC_LABELS[d.recommendation],
                  Motivo: d.motivo,
                })), 'caixa_parado.csv')} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
                  <Icon name="download" className="h-4 w-4" /> Exportar CSV
                </button>
              }
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Capital parado" value={fmtBRLcompact(summary.capitalParado)} tone="violet" icon="cash" />
              <KpiCard label="SKUs parados" value={summary.parado} tone="violet" sub="Sem venda no período" icon="block" />
              <KpiCard label="SKUs em excesso" value={summary.excesso} tone="cyan" sub="Cobertura maior que 90 dias" icon="package" />
              <KpiCard label="Caixa liberável" value={fmtBRLcompact(summary.caixaLiberavel)} tone="emerald" sub="Estimativa conservadora de 60%" icon="bolt" />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-violet-700 ring-1 ring-violet-100">
                    <Icon name="cash" className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-violet-700">Como justificamos a cobertura?</p>
                    <p className="mt-1 text-sm leading-6 text-violet-700/75">
                      A cobertura compara <strong>estoque útil atual</strong> com a <strong>venda real dos últimos {params.periodoRelatorioDias} dias</strong>. Se vende pouco e tem muito estoque, o dinheiro fica parado.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Leitura prática</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Exemplo: 700 unidades em estoque e 300 vendidas em {params.periodoRelatorioDias} dias geram uma cobertura aproximada de 210 dias. Essa visão mostra por que pausar compra ou promover o SKU libera caixa.
                </p>
              </div>
            </div>

            <GlassPanel className="overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4">
                <p className="text-sm font-semibold text-slate-900">Maiores travadores de capital</p>
                <p className="mt-1 text-xs text-slate-500">Ordenado por valor de estoque travado. Agora mostra também o vendido no período para justificar a cobertura.</p>
              </div>
              {cashLeakData.length === 0 ? (
                <EmptyState title="Nenhum vazamento de caixa detectado" subtitle="Não há SKUs classificados como parado ou excesso." icon="check" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Produto</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Status</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Capital travado</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Estoque</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Vendido {params.periodoRelatorioDias}d</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Demanda/dia</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Cobertura</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Giro</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {cashLeakData.map(d => (
                        <tr key={d.codigo} className="transition hover:bg-slate-50">
                          <td className="max-w-[300px] px-5 py-4">
                            <p className="truncate font-semibold text-slate-900">{d.produto}</p>
                            <p className="font-mono text-[10px] text-slate-500">{d.codigo}</p>
                          </td>
                          <td className="px-5 py-4"><ClassBadge c={d.classification} /></td>
                          <td className="px-5 py-4 text-right font-black text-violet-700">{fmtBRL(d.valorEstoque)}</td>
                          <td className="px-5 py-4 text-right text-slate-500">{fmtNum(d.estoqueUtil)} un</td>
                          <td className="px-5 py-4 text-right font-semibold text-slate-700">{fmtNum(d.consumo)} un</td>
                          <td className="px-5 py-4 text-right text-slate-500">{d.consumoDiario.toFixed(1)} un/dia</td>
                          <td className="px-5 py-4 text-right text-slate-500">{fmtDias(d.diasCobertura)}</td>
                          <td className="px-5 py-4 text-right text-slate-500">{d.giro === 999 ? '∞' : d.giro.toFixed(2) + 'x'}</td>
                          <td className="px-5 py-4"><RecBadge r={d.recommendation} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassPanel>
          </div>
        )}

        {/* RISCO DE RUPTURA */}
        {tab === 'revenue-risk' && summary && (
          <div className="space-y-6">
            <SectionTitle eyebrow="Revenue Protection" title="Receita que pode ser perdida" subtitle="Produtos com cobertura insuficiente, demanda ativa e potencial de receita perdida." />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Receita que pode ser perdida" value={fmtBRLcompact(summary.receitaEmRisco)} tone="rose" icon="alert" />
              <KpiCard label="SKUs críticos" value={summary.criticos} tone="rose" sub="Ruptura agora ou quase agora" icon="target" />
              <KpiCard label="Ruptura iminente" value={summary.ruptura} tone="amber" sub="Cobertura até 15 dias" icon="clock" />
              <KpiCard label="Em atenção" value={summary.atencao} tone="amber" sub="Cobertura até 30 dias" icon="shield" />
            </div>

            <div className="space-y-3">
              {revenueRiskData.length === 0 ? (
                <EmptyState title="Nenhum produto em receita que pode ser perdida" subtitle="A cobertura atual está saudável para o período analisado." icon="check" />
              ) : revenueRiskData.map((d, i) => (
                <GlassPanel key={d.codigo} className={cn('overflow-hidden', CLASS_TONES[d.classification].border)}>
                  <SkuCompactRow
                    sku={d}
                    index={i}
                    right={
                      <div className="grid shrink-0 grid-cols-2 gap-3 text-right xl:min-w-[640px] xl:grid-cols-4">
                        <div className="rounded-xl border border-sky-100 bg-sky-50 p-3">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-sky-700/70">Demanda até reposição</p>
                          <p className="mt-1 font-black text-sky-700">{fmtNum(d.demandaAteReposicao)} un</p>
                        </div>
                        <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-amber-700/70">Pode perder</p>
                          <p className="mt-1 font-black text-amber-700">{fmtNum(d.unidadesQuePodePerder)} un</p>
                        </div>
                        <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-rose-700/70">Receita perdida</p>
                          <p className="mt-1 font-black text-rose-700">{fmtBRLcompact(d.receitaEmRisco)}</p>
                        </div>
                        <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                          <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-700/70">Comprar</p>
                          <p className="mt-1 font-black text-emerald-700">{fmtNum(d.sugestaoCompra)} un</p>
                        </div>
                      </div>
                    }
                  />
                </GlassPanel>
              ))}
            </div>
          </div>
        )}

        {/* PEDIDO RECOMENDADO */}
        {tab === 'import-ai' && summary && (
          <div className="space-y-6">
            <SectionTitle
              eyebrow="Purchase Intelligence"
              title="Pedido recomendado"
              subtitle="Lista priorizada por receita que pode ser perdida, demanda até reposição, cobertura e consumo real. As quantidades são arredondadas para caixas inner de 12 filamentos."
              right={
                <button onClick={() => exportCSV(importOrderData.map(d => ({
                  Codigo: d.codigo, Produto: d.produto, EstoqueAtual: d.estoqueUtil,
                  ConsumoDiario: d.consumoDiario.toFixed(2),
                  DemandaAteReposicao: Math.round(d.demandaAteReposicao),
                  UnidadesQuePodePerder: Math.round(d.unidadesQuePodePerder),
                  ReceitaQuePodeSerPerdida: d.receitaEmRisco,
                  CoberturaAtual: isFinite(d.diasCobertura) ? Math.round(d.diasCobertura) : '∞',
                  QtdSugerida: d.sugestaoCompra, ValorEstimado: d.valorSugestaoCompra,
                  Prioridade: d.scorePrioridade >= 70 ? 'Alta' : d.scorePrioridade >= 40 ? 'Média' : 'Baixa',
                  Motivo: d.motivo,
                })), 'pedido_recomendado.csv')} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
                  <Icon name="download" className="h-4 w-4" /> Exportar pedido
                </button>
              }
            />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="SKUs no pedido" value={importOrderData.length} tone="emerald" icon="truck" />
              <KpiCard label="Unidades sugeridas" value={fmtNum(summary.compraRecomendadaUn)} tone="emerald" icon="package" />
              <KpiCard label="Investimento estimado" value={fmtBRLcompact(summary.sugestaoTotal)} tone="cyan" sub={`${params.leadTimeDias}d lead time + ${params.estoqueSegurancaDias}d segurança`} icon="cash" />
              <KpiCard label="Lucro bruto potencial" value={fmtBRLcompact(summary.sugestaoTotal / (1 - params.margemPadrao) - summary.sugestaoTotal)} tone="violet" sub={`Margem padrão ${fmtPct(params.margemPadrao * 100)}`} icon="bolt" />
            </div>

            {(['alta', 'media', 'baixa'] as const).map(priority => {
              const items = importOrderData.filter(d => {
                if (priority === 'alta') return d.scorePrioridade >= 70
                if (priority === 'media') return d.scorePrioridade >= 40 && d.scorePrioridade < 70
                return d.scorePrioridade < 40
              })
              if (items.length === 0) return null
              const config = {
                alta: { label: 'Prioridade alta', desc: 'Comprar imediatamente — receita que pode ser perdida ou receita relevante.', tone: 'rose' as Tone, text: 'text-rose-700' },
                media: { label: 'Prioridade média', desc: 'Incluir no próximo pedido para proteger cobertura.', tone: 'amber' as Tone, text: 'text-amber-700' },
                baixa: { label: 'Prioridade baixa', desc: 'Pode aguardar ciclo seguinte se orçamento apertar.', tone: 'emerald' as Tone, text: 'text-emerald-700' },
              }[priority]
              return (
                <GlassPanel key={priority} className={cn('overflow-hidden', TONE_STYLES[config.tone].border)}>
                  <div className={cn('border-b border-slate-200 p-5', TONE_STYLES[config.tone].bg)}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-base font-semibold text-slate-900">{config.label}</p>
                        <p className="mt-1 text-sm text-slate-500">{config.desc}</p>
                      </div>
                      <span className={cn('rounded-full border px-3 py-1.5 text-xs font-black', TONE_STYLES[config.tone].chip)}>
                        {items.length} SKUs · {fmtBRLcompact(items.reduce((a, d) => a + d.valorSugestaoCompra, 0))}
                      </span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">SKU</th>
                          <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Estoque</th>
                          <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Consumo/dia</th>
                          <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Cobertura</th>
                          <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Comprar</th>
                          <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Valor</th>
                          <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Motivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {items.map(d => (
                          <tr key={d.codigo} className="transition hover:bg-slate-50">
                            <td className="max-w-[260px] px-5 py-4">
                              <p className="truncate font-semibold text-slate-900">{d.produto}</p>
                              <p className="font-mono text-[10px] text-slate-500">{d.codigo}</p>
                            </td>
                            <td className="px-5 py-4 text-right text-slate-500">{fmtNum(d.estoqueUtil)}</td>
                            <td className="px-5 py-4 text-right text-slate-500">{d.consumoDiario.toFixed(1)}</td>
                            <td className="px-5 py-4 text-right text-slate-500">{fmtDias(d.diasCobertura)}</td>
                            <td className={cn('px-5 py-4 text-right font-black', config.text)}>{fmtNum(d.sugestaoCompra)} un</td>
                            <td className="px-5 py-4 text-right font-semibold text-slate-700">{fmtBRL(d.valorSugestaoCompra)}</td>
                            <td className="max-w-[320px] px-5 py-4"><p className="line-clamp-1 text-xs text-slate-500">{d.motivo}</p></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </GlassPanel>
              )
            })}
          </div>
        )}

        {/* NÃO RECOMPRAR */}
        {tab === 'not-buy' && summary && (
          <div className="space-y-6">
            <SectionTitle eyebrow="Capital Discipline" title="Não recomprar" subtitle="Produtos onde recomprar aumenta estoque parado, excesso ou capital travado." />

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="SKUs para pausar/cortar" value={notBuyData.length} tone="amber" icon="block" />
              <KpiCard label="Recompra evitável" value={fmtBRLcompact(notBuyData.reduce((a, d) => a + d.consumoDiario * params.leadTimeDias * d.valorUnitario, 0))} tone="amber" icon="shield" />
              <KpiCard label="Capital travado" value={fmtBRLcompact(notBuyData.reduce((a, d) => a + d.valorEstoque, 0))} tone="violet" icon="cash" />
              <KpiCard label="Liquidação estimada" value={fmtBRLcompact(notBuyData.filter(d => d.recommendation === 'liquidar').reduce((a, d) => a + d.valorEstoque * 0.6, 0))} tone="emerald" sub="60% do valor em estoque" icon="bolt" />
            </div>

            <GlassPanel className="overflow-hidden">
              {notBuyData.length === 0 ? (
                <EmptyState title="Nenhum SKU bloqueado para recompra" subtitle="Não há recomendações de pausar, liquidar, promover ou descontinuar." icon="check" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Produto</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Status</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Estoque</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Capital travado</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Cobertura</th>
                        <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Giro</th>
                        <th className="px-5 py-3 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {notBuyData.map(d => (
                        <tr key={d.codigo} className="transition hover:bg-slate-50">
                          <td className="max-w-[300px] px-5 py-4">
                            <p className="truncate font-semibold text-slate-900">{d.produto}</p>
                            <p className="font-mono text-[10px] text-slate-500">{d.codigo}</p>
                          </td>
                          <td className="px-5 py-4"><ClassBadge c={d.classification} /></td>
                          <td className="px-5 py-4 text-right text-slate-500">{fmtNum(d.estoqueUtil)} un</td>
                          <td className="px-5 py-4 text-right font-black text-violet-700">{fmtBRL(d.valorEstoque)}</td>
                          <td className="px-5 py-4 text-right text-slate-500">{fmtDias(d.diasCobertura)}</td>
                          <td className="px-5 py-4 text-right text-slate-500">{d.giro === 999 ? '∞' : d.giro.toFixed(2) + 'x'}</td>
                          <td className="px-5 py-4"><RecBadge r={d.recommendation} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </GlassPanel>
          </div>
        )}

        {/* SIMULAÇÃO */}
        {tab === 'simulation' && summary && (
          <div className="space-y-6">
            <SectionTitle eyebrow="Scenario Lab" title="Simulação" subtitle="Ajuste orçamento, lead time e redução de capital parado antes de fechar o pedido." />

            <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
              <GlassPanel className="p-6">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">Variáveis da simulação</p>
                    <p className="mt-1 text-sm text-slate-500">Veja o impacto financeiro em tempo real.</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                    <Icon name="sliders" className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-7 space-y-7">
                  <SliderControl label="Lead time" value={sim.leadTimeDias} min={15} max={120} suffix="d" onChange={value => setSim(s => ({ ...s, leadTimeDias: value }))} />
                  <SliderControl label="Estoque de segurança" value={sim.estoqueSegurancaDias} min={0} max={45} suffix="d" onChange={value => setSim(s => ({ ...s, estoqueSegurancaDias: value }))} />
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="text-sm font-medium text-slate-600">Orçamento de compra</label>
                      <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        {sim.orcamentoCompra >= 999000000 ? 'Ilimitado' : fmtBRLcompact(sim.orcamentoCompra)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={10000}
                      max={10000000}
                      step={50000}
                      value={Math.min(sim.orcamentoCompra, 10000000)}
                      onChange={e => setSim(s => ({ ...s, orcamentoCompra: Number(e.target.value) }))}
                      className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-100 accent-emerald-400"
                    />
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button onClick={() => setSim(s => ({ ...s, orcamentoCompra: 999999999 }))} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100">
                        Orçamento ilimitado
                      </button>
                      <button onClick={() => setSim(s => ({ ...s, orcamentoCompra: 500000 }))} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50">
                        R$ 500k
                      </button>
                    </div>
                  </div>
                  <SliderControl label="Meta de redução de parado" value={sim.metaReducaoParado} min={0} max={100} step={5} suffix="%" onChange={value => setSim(s => ({ ...s, metaReducaoParado: value }))} />
                </div>
              </GlassPanel>

              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <KpiCard label="Compra aprovada" value={simulation.totalCompras} sub={`${fmtBRLcompact(simulation.orcamentoUsado)} usado`} tone="emerald" icon="truck" />
                  <KpiCard label="Compra obrigatória" value={simulation.compraObrigatoria.length} sub={`${fmtBRLcompact(simulation.compraObrigatoria.reduce((a, d) => a + d.valorSugestaoCompra, 0))} em críticos`} tone="rose" icon="alert" />
                  <KpiCard label="Recompra evitada" value={fmtBRLcompact(simulation.valorEvitarRecompra)} sub={`${simulation.naoComprar.length} SKUs descartados`} tone="amber" icon="block" />
                  <KpiCard label="Risco residual" value={fmtBRLcompact(simulation.riscoRupturaResidual)} sub={`${simulation.evitados.length} SKUs fora do orçamento`} tone="rose" icon="shield" />
                </div>

                <GlassPanel className="overflow-hidden border-emerald-200 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-emerald-700">Impacto líquido projetado</p>
                      <p className="mt-2 text-sm text-slate-500">Compra recomendada versus caixa liberável e recompra evitada.</p>
                    </div>
                    <p className={cn('text-3xl font-black tracking-tight', simulation.saldoCaixa >= 0 ? 'text-emerald-700' : 'text-rose-700')}>
                      {simulation.saldoCaixa >= 0 ? '+' : '-'} {fmtBRLcompact(Math.abs(simulation.saldoCaixa))}
                    </p>
                  </div>
                  <div className="mt-6 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
                      <p className="text-xs text-slate-500">Saída de caixa</p>
                      <p className="mt-1 text-lg font-black text-rose-700">- {fmtBRLcompact(simulation.orcamentoUsado)}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                      <p className="text-xs text-slate-500">Liberação + recompra evitada</p>
                      <p className="mt-1 text-lg font-black text-emerald-700">+ {fmtBRLcompact(simulation.caixaLiberado + simulation.valorEvitarRecompra)}</p>
                    </div>
                    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
                      <p className="text-xs text-slate-500">Orçamento</p>
                      <p className="mt-1 text-lg font-black text-sky-700">{sim.orcamentoCompra >= 999000000 ? 'Ilimitado' : fmtBRLcompact(sim.orcamentoCompra)}</p>
                    </div>
                  </div>
                </GlassPanel>
              </div>
            </div>

            {simulation.compraObrigatoria.length > 0 && (
              <GlassPanel className="overflow-hidden border-rose-200">
                <div className="border-b border-rose-100 bg-rose-50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-rose-700">Compra obrigatória</p>
                      <p className="mt-1 text-sm text-rose-700/65">SKUs zerados ou abaixo do mínimo com demanda ativa. Não devem sumir da decisão.</p>
                    </div>
                    <span className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700">
                      {simulation.compraObrigatoria.length} SKUs · {fmtBRLcompact(simulation.compraObrigatoria.reduce((a, d) => a + d.valorSugestaoCompra, 0))}
                    </span>
                  </div>
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {simulation.compraObrigatoria.slice(0, 30).map((d, i) => (
                    <SkuCompactRow
                      key={d.codigo}
                      sku={d}
                      index={i}
                      right={
                        <div className="grid shrink-0 grid-cols-2 gap-3 text-right sm:min-w-[280px]">
                          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-emerald-700/70">Comprar</p>
                            <p className="mt-1 font-black text-emerald-700">{fmtNum(d.sugestaoCompra)} un</p>
                          </div>
                          <div className="hidden rounded-xl border border-rose-100 bg-rose-50 p-3 sm:block">
                            <p className="text-[10px] uppercase tracking-[0.16em] text-rose-700/70">Risco</p>
                            <p className="mt-1 font-black text-rose-700">{fmtBRLcompact(d.receitaEmRisco)}</p>
                          </div>
                        </div>
                      }
                    />
                  ))}
                </div>
              </GlassPanel>
            )}

            <GlassPanel className="overflow-hidden">
              <div className="border-b border-slate-200 p-5">
                <p className="text-base font-semibold text-slate-900">Recomendado comprar dentro do orçamento</p>
                <p className="mt-1 text-sm text-slate-500">Priorização por score de urgência e risco financeiro.</p>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                {simulation.compradosDentroOrcamento.length === 0 ? (
                  <EmptyState title="Nenhum SKU dentro do orçamento" subtitle="Aumente o orçamento ou use orçamento ilimitado para visualizar o pedido completo." icon="sliders" />
                ) : simulation.compradosDentroOrcamento.slice(0, 45).map((d, i) => (
                  <SkuCompactRow
                    key={d.codigo}
                    sku={d}
                    index={i}
                    right={
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-black text-emerald-700">{fmtNum(d.sugestaoCompra)} un</p>
                        <p className="text-xs text-slate-500">{fmtBRL(d.valorSugestaoCompra)}</p>
                      </div>
                    }
                  />
                ))}
              </div>
            </GlassPanel>

            {simulation.evitados.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-semibold text-amber-700">
                      {simulation.evitados.length} SKUs ficaram fora do orçamento
                      {simulation.criticosForaOrcamento.length > 0 ? ` · ${simulation.criticosForaOrcamento.length} críticos` : ''}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-amber-700/70">
                      Receita que pode ser perdida residual: {fmtBRLcompact(simulation.riscoRupturaResidual)}. Para cobrir todos os SKUs prioritários, considere adicionar {fmtBRLcompact(simulation.evitados.reduce((a, d) => a + d.valorSugestaoCompra, 0))}.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}


        {/* RADAR DE PEDIDOS */}
        {tab === 'security' && (
          <div className="space-y-6">
            <SectionTitle
              eyebrow="Segurança WooCommerce"
              title="Radar de pedidos suspeitos"
              subtitle="Analisa tentativas malsucedidas dos últimos 7 dias e agrupa padrões por e-mail, telefone, endereço e nome. A análise não acusa clientes, apenas prioriza revisão manual."
              right={
                <button
                  onClick={fetchSecurityData}
                  disabled={securityLoading}
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {securityLoading ? 'Buscando...' : 'Buscar últimos 7 dias'}
                </button>
              }
            />

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <KpiCard label="Pedidos analisados" value={fmtNum(securitySummary.totalOrders)} sub={securityFetched ? 'Dados reais do WooCommerce' : 'Aguardando consulta ao WooCommerce'} icon="shield" tone="cyan" />
              <KpiCard label="Clusters alto risco" value={fmtNum(securitySummary.alto)} sub="Revisão manual prioritária" icon="alert" tone="rose" />
              <KpiCard label="Valor em tentativas" value={fmtBRLcompact(securitySummary.totalValue)} sub="Soma dos pedidos com status de risco" icon="cash" tone="amber" />
              <KpiCard label="Padrões encontrados" value={fmtNum(securitySummary.clusterCount)} sub={`${fmtNum(securitySummary.uniqueContacts)} contatos · ${fmtNum(securitySummary.uniqueAddresses)} endereços`} icon="target" tone="violet" />
            </div>

            {securityError && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-700">
                <p className="font-semibold">Modo demonstração ativo</p>
                <p className="mt-1">{securityError}</p>
              </div>
            )}

            <GlassPanel className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-5">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Padrões para revisão manual</h3>
                  <p className="mt-1 text-sm text-slate-500">Ranking por score de risco, valor das tentativas e recorrência.</p>
                </div>
                <StatusPill label={securityFetched ? 'Consulta executada' : 'Aguardando consulta'} tone={securityFetched ? 'emerald' : 'amber'} />
              </div>

              {securityClusters.length === 0 ? (
                <div className="p-5"><EmptyState title="Nenhum padrão suspeito" subtitle="Não encontramos concentração de falhas nos dados atuais." icon="shield" /></div>
              ) : (
                securityClusters.map(cluster => (
                  <div key={cluster.id} className="border-b border-slate-100 p-5 last:border-b-0 transition hover:bg-slate-50/70">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <RiskBadge level={cluster.riskLevel} />
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-600">Score {cluster.riskScore}</span>
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">{cluster.clusterType}</span>
                        </div>

                        <p className="mt-3 text-sm font-semibold text-slate-900">
                          {fmtNum(cluster.orderCount)} pedidos · {fmtBRLcompact(cluster.totalValue)} em tentativas
                        </p>

                        <div className="mt-3 grid gap-2 text-sm text-slate-600">
                          {cluster.reasons.map(reason => <p key={reason}>• {reason}</p>)}
                        </div>
                      </div>

                      <div className="w-full rounded-xl border border-slate-200 bg-white p-4 lg:w-[320px]">
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Ação sugerida</p>
                        <p className="mt-2 text-sm font-semibold text-slate-900">{cluster.suggestedAction}</p>
                        <p className="mt-3 text-xs leading-5 text-slate-500">
                          Primeira tentativa: {cluster.firstAttempt ? fmtDateShort(cluster.firstAttempt) : 'n/a'}<br />
                          Última tentativa: {cluster.lastAttempt ? fmtDateShort(cluster.lastAttempt) : 'n/a'}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-4">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Nomes</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{cluster.displayNames.join(', ') || 'n/a'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">E-mails</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{cluster.displayEmails.join(', ') || 'n/a'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Telefones</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{cluster.displayPhones.join(', ') || 'n/a'}</p>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Pedidos</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">#{cluster.orderNumbers.join(', #')}</p>
                      </div>
                    </div>

                    {cluster.displayAddresses.length > 0 && (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Endereço relacionado</p>
                        <p className="mt-1 line-clamp-2 text-xs text-slate-600">{cluster.displayAddresses.slice(0, 2).join(' · ')}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </GlassPanel>
          </div>
        )}

        {/* INTEGRAÇÕES */}
        {tab === 'integrations' && (
          <div className="space-y-6">
            <SectionTitle
              eyebrow="Data Integration Hub"
              title="Integrações operacionais"
              subtitle="WooCommerce alimenta demanda, SANCO CSV alimenta estoque do dia, OpenAI transforma contexto em decisão e a próxima fase prepara API SANCO."
              right={<StatusPill label="MVP preparado para API" tone="emerald" pulse />}
            />

            <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
              <IntegrationCard title="WooCommerce" status="Demanda real" icon="store" tone="emerald" description="Pedidos reais, SKUs vendidos, receita, velocidade de venda e status válidos dos últimos 90 dias.">
                <div className="space-y-3">
                  <button onClick={testWooCommerceConnection} disabled={wcLoading} className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                    {wcLoading ? 'Testando conexão...' : 'Testar WooCommerce'}
                  </button>
                  {wcResult && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700/80">
                      <p className="font-bold text-emerald-700">Conectado com sucesso</p>
                      <p className="mt-1">Pedidos encontrados: {wcResult.count ?? wcResult.orders?.length ?? 0}</p>
                      {Array.isArray(wcResult.orders) && wcResult.orders.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {wcResult.orders.slice(0, 3).map((order: any) => (
                            <div key={order.id} className="rounded-xl border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-600">Pedido #{order.id} · {order.status} · R$ {order.total}</div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {wcError && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs leading-5 text-rose-700/80">
                      <p className="font-bold text-rose-700">Erro na conexão</p>
                      <p className="mt-1">{wcError}</p>
                      <p className="mt-1 text-rose-700/60">Verifique WC_STORE_URL, WC_CONSUMER_KEY e WC_CONSUMER_SECRET.</p>
                    </div>
                  )}
                </div>
              </IntegrationCard>

              <IntegrationCard title="SANCO CSV" status="Estoque oficial do dia" icon="file" tone="cyan" description="Upload manual do CSV exportado da SANCO. É a fonte oficial do saldo atual no MVP.">
                <button onClick={() => setShowImport(true)} className="w-full rounded-xl border border-sky-400/25 bg-sky-500/10 px-4 py-3 text-sm font-black text-sky-700 transition hover:bg-sky-500/20">
                  Importar CSV SANCO
                </button>
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-500">Não depende de CSV antigo de consumo ou cobertura. Consumo vem do WooCommerce.</p>
              </IntegrationCard>

              <IntegrationCard title="OpenAI" status="Copiloto operacional" icon="brain" tone="violet" description="Recebe resumo, parâmetros, simulação e SKUs para responder perguntas de compra, ruptura e caixa.">
                <button onClick={() => setAiOpen(true)} className="w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-black text-violet-700 transition hover:bg-violet-100">
                  Abrir Copiloto IA
                </button>
                <div className="mt-3 grid gap-2 text-xs text-slate-500">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">Perguntas sobre SKUs críticos</div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">Sugestão de importação</div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">Produtos parados e capital liberável</div>
                </div>
              </IntegrationCard>

              <IntegrationCard title="Próxima fase API SANCO" status="Preparada" icon="plug" tone="amber" description="Estrutura pronta para trocar upload por sincronização automática quando endpoint e credenciais forem validados.">
                <button onClick={testSancoConnection} className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-700 transition hover:bg-amber-100">
                  Testar estrutura SANCO
                </button>
                <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-700/70">{sancoStatus}</p>
              </IntegrationCard>
            </div>

            <GlassPanel className="p-6">
              <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Arquitetura de dados</p>
              <div className="mt-5 grid gap-3 md:grid-cols-4">
                {[
                  ['WooCommerce', 'Motor de demanda', 'store', 'emerald' as Tone],
                  ['SANCO CSV', 'Motor de estoque', 'file', 'cyan' as Tone],
                  ['OpenAI', 'Motor de decisão conversacional', 'brain', 'violet' as Tone],
                  ['STL Intelligence', 'Compra, caixa e ruptura', 'bolt', 'emerald' as Tone],
                ].map(([title, desc, icon, tone]) => (
                  <div key={title as string} className={cn('rounded-xl border bg-slate-50 p-5', TONE_STYLES[tone as Tone].border)}>
                    <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', TONE_STYLES[tone as Tone].icon)}><Icon name={icon as string} className="h-4 w-4" /></div>
                    <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
                    <p className="mt-1 text-xs text-slate-500">{desc}</p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-sm font-semibold text-slate-900">Mensagem operacional</p>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Hoje o MVP é funcional com CSV SANCO + WooCommerce + OpenAI. A evolução natural é automatizar a SANCO por API, manter histórico em banco e transformar o dashboard em rotina diária de compra, caixa e ruptura.
                </p>
              </div>
            </GlassPanel>
          </div>
        )}
      </main>

      {/* AI COPILOT */}
      <div className="fixed bottom-5 right-5 z-50 flex max-w-[calc(100vw-40px)] flex-col items-end">
        {aiOpen && (
          <GlassPanel className="mb-3 flex max-h-[calc(100vh-120px)] w-[440px] max-w-full flex-col overflow-hidden border-violet-200">
            <div className="border-b border-slate-200 bg-violet-50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700 ring-1 ring-violet-100"><Icon name="sparkles" className="h-4 w-4" /></div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Copiloto IA</p>
                      <p className="text-xs text-slate-500">Compra, ruptura, estoque e caixa.</p>
                    </div>
                  </div>
                </div>
                <button onClick={() => setAiOpen(false)} className="rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:text-slate-900"><Icon name="x" className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  'Quais filamentos têm menos de 5 unidades?',
                  'O que devo importar primeiro?',
                  'Quais produtos estão parados?',
                  'Quanto de receita está em risco?',
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => askAI(q)}
                    disabled={aiLoading}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-500 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 disabled:opacity-60"
                  >
                    {q}
                  </button>
                ))}
              </div>

              <textarea
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
                placeholder="Ex: com R$ 500 mil, o que compro primeiro e o que devo pausar?"
                className="min-h-[112px] w-full resize-none rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-violet-200 focus:bg-white"
              />

              <button
                onClick={() => askAI()}
                disabled={aiLoading || !aiQuestion.trim()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {aiLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : <Icon name="sparkles" className="h-4 w-4" />}
                {aiLoading ? 'Analisando dados...' : 'Perguntar ao Copiloto'}
              </button>

              {aiError && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-700">
                  {aiError}
                </div>
              )}

              {aiAnswer && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex items-center gap-3 border-b border-slate-200 pb-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-xs font-black text-violet-700 ring-1 ring-violet-100">AI</div>
                    <div>
                      <p className="text-sm font-semibold text-violet-700">Análise do Copiloto</p>
                      <p className="text-xs text-slate-500">Baseada no contexto atual do dashboard</p>
                    </div>
                  </div>
                  <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                    {aiAnswer}
                  </div>
                </div>
              )}
            </div>
          </GlassPanel>
        )}

        <button
          onClick={() => setAiOpen(v => !v)}
          className="group inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-800"
        >
          <Icon name={aiOpen ? 'x' : 'sparkles'} className="h-4 w-4" />
          {aiOpen ? 'Fechar IA' : 'Perguntar à IA'}
        </button>
      </div>

      <footer className="mt-16 border-t border-slate-200 bg-white py-6">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center justify-between gap-3 px-4 text-xs text-slate-500 sm:px-6 lg:px-8">
          <span>STL Business Stock Intelligence · MVP Hackathon</span>
          <span>Venda real + estoque atual + IA operacional</span>
        </div>
      </footer>
    </div>
  )
}
