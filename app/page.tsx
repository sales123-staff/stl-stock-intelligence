'use client'

import { useState, useMemo, useRef, useEffect } from 'react'

/* ═══════════════════════════════════════════════════════════════════════════
   STL BUSINESS STOCK INTELLIGENCE
   Copiloto de decisão para compras, estoque e caixa
   ═══════════════════════════════════════════════════════════════════════════ */

// ─── TYPES ─────────────────────────────────────────────────────────────────

type Classification = 'critico' | 'ruptura' | 'atencao' | 'saudavel' | 'excesso' | 'parado'
type Tab = 'overview' | 'cash-leak' | 'revenue-risk' | 'import-ai' | 'not-buy' | 'simulation' | 'integrations'
type Recommendation = 'comprar-urgente' | 'comprar' | 'manter' | 'pausar' | 'promover' | 'liquidar' | 'descontinuar'

interface SKU {
  codigo: string
  produto: string
  qtdDisponivel: number
  qtdBloqueada: number
  reservaVirtual: number
  estoqueUtil: number
  valorUnitario: number
  precoVenda: number
  margem: number
  valorEstoque: number
  consumo: number
  consumoDiario: number
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

const DEFAULT_PARAMS: AppParams = {
  leadTimeDias: 60,
  periodoRelatorioDias: 90,
  estoqueSegurancaDias: 15,
  margemPadrao: 0.45,
}

// ─── CONSTANTS ─────────────────────────────────────────────────────────────

const CLASS_LABELS: Record<Classification, string> = {
  critico: 'Crítico',
  ruptura: 'Ruptura iminente',
  atencao: 'Atenção',
  saudavel: 'Saudável',
  excesso: 'Excesso',
  parado: 'Parado',
}

const CLASS_ORDER: Record<Classification, number> = {
  critico: 0, ruptura: 1, parado: 2, excesso: 3, atencao: 4, saudavel: 5,
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

// ─── FORMATTING ────────────────────────────────────────────────────────────

const fmtNum = (n: number) => new Intl.NumberFormat('pt-BR').format(Math.round(n))
const fmtBRL = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
const fmtBRLcompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `R$ ${(n / 1_000).toFixed(1)}k`
  return fmtBRL(n)
}
const fmtDias = (n: number) => (!isFinite(n) ? '∞' : `${Math.round(n)}d`)
const fmtPct = (n: number) => `${n.toFixed(1)}%`
const fmtDateTime = (d: string | Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(d))

// ─── CSV PARSING ───────────────────────────────────────────────────────────

function parseBRL(s: string | undefined | null): number {
  if (!s) return 0
  return parseFloat(String(s).trim().replace('R$', '').replace(/\./g, '').replace(',', '.')) || 0
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

function buildMotivo(c: Classification, dias: number, valorEstoque: number, receitaEmRisco: number): string {
  switch (c) {
    case 'critico':
      if (!isFinite(dias) || dias <= 0) return 'Estoque zerado com demanda ativa — receita perdida agora'
      return `Apenas ${Math.round(dias)} dias até ruptura. Risco de ${fmtBRLcompact(receitaEmRisco)} em receita perdida`
    case 'ruptura':
      return `Cobertura crítica de ${Math.round(dias)} dias. Comprar antes da próxima venda perdida`
    case 'atencao':
      return `${Math.round(dias)} dias de cobertura — abaixo do lead time + segurança`
    case 'parado':
      return `Sem giro · ${fmtBRLcompact(valorEstoque)} de capital travado`
    case 'excesso':
      return `Cobertura excessiva de ${Math.round(dias)} dias — capital subutilizado`
    case 'saudavel':
    default:
      return 'Operando dentro da margem saudável'
  }
}

function processData(stockRaw: string, consumoRaw: string, mesesRaw: string, params: AppParams): SKU[] {
  const stockRows = parseCSV(stockRaw)
  const consumoRows = parseCSV(consumoRaw)

  const stockMap = new Map<string, { produto: string; qtdDisp: number; qtdBloq: number; reserva: number; valor: number }>()
  stockRows.forEach(r => {
    const cod = r['Codigo']
    if (!cod || cod === 'Total') return
    const e = stockMap.get(cod)
    const qtdDisp = parseBRL(r['Quantidade disponível'])
    const qtdBloq = parseBRL(r['Quantidade bloqueada'])
    const reserva = parseBRL(r['Reserva virtual'])
    const valor = parseBRL(r['Valor mercadorias'])
    if (!e) stockMap.set(cod, { produto: r['Produto'] || cod, qtdDisp, qtdBloq, reserva, valor })
    else { e.qtdDisp += qtdDisp; e.qtdBloq += qtdBloq; e.reserva += reserva; e.valor += valor }
  })

  const consumoMap = new Map<string, { produto: string; quantidade: number }>()
  consumoRows.forEach(r => {
    const cod = r['Codigo']
    if (!cod) return
    const e = consumoMap.get(cod)
    const qtd = parseBRL(r['Quantidade'])
    if (!e) consumoMap.set(cod, { produto: r['Produto'] || cod, quantidade: qtd })
    else e.quantidade += qtd
  })

  const allCodes = new Set([...stockMap.keys(), ...consumoMap.keys()])
  const skus: SKU[] = []

  allCodes.forEach(codigo => {
    const stock = stockMap.get(codigo)
    const consumoData = consumoMap.get(codigo)
    const produto = stock?.produto || consumoData?.produto || codigo
    const qtdDisponivel = stock?.qtdDisp ?? 0
    const qtdBloqueada = stock?.qtdBloq ?? 0
    const reservaVirtual = stock?.reserva ?? 0
    const valorMercadorias = stock?.valor ?? 0
    const consumo = consumoData?.quantidade || 0
    const semEstoqueEncontrado = !stock

    // ★ Regra de negócio: estoque < 5 trata como zero (devoluções pontuais)
    let estoqueUtilCalc = Math.max(0, qtdDisponivel - reservaVirtual)
    if (estoqueUtilCalc < 5) estoqueUtilCalc = 0
    const estoqueUtil = estoqueUtilCalc

    const valorUnitario = qtdDisponivel > 0 && valorMercadorias > 0 ? valorMercadorias / qtdDisponivel : 0
    const margem = params.margemPadrao
    const precoVenda = valorUnitario > 0 ? valorUnitario / (1 - margem) : 0
    const valorEstoque = estoqueUtil * valorUnitario

    const consumoDiario = params.periodoRelatorioDias > 0 ? consumo / params.periodoRelatorioDias : 0
    const diasCobertura = consumoDiario > 0 ? estoqueUtil / consumoDiario : (consumo === 0 ? Infinity : 0)
    const giro = estoqueUtil > 0 ? consumo / estoqueUtil : (consumo > 0 ? 999 : 0)

    const classification = classify(estoqueUtil, diasCobertura, consumo, semEstoqueEncontrado)

    // Sugestão de compra
    const estoqueNecessario = consumoDiario * (params.leadTimeDias + params.estoqueSegurancaDias)
    const sugestaoCompra = Math.max(0, Math.ceil(estoqueNecessario - estoqueUtil))
    const valorSugestaoCompra = sugestaoCompra * valorUnitario

    // Receita em risco se romper
    const diasSemEstoqueProjetado = classification === 'critico' ? params.leadTimeDias :
      classification === 'ruptura' ? Math.max(0, params.leadTimeDias - diasCobertura) :
      classification === 'atencao' ? Math.max(0, params.leadTimeDias - diasCobertura) : 0
    const receitaEmRisco = consumoDiario * diasSemEstoqueProjetado * precoVenda

    // Capital parado
    const capitalParado = (classification === 'parado' || classification === 'excesso') ? valorEstoque : 0

    const recommendation = recommend(classification, { giro, valorEstoque, consumo })

    // Score de prioridade (0-100, maior = mais urgente)
    let scorePrioridade = 0
    if (classification === 'critico') scorePrioridade = 90 + Math.min(10, receitaEmRisco / 1000)
    else if (classification === 'ruptura') scorePrioridade = 70 + Math.min(20, receitaEmRisco / 1000)
    else if (classification === 'atencao') scorePrioridade = 40 + Math.min(20, receitaEmRisco / 2000)
    else if (classification === 'parado') scorePrioridade = 20 + Math.min(20, valorEstoque / 5000)
    else if (classification === 'excesso') scorePrioridade = 10 + Math.min(15, valorEstoque / 10000)
    else scorePrioridade = 5
    scorePrioridade = Math.min(100, Math.round(scorePrioridade))

    const motivo = buildMotivo(classification, diasCobertura, valorEstoque, receitaEmRisco)

    skus.push({
      codigo, produto, qtdDisponivel, qtdBloqueada, reservaVirtual, estoqueUtil,
      valorUnitario, precoVenda, margem, valorEstoque, consumo, consumoDiario,
      diasCobertura, giro, classification, recommendation, sugestaoCompra,
      valorSugestaoCompra, receitaEmRisco, capitalParado, scorePrioridade,
      motivo, semEstoqueEncontrado,
    })
  })

  return skus
}

// ─── CSV EXPORT ────────────────────────────────────────────────────────────

function exportCSV(rows: any[], filename: string) {
  if (!rows.length) return
  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => {
      const v = r[h]
      if (typeof v === 'number') return Math.round(v * 100) / 100
      return v
    }).join(';'))
  ].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
}

function escapeCsvValue(value: any) {
  return String(value ?? '')
    .replace(/;/g, ',')
    .replace(/[\r\n]+/g, ' ')
    .trim()
}


function buildConsumoCsvFromWoo(skuSummary: any[]) {
  const rows = skuSummary
    .filter((item) => item.sku && Number(item.quantity || 0) > 0)
    .map((item) => {
      const sku = escapeCsvValue(item.sku)
      const name = escapeCsvValue(item.name || item.sku)
      const quantity = Number(item.quantity || 0)
      return `${sku};${name};${quantity}`
    })

  return ['Codigo;Produto;Quantidade', ...rows].join('\n')
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

// ─── ICONS ─────────────────────────────────────────────────────────────────
// Inline SVG icons (no external dependencies)
const Icon = ({ name, className = 'w-4 h-4' }: { name: string; className?: string }) => {
  const paths: Record<string, JSX.Element> = {
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
  }
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className}>
      {paths[name]}
    </svg>
  )
}

// ─── COMPONENTS ────────────────────────────────────────────────────────────

function ClassBadge({ c }: { c: Classification }) {
  const styles: Record<Classification, string> = {
    critico: 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/30',
    ruptura: 'bg-orange-500/15 text-orange-300 ring-1 ring-orange-500/30',
    atencao: 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30',
    saudavel: 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30',
    excesso: 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30',
    parado: 'bg-violet-500/15 text-violet-300 ring-1 ring-violet-500/30',
  }
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${styles[c]}`}>{CLASS_LABELS[c]}</span>
}

function RecBadge({ r }: { r: Recommendation }) {
  const styles: Record<Recommendation, string> = {
    'comprar-urgente': 'bg-rose-500 text-white',
    comprar: 'bg-orange-500/90 text-white',
    manter: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/30',
    pausar: 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/30',
    promover: 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/30',
    liquidar: 'bg-pink-500/20 text-pink-200 ring-1 ring-pink-500/30',
    descontinuar: 'bg-zinc-700 text-zinc-300 ring-1 ring-zinc-600',
  }
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${styles[r]}`}>{REC_LABELS[r]}</span>
}

function KpiCard({
  label, value, sub, icon, accent = 'default', big = false,
}: {
  label: string; value: string | number; sub?: string; icon?: string
  accent?: 'default' | 'danger' | 'warning' | 'success' | 'violet' | 'info'; big?: boolean
}) {
  const accentMap = {
    default: 'text-zinc-100', danger: 'text-rose-400', warning: 'text-amber-400',
    success: 'text-emerald-400', violet: 'text-violet-400', info: 'text-blue-400',
  }
  const iconBg = {
    default: 'bg-zinc-800 text-zinc-400', danger: 'bg-rose-500/10 text-rose-400',
    warning: 'bg-amber-500/10 text-amber-400', success: 'bg-emerald-500/10 text-emerald-400',
    violet: 'bg-violet-500/10 text-violet-400', info: 'bg-blue-500/10 text-blue-400',
  }
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/50 ${big ? 'p-6' : 'p-5'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-zinc-500">{label}</p>
          <p className={`mt-2 ${big ? 'text-3xl' : 'text-2xl'} font-semibold leading-none ${accentMap[accent]}`}>{value}</p>
          {sub && <p className="mt-2 text-[11px] text-zinc-500">{sub}</p>}
        </div>
        {icon && (
          <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg[accent]} shrink-0`}>
            <Icon name={icon} className="w-4 h-4" />
          </div>
        )}
      </div>
    </div>
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
  const [consumoRaw, setConsumoRaw] = useState('')
  const [mesesRaw, setMesesRaw] = useState('')
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; type: string; rows: number }[]>([])
  const [error, setError] = useState('')
  const [processLoading, setProcessLoading] = useState(false)
  const [dataSource, setDataSource] = useState<{
    stockSource: string
    demandSource: string
    lastProcessed: string
    wooOrders?: number
    wooSkus?: number
    wooItems?: number
    wooRevenue?: number
  }>({ stockSource: 'Demo interna', demandSource: 'Demo interna', lastProcessed: '' })
  const inputRef = useRef<HTMLInputElement>(null)

  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState<Classification | 'all'>('all')

  const [sim, setSim] = useState<SimParams>({
    leadTimeDias: 60, estoqueSegurancaDias: 15, orcamentoCompra: 999999999, metaReducaoParado: 30,
  })

  const [wcLoading, setWcLoading] = useState(false)
  const [wcResult, setWcResult] = useState<any>(null)
  const [wcError, setWcError] = useState('')
  const [sancoStatus, setSancoStatus] = useState('Integração preparada. Aguardando credenciais e endpoint final da Escalasoft.')

  const [aiOpen, setAiOpen] = useState(false)
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  // Auto-load mock on mount
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

  // ─── Summary ───
  const summary = useMemo(() => {
    if (!data.length) return null
    const valorTotal = data.reduce((a, d) => a + d.valorEstoque, 0)
    const capitalParado = data.reduce((a, d) => a + d.capitalParado, 0)
    const receitaEmRisco = data.reduce((a, d) => a + d.receitaEmRisco, 0)
    const sugestaoTotal = data.reduce((a, d) => a + d.valorSugestaoCompra, 0)
    return {
      totalSkus: data.length,
      criticos: data.filter(d => d.classification === 'critico').length,
      ruptura: data.filter(d => d.classification === 'ruptura').length,
      atencao: data.filter(d => d.classification === 'atencao').length,
      saudavel: data.filter(d => d.classification === 'saudavel').length,
      excesso: data.filter(d => d.classification === 'excesso').length,
      parado: data.filter(d => d.classification === 'parado').length,
      valorTotal, capitalParado, receitaEmRisco, sugestaoTotal,
      pctParado: valorTotal > 0 ? (capitalParado / valorTotal) * 100 : 0,
      oportunidadeFinanceira: capitalParado * 0.6 + receitaEmRisco,
    }
  }, [data])

  // ─── Top decisões ───
  const topDecisions = useMemo(() => {
    if (!data.length) return []
    return [...data].sort((a, b) => b.scorePrioridade - a.scorePrioridade).slice(0, 5)
  }, [data])

  // ─── File handling ───
  function handleFiles(files: FileList) {
    setError('')

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
      setConsumoRaw('')
      setMesesRaw('')
      setUploadedFiles([{ name: file.name, type: 'stock', rows }])
      setDataSource(prev => ({ ...prev, stockSource: `CSV SANCO · ${file.name}` }))
    }
    reader.readAsText(file, 'UTF-8')
  }

  async function handleProcess() {
    setError('')
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

      setConsumoRaw(wooConsumoCsv)
      setMesesRaw('')
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
    setDataSource({
      stockSource: 'Demo interna',
      demandSource: 'Demo interna',
      lastProcessed: new Date().toISOString(),
    })
  }

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


  // ─── Filtered data ───
  const filteredData = useMemo(() => {
    let r = [...data]
    if (classFilter !== 'all') r = r.filter(d => d.classification === classFilter)
    if (search) {
      const q = search.toLowerCase()
      r = r.filter(d => d.codigo.toLowerCase().includes(q) || d.produto.toLowerCase().includes(q))
    }
    return r.sort((a, b) => b.scorePrioridade - a.scorePrioridade)
  }, [data, search, classFilter])

  // ─── Cash leak data ───
  const cashLeakData = useMemo(() => {
    return [...data]
      .filter(d => d.classification === 'parado' || d.classification === 'excesso')
      .sort((a, b) => b.valorEstoque - a.valorEstoque)
  }, [data])

  // ─── Revenue at risk data ───
  const revenueRiskData = useMemo(() => {
    return [...data]
      .filter(d => d.classification === 'critico' || d.classification === 'ruptura' || d.classification === 'atencao')
      .sort((a, b) => b.receitaEmRisco - a.receitaEmRisco)
  }, [data])

  // ─── Import order data ───
  const importOrderData = useMemo(() => {
    return [...data]
      .filter(d => d.sugestaoCompra > 0)
      .sort((a, b) => b.scorePrioridade - a.scorePrioridade)
  }, [data])

  // ─── Not buy data ───
  const notBuyData = useMemo(() => {
    return [...data]
      .filter(d => ['pausar', 'liquidar', 'descontinuar', 'promover'].includes(d.recommendation))
      .sort((a, b) => b.valorEstoque - a.valorEstoque)
  }, [data])

  // ─── Simulation ───
  const simulation = useMemo(() => {
    const customData = data.map(d => {
      const estoqueNec = d.consumoDiario * (sim.leadTimeDias + sim.estoqueSegurancaDias)
      const sug = Math.max(0, Math.ceil(estoqueNec - d.estoqueUtil))
      return { ...d, sugestaoCompra: sug, valorSugestaoCompra: sug * d.valorUnitario }
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

    return {
      orcamentoUsado, compradosDentroOrcamento, evitados, criticosForaOrcamento,
      compraObrigatoria, naoComprar, valorEvitarRecompra, caixaLiberado,
      riscoRupturaResidual, totalCompras: compradosDentroOrcamento.length,
    }
  }, [data, sim])

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
        parametros: params,
        simulacao: {
          leadTimeDias: sim.leadTimeDias,
          estoqueSegurancaDias: sim.estoqueSegurancaDias,
          orcamentoCompra: sim.orcamentoCompra >= 999000000 ? 'ilimitado' : sim.orcamentoCompra,
          metaReducaoParado: sim.metaReducaoParado,
        },
        skus: data.slice(0, 150).map((d) => ({
          codigo: d.codigo,
          produto: d.produto,
          estoqueUtil: d.estoqueUtil,
          qtdDisponivel: d.qtdDisponivel,
          reservaVirtual: d.reservaVirtual,
          consumo: d.consumo,
          consumoDiario: d.consumoDiario,
          diasCobertura: d.diasCobertura,
          classification: d.classification,
          recommendation: d.recommendation,
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

  // ─── Tabs config ───
  const tabs: { id: Tab; label: string; icon: string; badge?: number }[] = [
    { id: 'overview', label: 'Executive overview', icon: 'chart' },
    { id: 'cash-leak', label: 'Cash leak detector', icon: 'cash', badge: summary?.parado },
    { id: 'revenue-risk', label: 'Revenue at risk', icon: 'alert', badge: summary ? summary.criticos + summary.ruptura : 0 },
    { id: 'import-ai', label: 'Import order AI', icon: 'truck' },
    { id: 'not-buy', label: 'What not to buy', icon: 'block' },
    { id: 'simulation', label: 'Business simulation', icon: 'sliders' },
    { id: 'integrations', label: 'Integrações', icon: 'target' },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}>

      {/* ── HEADER ── */}
      <header className="sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-md">
        <div className="mx-auto max-w-screen-2xl px-6 lg:px-8">
          <div className="flex h-14 items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-emerald-400 to-teal-600">
                <Icon name="bolt" className="w-3.5 h-3.5 text-zinc-900" />
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-semibold tracking-tight">STL Business Stock Intelligence</span>
                <span className="hidden sm:inline rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">MVP</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-2 text-[11px] text-zinc-500">
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                Conectado · WooCommerce + SANCO
                <span className="text-zinc-700">·</span>
                <span className="text-zinc-500">CSV SANCO + Woo 90d</span>
              </div>
              <button
                onClick={() => setShowImport(true)}
                className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-800"
              >
                <Icon name="upload" className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Importar dados</span>
              </button>
            </div>
          </div>

          {/* Tabs */}
          {hasData && (
            <nav className="flex gap-1 overflow-x-auto pb-0">
              {tabs.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`relative flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    tab === t.id ? 'text-emerald-400 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-emerald-400' : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  <Icon name={t.icon} className="w-3.5 h-3.5" />
                  {t.label}
                  {!!t.badge && t.badge > 0 && (
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${tab === t.id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                      {t.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          )}
        </div>
      </header>

      {/* ── IMPORT DRAWER ── */}
      {showImport && (
        <div className="border-b border-zinc-800 bg-zinc-900/40">
          <div className="mx-auto max-w-screen-2xl px-6 lg:px-8 py-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <div
                onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
                onDragOver={e => e.preventDefault()}
                onClick={() => inputRef.current?.click()}
                className="lg:col-span-2 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-700 bg-zinc-900/30 p-8 transition hover:border-emerald-500/50 hover:bg-zinc-900/50"
              >
                <Icon name="upload" className="w-8 h-8 text-zinc-500" />
                <p className="text-sm font-medium">Arraste o CSV de estoque SANCO ou clique para selecionar</p>
                <p className="text-[11px] text-zinc-500">Importe apenas o CSV de estoque atual da SANCO. A demanda vem automaticamente do WooCommerce dos últimos 3 meses.</p>
                <input ref={inputRef} type="file" multiple accept=".csv" className="hidden" onChange={e => e.target.files && handleFiles(e.target.files)} />
                {uploadedFiles.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2 justify-center">
                    {uploadedFiles.map(f => (
                      <span key={f.type} className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-300">
                        {f.name} · {f.rows} linhas
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
                  <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Parâmetros</p>
                  <div className="space-y-3">
                    {([
                      ['Lead time China', 'leadTimeDias', 'dias'],
                      ['Período WooCommerce', 'periodoRelatorioDias', 'dias'],
                      ['Estoque de segurança', 'estoqueSegurancaDias', 'dias'],
                    ] as const).map(([label, key, unit]) => (
                      <div key={key} className="flex items-center justify-between gap-3">
                        <label className="text-xs text-zinc-400">{label}</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={0}
                            value={params[key]}
                            onChange={e => setParams(p => ({ ...p, [key]: Number(e.target.value) }))}
                            className="w-16 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1 text-right text-xs text-zinc-100 focus:border-emerald-500 focus:outline-none"
                          />
                          <span className="text-[10px] text-zinc-500">{unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleProcess}
                    disabled={processLoading}
                    className="flex-1 rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {processLoading ? 'Processando WooCommerce...' : 'Processar SANCO + WooCommerce'}
                  </button>
                  <button onClick={handleLoadMock} className="rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 transition hover:border-zinc-600">
                    Demo
                  </button>
                </div>

                {processLoading && (
                  <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3">
                    <p className="text-xs font-semibold text-emerald-300">Cruzando dados agora...</p>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-400">Estoque atual do CSV SANCO + pedidos WooCommerce válidos dos últimos {params.periodoRelatorioDias} dias.</p>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                    <p className="text-xs font-semibold text-rose-300">Não foi possível processar</p>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-400">{error}</p>
                  </div>
                )}

                {dataSource.lastProcessed && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">Fonte atual</p>
                    <p className="mt-2 text-[11px] text-zinc-300">Estoque: {dataSource.stockSource}</p>
                    <p className="mt-1 text-[11px] text-zinc-300">Demanda: {dataSource.demandSource}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">Último processamento: {fmtDateTime(dataSource.lastProcessed)}</p>
                  </div>
                )}

                {hasData && <button onClick={() => setShowImport(false)} className="w-full text-[11px] text-zinc-500 hover:text-zinc-300">Fechar painel</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MAIN ── */}
      <main className="mx-auto max-w-screen-2xl px-6 lg:px-8 py-8">

        {/* ════ EXECUTIVE OVERVIEW ════ */}
        {tab === 'overview' && summary && (
          <div className="space-y-8">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Executive overview</h1>
              <p className="mt-1 text-sm text-zinc-500">
                Transformamos dados dispersos em decisões financeiras claras: o que comprar, o que parar de comprar e onde o caixa está preso.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-400">Estoque atual</p>
                <p className="mt-2 truncate text-sm font-semibold text-zinc-100">{dataSource.stockSource}</p>
                <p className="mt-1 text-[11px] text-zinc-500">Fonte oficial de saldo do dia</p>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-blue-400">Demanda real</p>
                <p className="mt-2 truncate text-sm font-semibold text-zinc-100">{dataSource.demandSource}</p>
                <p className="mt-1 text-[11px] text-zinc-500">Status: processando + enviado</p>
              </div>
              <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-400">Volume analisado</p>
                <p className="mt-2 text-sm font-semibold text-zinc-100">{dataSource.wooItems ? fmtNum(dataSource.wooItems) + ' un vendidas' : fmtNum(data.reduce((a,d)=>a+d.consumo,0)) + ' un'}</p>
                <p className="mt-1 text-[11px] text-zinc-500">{dataSource.wooSkus ? `${dataSource.wooSkus} SKUs vendidos` : `${data.length} SKUs avaliados`}</p>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">Atualizado em</p>
                <p className="mt-2 text-sm font-semibold text-zinc-100">{dataSource.lastProcessed ? fmtDateTime(dataSource.lastProcessed) : 'Agora'}</p>
                <p className="mt-1 text-[11px] text-zinc-500">Pronto para decisão de compra</p>
              </div>
            </div>

            {/* Row 1: 4 main KPIs */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <KpiCard label="Capital total em estoque" value={fmtBRLcompact(summary.valorTotal)} sub={`${summary.totalSkus} SKUs · ${fmtNum(data.reduce((a,d)=>a+d.estoqueUtil,0))} unidades`} icon="cash" big />
              <KpiCard label="Capital parado" value={fmtBRLcompact(summary.capitalParado)} sub={`${fmtPct(summary.pctParado)} do estoque · ${summary.parado + summary.excesso} SKUs`} icon="block" accent="violet" big />
              <KpiCard label="Receita em risco" value={fmtBRLcompact(summary.receitaEmRisco)} sub="Por rupturas iminentes" icon="alert" accent="danger" big />
              <KpiCard label="Oportunidade financeira" value={fmtBRLcompact(summary.oportunidadeFinanceira)} sub="Caixa potencial liberável" icon="bolt" accent="success" big />
            </div>

            {/* Distribution */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
              <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">Distribuição financeira do portfólio</p>
              <div className="flex h-2.5 w-full overflow-hidden rounded-full">
                {[
                  { count: summary.criticos, color: 'bg-rose-500', label: 'Crítico' },
                  { count: summary.ruptura, color: 'bg-orange-500', label: 'Ruptura' },
                  { count: summary.atencao, color: 'bg-amber-500', label: 'Atenção' },
                  { count: summary.saudavel, color: 'bg-emerald-500', label: 'Saudável' },
                  { count: summary.excesso, color: 'bg-blue-500', label: 'Excesso' },
                  { count: summary.parado, color: 'bg-violet-500', label: 'Parado' },
                ].map((s, i) => s.count > 0 && (
                  <div key={i} className={s.color} style={{ width: `${(s.count / summary.totalSkus) * 100}%` }} />
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
                {[
                  { label: 'Crítico', count: summary.criticos, dot: 'bg-rose-500', text: 'text-rose-400' },
                  { label: 'Ruptura', count: summary.ruptura, dot: 'bg-orange-500', text: 'text-orange-400' },
                  { label: 'Atenção', count: summary.atencao, dot: 'bg-amber-500', text: 'text-amber-400' },
                  { label: 'Saudável', count: summary.saudavel, dot: 'bg-emerald-500', text: 'text-emerald-400' },
                  { label: 'Excesso', count: summary.excesso, dot: 'bg-blue-500', text: 'text-blue-400' },
                  { label: 'Parado', count: summary.parado, dot: 'bg-violet-500', text: 'text-violet-400' },
                ].map(s => (
                  <div key={s.label}>
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400">
                      <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                      {s.label}
                    </div>
                    <p className={`mt-0.5 text-lg font-semibold ${s.text}`}>{s.count}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Top decisions */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Top 5 decisões para tomar agora</h2>
                  <p className="text-xs text-zinc-500">Score baseado em receita em risco e capital travado</p>
                </div>
                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-400">PRIORITIZADO POR IA</span>
              </div>
              <div className="space-y-2">
                {topDecisions.map((d, i) => (
                  <div key={d.codigo} className="group flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-zinc-700">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-sm font-bold text-zinc-300">
                      {i + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <ClassBadge c={d.classification} />
                        <RecBadge r={d.recommendation} />
                        <span className="font-mono text-[10px] text-zinc-600">{d.codigo}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-medium text-zinc-100">{d.produto}</p>
                      <p className="mt-0.5 text-xs text-zinc-500">{d.motivo}</p>
                    </div>
                    <div className="hidden md:flex flex-col items-end gap-0.5 text-right shrink-0">
                      {d.receitaEmRisco > 0 && (
                        <p className="text-xs font-semibold text-rose-400">{fmtBRLcompact(d.receitaEmRisco)} em risco</p>
                      )}
                      {d.valorEstoque > 0 && (
                        <p className="text-[10px] text-zinc-500">{fmtBRLcompact(d.valorEstoque)} em estoque</p>
                      )}
                      {d.sugestaoCompra > 0 && (
                        <p className="text-[10px] font-medium text-emerald-400">Comprar {fmtNum(d.sugestaoCompra)} un</p>
                      )}
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-800 text-sm font-bold">
                      <span className={d.scorePrioridade >= 70 ? 'text-rose-400' : d.scorePrioridade >= 40 ? 'text-amber-400' : 'text-emerald-400'}>
                        {d.scorePrioridade}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Action shortcuts */}
            <div className="grid gap-3 md:grid-cols-3">
              <button onClick={() => setTab('cash-leak')} className="group rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 text-left transition hover:border-violet-500/50 hover:bg-violet-500/5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
                  <Icon name="cash" />
                </div>
                <p className="text-sm font-semibold text-zinc-100">Onde meu dinheiro está parado?</p>
                <p className="mt-1 text-xs text-zinc-500">{fmtBRLcompact(summary.capitalParado)} travado em {summary.parado + summary.excesso} SKUs</p>
                <p className="mt-3 text-[11px] text-violet-400 group-hover:text-violet-300">Ver cash leak detector →</p>
              </button>
              <button onClick={() => setTab('revenue-risk')} className="group rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 text-left transition hover:border-rose-500/50 hover:bg-rose-500/5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
                  <Icon name="alert" />
                </div>
                <p className="text-sm font-semibold text-zinc-100">Quais produtos vão romper?</p>
                <p className="mt-1 text-xs text-zinc-500">{summary.criticos + summary.ruptura} SKUs em risco · {fmtBRLcompact(summary.receitaEmRisco)} em jogo</p>
                <p className="mt-3 text-[11px] text-rose-400 group-hover:text-rose-300">Ver revenue at risk →</p>
              </button>
              <button onClick={() => setTab('import-ai')} className="group rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 text-left transition hover:border-emerald-500/50 hover:bg-emerald-500/5">
                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Icon name="truck" />
                </div>
                <p className="text-sm font-semibold text-zinc-100">O que devo comprar agora?</p>
                <p className="mt-1 text-xs text-zinc-500">{importOrderData.length} SKUs · {fmtBRLcompact(summary.sugestaoTotal)} sugeridos</p>
                <p className="mt-3 text-[11px] text-emerald-400 group-hover:text-emerald-300">Ver import order AI →</p>
              </button>
            </div>
          </div>
        )}

        {/* ════ CASH LEAK DETECTOR ════ */}
        {tab === 'cash-leak' && summary && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Cash leak detector</h1>
              <p className="mt-1 text-sm text-zinc-500">Onde seu caixa está vazando — produtos que prendem capital sem gerar retorno</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <KpiCard label="Caixa preso total" value={fmtBRLcompact(summary.capitalParado)} accent="violet" icon="cash" />
              <KpiCard label="SKUs sem giro" value={summary.parado} accent="violet" sub="Sem venda no período" />
              <KpiCard label="SKUs em excesso" value={summary.excesso} accent="info" sub="Cobertura > 90 dias" />
              <KpiCard label="Caixa liberável estimado" value={fmtBRLcompact(summary.capitalParado * 0.6)} accent="success" sub="Com promoção/liquidação" />
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
              <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3">
                <p className="text-sm font-semibold">Maiores travadores de capital</p>
                <button onClick={() => exportCSV(cashLeakData.map(d => ({
                  Codigo: d.codigo, Produto: d.produto, ValorParado: d.valorEstoque, EstoqueUtil: d.estoqueUtil,
                  Consumo: d.consumo, Cobertura: isFinite(d.diasCobertura) ? Math.round(d.diasCobertura) : '∞',
                  Recomendacao: REC_LABELS[d.recommendation], Motivo: d.motivo,
                })), 'cash_leak.csv')} className="flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:border-zinc-600">
                  <Icon name="download" className="w-3 h-3" />
                  Exportar CSV
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-800 bg-zinc-900/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Produto</th>
                      <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Status</th>
                      <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Capital travado</th>
                      <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Estoque</th>
                      <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Cobertura</th>
                      <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Giro</th>
                      <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Ação recomendada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {cashLeakData.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-500">Nenhum vazamento de caixa detectado.</td></tr>
                    ) : cashLeakData.map(d => (
                      <tr key={d.codigo} className="hover:bg-zinc-900/30">
                        <td className="px-4 py-3 max-w-[260px]">
                          <p className="truncate text-[13px] font-medium text-zinc-100">{d.produto}</p>
                          <p className="font-mono text-[10px] text-zinc-600">{d.codigo}</p>
                        </td>
                        <td className="px-4 py-3"><ClassBadge c={d.classification} /></td>
                        <td className="px-4 py-3 text-right text-[13px] font-semibold text-violet-300">{fmtBRL(d.valorEstoque)}</td>
                        <td className="px-4 py-3 text-right text-[12px] text-zinc-400">{fmtNum(d.estoqueUtil)} un</td>
                        <td className="px-4 py-3 text-right text-[12px] text-zinc-400">{fmtDias(d.diasCobertura)}</td>
                        <td className="px-4 py-3 text-right text-[12px] text-zinc-500">{d.giro === 999 ? '∞' : d.giro.toFixed(2) + 'x'}</td>
                        <td className="px-4 py-3"><RecBadge r={d.recommendation} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ════ REVENUE AT RISK ════ */}
        {tab === 'revenue-risk' && summary && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Revenue at risk</h1>
              <p className="mt-1 text-sm text-zinc-500">Quanto deixaremos de faturar se essas rupturas se confirmarem</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <KpiCard label="Receita total em risco" value={fmtBRLcompact(summary.receitaEmRisco)} accent="danger" icon="alert" />
              <KpiCard label="SKUs críticos" value={summary.criticos} accent="danger" sub="Ruptura agora" />
              <KpiCard label="Ruptura iminente" value={summary.ruptura} accent="warning" sub="< 15 dias" />
              <KpiCard label="Em atenção" value={summary.atencao} accent="warning" sub="< 30 dias" />
            </div>

            <div className="space-y-2">
              {revenueRiskData.length === 0 ? (
                <p className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-8 text-center text-sm text-zinc-500">Nenhum produto em risco de ruptura.</p>
              ) : revenueRiskData.map((d, i) => (
                <div key={d.codigo} className="flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 hover:border-zinc-700">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-zinc-800 text-xs font-bold text-zinc-400">
                    #{i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <ClassBadge c={d.classification} />
                      <span className="font-mono text-[10px] text-zinc-600">{d.codigo}</span>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{d.produto}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">{d.motivo}</p>
                  </div>
                  <div className="hidden lg:flex flex-col items-end gap-0.5 shrink-0 text-right">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Receita em risco</p>
                    <p className="text-base font-semibold text-rose-400">{fmtBRLcompact(d.receitaEmRisco)}</p>
                    <p className="text-[10px] text-zinc-500">{fmtNum(d.consumo)} un consumidas · {fmtNum(d.estoqueUtil)} em estoque</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[10px] uppercase tracking-wider text-zinc-500">Comprar</p>
                    <p className="text-base font-semibold text-emerald-400">{fmtNum(d.sugestaoCompra)} un</p>
                    <p className="text-[10px] text-zinc-500">{fmtBRLcompact(d.valorSugestaoCompra)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════ IMPORT ORDER AI ════ */}
        {tab === 'import-ai' && summary && (
          <div className="space-y-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Import order AI</h1>
                <p className="mt-1 text-sm text-zinc-500">Pedido de importação otimizado por algoritmo de priorização</p>
              </div>
              <button onClick={() => exportCSV(importOrderData.map(d => ({
                Codigo: d.codigo, Produto: d.produto, EstoqueAtual: d.estoqueUtil,
                ConsumoDiario: d.consumoDiario.toFixed(2), CoberturaAtual: isFinite(d.diasCobertura) ? Math.round(d.diasCobertura) : '∞',
                QtdSugerida: d.sugestaoCompra, ValorEstimado: d.valorSugestaoCompra,
                Prioridade: d.scorePrioridade >= 70 ? 'Alta' : d.scorePrioridade >= 40 ? 'Média' : 'Baixa',
                Motivo: d.motivo,
              })), 'pedido_importacao.csv')} className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400">
                <Icon name="download" className="w-3.5 h-3.5" />
                Exportar pedido
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <KpiCard label="SKUs no pedido" value={importOrderData.length} icon="truck" />
              <KpiCard label="Unidades totais" value={fmtNum(importOrderData.reduce((a,d)=>a+d.sugestaoCompra,0))} sub="Soma de todas as sugestões" />
              <KpiCard label="Investimento estimado" value={fmtBRLcompact(summary.sugestaoTotal)} accent="info" sub={`Lead time: ${params.leadTimeDias}d + ${params.estoqueSegurancaDias}d segurança`} />
              <KpiCard label="ROI esperado" value={fmtBRLcompact(summary.sugestaoTotal / (1 - params.margemPadrao) - summary.sugestaoTotal)} accent="success" sub={`Margem ${(params.margemPadrao*100).toFixed(0)}%`} />
            </div>

            {/* Priority groups */}
            {(['alta', 'media', 'baixa'] as const).map(priority => {
              const items = importOrderData.filter(d => {
                if (priority === 'alta') return d.scorePrioridade >= 70
                if (priority === 'media') return d.scorePrioridade >= 40 && d.scorePrioridade < 70
                return d.scorePrioridade < 40
              })
              if (items.length === 0) return null
              const config = {
                alta: {
                  label: 'Prioridade alta', desc: 'Comprar imediatamente — risco de ruptura',
                  headerBg: 'bg-rose-500/5', dot: 'bg-rose-500', qty: 'text-rose-400',
                },
                media: {
                  label: 'Prioridade média', desc: 'Incluir no próximo pedido',
                  headerBg: 'bg-amber-500/5', dot: 'bg-amber-500', qty: 'text-amber-400',
                },
                baixa: {
                  label: 'Prioridade baixa', desc: 'Pode aguardar próximo ciclo',
                  headerBg: 'bg-emerald-500/5', dot: 'bg-emerald-500', qty: 'text-emerald-400',
                },
              }[priority]
              return (
                <div key={priority} className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                  <div className={`border-b border-zinc-800 ${config.headerBg} px-5 py-3`}>
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${config.dot}`}></span>
                      <p className="text-sm font-semibold">{config.label}</p>
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{items.length} SKUs · {fmtBRLcompact(items.reduce((a,d)=>a+d.valorSugestaoCompra,0))}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500">{config.desc}</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-zinc-900/40">
                        <tr>
                          <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">SKU</th>
                          <th className="px-4 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Estoque</th>
                          <th className="px-4 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Consumo/dia</th>
                          <th className="px-4 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Cobertura</th>
                          <th className="px-4 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Comprar</th>
                          <th className="px-4 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Valor</th>
                          <th className="px-4 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Motivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {items.map(d => (
                          <tr key={d.codigo} className="hover:bg-zinc-900/30">
                            <td className="px-4 py-2.5 max-w-[220px]">
                              <p className="truncate text-[13px] font-medium">{d.produto}</p>
                              <p className="font-mono text-[10px] text-zinc-600">{d.codigo}</p>
                            </td>
                            <td className="px-4 py-2.5 text-right text-[12px] text-zinc-400">{fmtNum(d.estoqueUtil)}</td>
                            <td className="px-4 py-2.5 text-right text-[12px] text-zinc-400">{d.consumoDiario.toFixed(1)}</td>
                            <td className="px-4 py-2.5 text-right text-[12px] text-zinc-400">{fmtDias(d.diasCobertura)}</td>
                            <td className={`px-4 py-2.5 text-right text-[13px] font-bold ${config.qty}`}>{fmtNum(d.sugestaoCompra)} un</td>
                            <td className="px-4 py-2.5 text-right text-[12px] font-medium text-zinc-300">{fmtBRL(d.valorSugestaoCompra)}</td>
                            <td className="px-4 py-2.5 max-w-[260px]"><p className="truncate text-[11px] text-zinc-500">{d.motivo}</p></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ════ WHAT NOT TO BUY ════ */}
        {tab === 'not-buy' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">What not to buy</h1>
              <p className="mt-1 text-sm text-zinc-500">Produtos onde recomprar significa queimar caixa</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <KpiCard label="SKUs para pausar/cortar" value={notBuyData.length} icon="block" accent="warning" />
              <KpiCard label="Capital a evitar recompra" value={fmtBRLcompact(notBuyData.reduce((a,d)=>a+d.consumoDiario*params.leadTimeDias*d.valorUnitario,0))} accent="warning" />
              <KpiCard label="Capital travado nesses SKUs" value={fmtBRLcompact(notBuyData.reduce((a,d)=>a+d.valorEstoque,0))} accent="violet" />
              <KpiCard label="Liquidação estimada" value={fmtBRLcompact(notBuyData.filter(d => d.recommendation === 'liquidar').reduce((a,d)=>a+d.valorEstoque*0.6,0))} accent="success" sub="60% do valor" />
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-zinc-800 bg-zinc-900/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Produto</th>
                      <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Status</th>
                      <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Estoque</th>
                      <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Capital travado</th>
                      <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Cobertura</th>
                      <th className="px-4 py-3 text-right text-[10px] font-medium uppercase tracking-wider text-zinc-500">Giro</th>
                      <th className="px-4 py-3 text-left text-[10px] font-medium uppercase tracking-wider text-zinc-500">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {notBuyData.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-zinc-500">Todos os SKUs vale a pena recomprar.</td></tr>
                    ) : notBuyData.map(d => (
                      <tr key={d.codigo} className="hover:bg-zinc-900/30">
                        <td className="px-4 py-3 max-w-[260px]">
                          <p className="truncate text-[13px] font-medium">{d.produto}</p>
                          <p className="font-mono text-[10px] text-zinc-600">{d.codigo}</p>
                        </td>
                        <td className="px-4 py-3"><ClassBadge c={d.classification} /></td>
                        <td className="px-4 py-3 text-right text-[12px] text-zinc-400">{fmtNum(d.estoqueUtil)}</td>
                        <td className="px-4 py-3 text-right text-[13px] font-semibold text-violet-300">{fmtBRL(d.valorEstoque)}</td>
                        <td className="px-4 py-3 text-right text-[12px] text-zinc-400">{fmtDias(d.diasCobertura)}</td>
                        <td className="px-4 py-3 text-right text-[12px] text-zinc-500">{d.giro === 999 ? '∞' : d.giro.toFixed(2) + 'x'}</td>
                        <td className="px-4 py-3"><RecBadge r={d.recommendation} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ════ BUSINESS SIMULATION ════ */}
        {tab === 'simulation' && summary && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Business simulation</h1>
              <p className="mt-1 text-sm text-zinc-500">Simule cenários de compra e veja o impacto financeiro antes de decidir</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Controls */}
              <div className="lg:col-span-1 space-y-3">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <Icon name="sliders" className="w-4 h-4 text-emerald-400" />
                    <p className="text-sm font-semibold">Variáveis da simulação</p>
                  </div>
                  <div className="space-y-5">
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-xs text-zinc-400">Lead time (dias)</label>
                        <span className="text-xs font-semibold text-emerald-400">{sim.leadTimeDias}d</span>
                      </div>
                      <input type="range" min={15} max={120} step={1} value={sim.leadTimeDias}
                        onChange={e => setSim(s => ({ ...s, leadTimeDias: Number(e.target.value) }))}
                        className="w-full accent-emerald-500" />
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-xs text-zinc-400">Estoque de segurança</label>
                        <span className="text-xs font-semibold text-emerald-400">{sim.estoqueSegurancaDias}d</span>
                      </div>
                      <input type="range" min={0} max={45} step={1} value={sim.estoqueSegurancaDias}
                        onChange={e => setSim(s => ({ ...s, estoqueSegurancaDias: Number(e.target.value) }))}
                        className="w-full accent-emerald-500" />
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-xs text-zinc-400">Orçamento de compra</label>
                        <span className="text-xs font-semibold text-emerald-400">
                          {sim.orcamentoCompra >= 999000000 ? 'Ilimitado' : fmtBRLcompact(sim.orcamentoCompra)}
                        </span>
                      </div>
                      <input type="range" min={10000} max={10000000} step={50000} value={Math.min(sim.orcamentoCompra, 10000000)}
                        onChange={e => setSim(s => ({ ...s, orcamentoCompra: Number(e.target.value) }))}
                        className="w-full accent-emerald-500" />
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setSim(s => ({ ...s, orcamentoCompra: 999999999 }))}
                          className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[11px] font-semibold text-emerald-400 hover:bg-emerald-500/20"
                        >
                          Orçamento ilimitado
                        </button>
                        <button
                          type="button"
                          onClick={() => setSim(s => ({ ...s, orcamentoCompra: 500000 }))}
                          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] font-semibold text-zinc-300 hover:border-zinc-600"
                        >
                          Voltar para R$ 500k
                        </button>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label className="text-xs text-zinc-400">Meta redução parado</label>
                        <span className="text-xs font-semibold text-emerald-400">{sim.metaReducaoParado}%</span>
                      </div>
                      <input type="range" min={0} max={100} step={5} value={sim.metaReducaoParado}
                        onChange={e => setSim(s => ({ ...s, metaReducaoParado: Number(e.target.value) }))}
                        className="w-full accent-emerald-500" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Results */}
              <div className="lg:col-span-2 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <KpiCard label="Compras dentro do orçamento" value={simulation.totalCompras} sub={`${fmtBRLcompact(simulation.orcamentoUsado)} de ${sim.orcamentoCompra >= 999000000 ? 'orçamento ilimitado' : fmtBRLcompact(sim.orcamentoCompra)}`} accent="success" icon="truck" />
                  <KpiCard label="Críticos obrigatórios" value={simulation.compraObrigatoria.length} sub={`${fmtBRLcompact(simulation.compraObrigatoria.reduce((a,d)=>a+d.valorSugestaoCompra,0))} em compra crítica`} accent="danger" icon="alert" />
                  <KpiCard label="Recompra evitada" value={fmtBRLcompact(simulation.valorEvitarRecompra)} sub={`${simulation.naoComprar.length} SKUs descartados`} accent="warning" icon="block" />
                  <KpiCard label="Risco residual" value={fmtBRLcompact(simulation.riscoRupturaResidual)} sub={`${simulation.evitados.length} SKUs fora do orçamento`} accent="danger" icon="alert" />
                </div>

                {/* Net impact */}
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
                  <p className="mb-4 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-400">Impacto líquido projetado</p>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div>
                      <p className="text-[11px] text-zinc-500">Saída de caixa (compras)</p>
                      <p className="mt-1 text-lg font-semibold text-rose-400">- {fmtBRLcompact(simulation.orcamentoUsado)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-500">Entrada de caixa (liberação)</p>
                      <p className="mt-1 text-lg font-semibold text-emerald-400">+ {fmtBRLcompact(simulation.caixaLiberado + simulation.valorEvitarRecompra)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] text-zinc-500">Saldo no caixa</p>
                      <p className={`mt-1 text-2xl font-bold ${simulation.caixaLiberado + simulation.valorEvitarRecompra - simulation.orcamentoUsado >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {simulation.caixaLiberado + simulation.valorEvitarRecompra - simulation.orcamentoUsado >= 0 ? '+ ' : '- '}
                        {fmtBRLcompact(Math.abs(simulation.caixaLiberado + simulation.valorEvitarRecompra - simulation.orcamentoUsado))}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Mandatory critical list */}
                {simulation.compraObrigatoria.length > 0 && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 overflow-hidden">
                    <div className="border-b border-rose-500/20 bg-rose-500/10 px-5 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-rose-100">Compra obrigatória, mesmo se ultrapassar orçamento</p>
                          <p className="text-[11px] text-rose-200/70">SKUs zerados ou abaixo do mínimo com demanda ativa. Eles sempre aparecem aqui para não sumirem da decisão.</p>
                        </div>
                        <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold text-rose-300">
                          {simulation.compraObrigatoria.length} SKUs · {fmtBRLcompact(simulation.compraObrigatoria.reduce((a,d)=>a+d.valorSugestaoCompra,0))}
                        </span>
                      </div>
                    </div>
                    <div className="max-h-72 overflow-y-auto">
                      {simulation.compraObrigatoria.slice(0, 20).map((d, i) => (
                        <div key={d.codigo} className="flex items-center justify-between gap-3 border-b border-rose-500/10 px-4 py-2.5 hover:bg-rose-500/5">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose-500/15 text-[11px] font-bold text-rose-300">
                              #{i + 1}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <ClassBadge c={d.classification} />
                                <span className="font-mono text-[10px] text-zinc-600">{d.codigo}</span>
                              </div>
                              <p className="mt-0.5 truncate text-[13px] font-medium text-zinc-100">{d.produto}</p>
                              <p className="text-[10px] text-zinc-500">{fmtNum(d.consumo)} un consumidas · {fmtNum(d.estoqueUtil)} em estoque</p>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Comprar</p>
                            <p className="text-[13px] font-bold text-emerald-400">{fmtNum(d.sugestaoCompra)} un</p>
                            <p className="text-[10px] text-zinc-500">{fmtBRLcompact(d.valorSugestaoCompra)}</p>
                          </div>
                          <div className="hidden sm:block text-right shrink-0 min-w-[110px]">
                            <p className="text-[10px] uppercase tracking-wider text-zinc-500">Receita em risco</p>
                            <p className="text-[13px] font-bold text-rose-400">{fmtBRLcompact(d.receitaEmRisco)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Buy list */}
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 overflow-hidden">
                  <div className="border-b border-zinc-800 bg-zinc-900/50 px-5 py-3">
                    <p className="text-sm font-semibold">Recomendado comprar dentro do orçamento</p>
                    <p className="text-[11px] text-zinc-500">Algoritmo prioriza receita em risco e evita ruptura</p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {simulation.compradosDentroOrcamento.slice(0, 30).map(d => (
                      <div key={d.codigo} className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-2.5 hover:bg-zinc-900/30">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <ClassBadge c={d.classification} />
                            <span className="font-mono text-[10px] text-zinc-600">{d.codigo}</span>
                          </div>
                          <p className="mt-0.5 truncate text-[13px]">{d.produto}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[13px] font-semibold text-emerald-400">{fmtNum(d.sugestaoCompra)} un</p>
                          <p className="text-[10px] text-zinc-500">{fmtBRL(d.valorSugestaoCompra)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {simulation.evitados.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon name="alert" className="w-4 h-4 text-amber-400" />
                      <p className="text-sm font-semibold text-amber-200">
                        Atenção: {simulation.evitados.length} SKUs ficaram fora do orçamento
                        {simulation.criticosForaOrcamento.length > 0 ? ` · ${simulation.criticosForaOrcamento.length} críticos` : ''}
                      </p>
                    </div>
                    <p className="text-xs text-amber-200/70">
                      Receita em risco residual: {fmtBRLcompact(simulation.riscoRupturaResidual)}.
                      Considere aumentar o orçamento em {fmtBRLcompact(simulation.evitados.reduce((a,d)=>a+d.valorSugestaoCompra,0))} para cobrir todos os SKUs prioritários.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ════ INTEGRAÇÕES ════ */}
        {tab === 'integrations' && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-400">Data Integration Hub</p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">Integrações operacionais</h1>
                <p className="mt-1 max-w-3xl text-sm text-zinc-500">
                  Conecte vendas, estoque e histórico para transformar o MVP em um motor real de decisão de compra, caixa e ruptura.
                </p>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-medium text-emerald-400">
                MVP preparado para API
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">WooCommerce</h2>
                    <p className="mt-1 text-xs font-medium text-emerald-400">Pronto para conectar</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
                    <Icon name="cash" />
                  </div>
                </div>

                <p className="text-sm leading-6 text-zinc-500">
                  Fonte de pedidos, SKUs vendidos, receita, preço médio, datas de compra e velocidade de venda.
                </p>

                <div className="mt-4 grid gap-2 text-xs text-zinc-400">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Pedidos reais e status de pagamento</div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Demanda por SKU e cor</div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Receita, ticket e margem estimada</div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Previsão de ruptura baseada em vendas</div>
                </div>

                <button
                  onClick={testWooCommerceConnection}
                  disabled={wcLoading}
                  className="mt-5 w-full rounded-md bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {wcLoading ? 'Testando conexão...' : 'Testar conexão WooCommerce'}
                </button>

                {wcResult && (
                  <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                    <p className="text-xs font-semibold text-emerald-300">Conectado com sucesso</p>
                    <p className="mt-1 text-[11px] text-zinc-400">
                      Pedidos encontrados: {wcResult.count ?? wcResult.orders?.length ?? 0}
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Última sincronização: {new Date().toLocaleString('pt-BR')}
                    </p>

                    {Array.isArray(wcResult.orders) && wcResult.orders.length > 0 && (
                      <div className="mt-3 space-y-1.5">
                        {wcResult.orders.slice(0, 3).map((order: any) => (
                          <div key={order.id} className="rounded-md border border-emerald-500/20 bg-zinc-950/40 px-2 py-1.5 text-[11px] text-zinc-300">
                            Pedido #{order.id} · {order.status} · R$ {order.total}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {wcError && (
                  <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3">
                    <p className="text-xs font-semibold text-rose-300">Erro na conexão</p>
                    <p className="mt-1 text-[11px] text-zinc-400">{wcError}</p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Verifique se WC_STORE_URL, WC_CONSUMER_KEY e WC_CONSUMER_SECRET estão configuradas na Vercel.
                    </p>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">SANCO / Escalasoft</h2>
                    <p className="mt-1 text-xs font-medium text-amber-400">Em validação</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                    <Icon name="truck" />
                  </div>
                </div>

                <p className="text-sm leading-6 text-zinc-500">
                  Fonte de estoque, movimentação, permanência, entrada e saída de mercadoria.
                </p>

                <div className="mt-4 grid gap-2 text-xs text-zinc-400">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Estoque sempre atualizado</div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Movimentação automática</div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Permanência real por SKU</div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Alertas em tempo real</div>
                </div>

                <button
                  onClick={testSancoConnection}
                  className="mt-5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
                >
                  Testar API SANCO
                </button>

                <div className="mt-4 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-[11px] leading-5 text-zinc-400">{sancoStatus}</p>
                </div>
              </div>

              <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-base font-semibold">CSV Manual</h2>
                    <p className="mt-1 text-xs font-medium text-emerald-400">Ativo no MVP</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                    <Icon name="upload" />
                  </div>
                </div>

                <p className="text-sm leading-6 text-zinc-500">
                  Fallback seguro para importar relatórios atuais da SANCO enquanto as APIs são validadas.
                </p>

                <div className="mt-4 grid gap-2 text-xs text-zinc-400">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Estoque atual</div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Maior movimentação</div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Maior permanência</div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 px-3 py-2">Análise instantânea</div>
                </div>

                <button
                  onClick={() => setShowImport(true)}
                  className="mt-5 w-full rounded-md border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-800"
                >
                  Importar CSV
                </button>

                <div className="mt-4 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
                  <p className="text-[11px] leading-5 text-zinc-400">
                    O CSV mantém o MVP funcional mesmo sem depender das APIs no dia da apresentação.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-500">Arquitetura de dados</p>

              <div className="mt-5 grid gap-3 md:grid-cols-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <p className="text-sm font-semibold text-zinc-100">WooCommerce</p>
                  <p className="mt-1 text-xs text-zinc-500">Motor de demanda</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <p className="text-sm font-semibold text-zinc-100">SANCO / Escalasoft</p>
                  <p className="mt-1 text-xs text-zinc-500">Motor de estoque</p>
                </div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
                  <p className="text-sm font-semibold text-zinc-100">Neon / Postgres</p>
                  <p className="mt-1 text-xs text-zinc-500">Histórico e inteligência</p>
                </div>
                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <p className="text-sm font-semibold text-emerald-300">STL Business Intelligence</p>
                  <p className="mt-1 text-xs text-zinc-400">Compra, caixa e ruptura</p>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
                <p className="text-sm font-medium text-zinc-200">Mensagem para o hackathon</p>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  Hoje o MVP funciona por CSV. A arquitetura já está preparada para substituir upload manual por integrações automáticas:
                  WooCommerce alimenta demanda e receita, SANCO/Escalasoft alimenta estoque e movimentação, Neon armazena histórico e o
                  STL Business Stock Intelligence transforma tudo em decisão financeira.
                </p>
              </div>
            </div>
          </div>
        )}

      </main>

      <div className="fixed bottom-5 right-5 z-50">
        {aiOpen && (
          <div className="mb-3 w-[390px] max-w-[calc(100vw-40px)] rounded-2xl border border-zinc-800 bg-zinc-950 p-4 shadow-2xl">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-zinc-100">Copiloto IA</p>
                <p className="text-xs text-zinc-500">Pergunte sobre estoque, ruptura, compra e caixa.</p>
              </div>
              <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">AI</span>
            </div>

            <div className="mb-3 flex flex-wrap gap-2">
              {[
                'Quais filamentos têm menos de 5 unidades?',
                'O que devo importar primeiro?',
                'Quais produtos estão parados?',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => askAI(q)}
                  disabled={aiLoading}
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-[10px] text-zinc-400 transition hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-60"
                >
                  {q}
                </button>
              ))}
            </div>

            <textarea
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              placeholder="Ex: quanto temos de filamento PLA Branco?"
              className="min-h-[92px] w-full rounded-xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-100 outline-none focus:border-emerald-500"
            />

            <button
              onClick={() => askAI()}
              disabled={aiLoading || !aiQuestion.trim()}
              className="mt-3 w-full rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {aiLoading ? 'Analisando...' : 'Perguntar'}
            </button>

            {aiError && (
              <div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs leading-5 text-rose-300">
                {aiError}
              </div>
            )}

            {aiAnswer && (
              <div className="mt-3 max-h-[340px] overflow-y-auto rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 via-zinc-950 to-zinc-950 p-4 text-sm leading-relaxed text-zinc-100 shadow-inner">
                <div className="mb-3 flex items-center gap-2 border-b border-emerald-500/20 pb-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-xs font-black text-zinc-950">
                    AI
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-300">Análise do Copiloto</p>
                    <p className="text-[11px] text-zinc-500">Baseado nos dados atuais do dashboard</p>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/70 p-3">
                  <div className="whitespace-pre-wrap text-[13px] leading-6 text-zinc-200">
                    {aiAnswer}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => setAiOpen((v) => !v)}
          className="rounded-full bg-emerald-500 px-5 py-3 text-sm font-bold text-zinc-950 shadow-lg transition hover:bg-emerald-400"
        >
          {aiOpen ? 'Fechar IA' : 'Perguntar à IA'}
        </button>
      </div>

      <footer className="border-t border-zinc-800 mt-16 py-6">
        <div className="mx-auto max-w-screen-2xl px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-500">
          <span>STL Business Stock Intelligence · MVP hackathon</span>
          <span>Decisões financeiras claras a partir de dados dispersos</span>
        </div>
      </footer>
    </div>
  )
}