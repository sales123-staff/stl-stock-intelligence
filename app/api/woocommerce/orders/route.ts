import { NextRequest, NextResponse } from 'next/server'

type WooOrder = {
  id: number
  number?: string
  status?: string
  total?: string
  date_created?: string
  billing?: {
    first_name?: string
    last_name?: string
    email?: string
    phone?: string
    address_1?: string
    address_2?: string
    city?: string
    state?: string
    postcode?: string
    country?: string
  }
  shipping?: {
    first_name?: string
    last_name?: string
    address_1?: string
    address_2?: string
    city?: string
    state?: string
    postcode?: string
    country?: string
  }
  line_items?: Array<{
    id?: number
    product_id?: number
    variation_id?: number
    name?: string
    sku?: string
    quantity?: number
    subtotal?: string
    total?: string
    price?: number
  }>
}

const DEFAULT_VALID_STATUSES = ['processing', 'shipped-out']
const RISK_STATUSES = ['failed', 'cancelled', 'pending', 'on-hold', 'refunded']

function cleanStoreUrl(url: string) {
  return url.replace(/\/+$/, '')
}

function parseMoney(value: unknown): number {
  if (value === undefined || value === null) return 0
  const n = Number(String(value).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function getAuthHeader() {
  const key = process.env.WC_CONSUMER_KEY
  const secret = process.env.WC_CONSUMER_SECRET

  if (!key || !secret) return ''

  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`
}

function daysAgoISO(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString()
}

async function fetchOrdersForStatus(params: {
  storeUrl: string
  status: string
  afterISO: string
  maxPages?: number
}) {
  const { storeUrl, status, afterISO, maxPages = 50 } = params
  const authHeader = getAuthHeader()
  const allOrders: WooOrder[] = []

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(`${storeUrl}/wp-json/wc/v3/orders`)

    url.searchParams.set('status', status)
    url.searchParams.set('after', afterISO)
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))
    url.searchParams.set('orderby', 'date')
    url.searchParams.set('order', 'desc')

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: authHeader,
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json')
      ? await response.json()
      : await response.text()

    if (!response.ok) {
      throw new Error(
        `Erro ao consultar WooCommerce para status "${status}". HTTP ${response.status}: ${
          typeof payload === 'string'
            ? payload.slice(0, 500)
            : JSON.stringify(payload).slice(0, 500)
        }`
      )
    }

    const pageOrders = Array.isArray(payload) ? payload : []
    allOrders.push(...pageOrders)

    if (pageOrders.length < 100) break
  }

  return allOrders
}

function mapRiskOrder(order: WooOrder) {
  const billing = order.billing || {}
  const shipping = order.shipping || {}

  const billingName = `${billing.first_name || shipping.first_name || ''} ${
    billing.last_name || shipping.last_name || ''
  }`.trim()

  const addressParts = [
    billing.address_1 || shipping.address_1,
    billing.address_2 || shipping.address_2,
    billing.city || shipping.city,
    billing.state || shipping.state,
    billing.postcode || shipping.postcode,
    billing.country || shipping.country,
  ].filter(Boolean)

  return {
    id: Number(order.id),
    number: String(order.number || order.id || ''),
    status: String(order.status || ''),
    total: parseMoney(order.total),
    dateCreated: String(order.date_created || ''),
    billingName,
    billingEmail: String(billing.email || ''),
    billingPhone: String(billing.phone || ''),
    billingAddress: addressParts.join(', '),
  }
}

function buildSkuSummary(orders: WooOrder[]) {
  const skuMap = new Map<
    string,
    {
      product_id: number
      variation_id: number
      sku: string
      name: string
      quantity: number
      subtotal: number
      total: number
      revenue: number
    }
  >()

  let totalItems = 0
  let totalRevenue = 0

  for (const order of orders) {
    totalRevenue += parseMoney(order.total)

    for (const item of order.line_items || []) {
      const rawSku = String(item.sku || '').trim()
      const sku = rawSku || `produto-${item.product_id || item.id || 'sem-sku'}`
      const quantity = Number(item.quantity || 0)
      const subtotal = parseMoney(item.subtotal)
      const total = parseMoney(item.total)
      const revenue = total || subtotal

      if (!sku || quantity <= 0) continue

      totalItems += quantity

      const current = skuMap.get(sku)

      if (!current) {
        skuMap.set(sku, {
          product_id: Number(item.product_id || 0),
          variation_id: Number(item.variation_id || 0),
          sku,
          name: String(item.name || sku),
          quantity,
          subtotal,
          total,
          revenue,
        })
      } else {
        current.quantity += quantity
        current.subtotal += subtotal
        current.total += total
        current.revenue += revenue
      }
    }
  }

  const skuSummary = Array.from(skuMap.values()).sort(
    (a, b) => b.quantity - a.quantity
  )

  return {
    skuSummary,
    skuCount: skuSummary.length,
    totalItems,
    totalRevenue,
  }
}

export async function GET(req: NextRequest) {
  try {
    const storeUrlRaw = process.env.WC_STORE_URL
    const key = process.env.WC_CONSUMER_KEY
    const secret = process.env.WC_CONSUMER_SECRET

    if (!storeUrlRaw || !key || !secret) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Credenciais WooCommerce não configuradas. Configure WC_STORE_URL, WC_CONSUMER_KEY e WC_CONSUMER_SECRET.',
        },
        { status: 500 }
      )
    }

    const storeUrl = cleanStoreUrl(storeUrlRaw)
    const searchParams = req.nextUrl.searchParams

    const includeRiskStatuses =
      searchParams.get('includeRiskStatuses') === 'true' ||
      searchParams.get('mode') === 'security'

    const days = Math.max(
      1,
      Number(
        searchParams.get('days') ||
          searchParams.get('period') ||
          (includeRiskStatuses ? 7 : 90)
      )
    )

    const afterISO = daysAgoISO(days)

    if (includeRiskStatuses) {
      const batches = await Promise.all(
        RISK_STATUSES.map((status) =>
          fetchOrdersForStatus({
            storeUrl,
            status,
            afterISO,
            maxPages: 10,
          })
        )
      )

      const orders = batches.flat()
      const riskOrders = orders.map(mapRiskOrder)

      return NextResponse.json({
        ok: true,
        source: 'WooCommerce',
        mode: 'security',
        period: {
          days,
          after: afterISO,
        },
        filters: {
          includedStatuses: RISK_STATUSES,
        },
        count: orders.length,
        totalRiskValue: riskOrders.reduce(
          (sum, order) => sum + Number(order.total || 0),
          0
        ),
        riskOrders,
      })
    }

    const statusParam = searchParams.get('status')

    const statuses = statusParam
      ? statusParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : DEFAULT_VALID_STATUSES

    const batches = await Promise.all(
      statuses.map((status) =>
        fetchOrdersForStatus({
          storeUrl,
          status,
          afterISO,
          maxPages: 50,
        })
      )
    )

    const orders = batches.flat()
    const skuData = buildSkuSummary(orders)

    return NextResponse.json({
      ok: true,
      source: 'WooCommerce',
      mode: 'demand',
      period: {
        days,
        after: afterISO,
      },
      filters: {
        includedStatuses: statuses,
        excludedStatuses: [
          'pending',
          'cancelled',
          'canceled',
          'on-hold',
          'failed',
          'refunded',
          'checkout-draft',
          'trash',
          'auto-draft',
        ],
      },
      count: orders.length,
      totalRevenue: skuData.totalRevenue,
      totalItems: skuData.totalItems,
      skuCount: skuData.skuCount,
      skuSummary: skuData.skuSummary,
      orders: orders.slice(0, 100).map((order) => ({
        id: order.id,
        status: order.status,
        date_created: order.date_created,
        total: parseMoney(order.total),
        currency: 'BRL',
        items: (order.line_items || []).map((item) => ({
          id: item.id,
          product_id: item.product_id,
          variation_id: item.variation_id,
          sku: item.sku,
          name: item.name,
          quantity: item.quantity,
          subtotal: parseMoney(item.subtotal),
          total: parseMoney(item.total),
        })),
      })),
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Erro ao consultar WooCommerce.',
      },
      { status: 500 }
    )
  }
}