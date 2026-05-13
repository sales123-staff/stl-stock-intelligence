import { NextResponse } from "next/server";

type WooOrder = {
  id: number;
  status: string;
  date_created: string;
  total: string;
  currency?: string;
  line_items?: Array<{
    id: number;
    name: string;
    product_id: number;
    variation_id: number;
    quantity: number;
    subtotal: string;
    total: string;
    sku?: string;
  }>;
};

type NormalizedOrder = {
  id: number;
  status: string;
  date_created: string;
  total: number;
  currency: string;
  items: Array<{
    id: number;
    product_id: number;
    variation_id: number;
    sku: string;
    name: string;
    quantity: number;
    subtotal: number;
    total: number;
  }>;
};

function getRequiredEnv() {
  const storeUrl = process.env.WC_STORE_URL;
  const consumerKey = process.env.WC_CONSUMER_KEY;
  const consumerSecret = process.env.WC_CONSUMER_SECRET;

  if (!storeUrl || !consumerKey || !consumerSecret) {
    return {
      ok: false as const,
      error: "Credenciais WooCommerce não configuradas.",
      required: ["WC_STORE_URL", "WC_CONSUMER_KEY", "WC_CONSUMER_SECRET"],
    };
  }

  return {
    ok: true as const,
    storeUrl,
    consumerKey,
    consumerSecret,
  };
}

function getDateMonthsAgo(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString();
}

function normalizeOrder(order: WooOrder): NormalizedOrder {
  return {
    id: order.id,
    status: order.status,
    date_created: order.date_created,
    total: Number(order.total || 0),
    currency: order.currency || "BRL",
    items:
      order.line_items?.map((item) => ({
        id: item.id,
        product_id: item.product_id,
        variation_id: item.variation_id,
        sku: item.sku || "",
        name: item.name,
        quantity: Number(item.quantity || 0),
        subtotal: Number(item.subtotal || 0),
        total: Number(item.total || 0),
      })) || [],
  };
}

function buildSkuSummary(orders: NormalizedOrder[]) {
  const map = new Map<
    string,
    {
      sku: string;
      name: string;
      quantity: number;
      revenue: number;
      orders: number;
      lastOrderDate: string;
    }
  >();

  for (const order of orders) {
    for (const item of order.items) {
      const sku = item.sku || `product_${item.product_id}`;

      const current = map.get(sku);

      if (!current) {
        map.set(sku, {
          sku,
          name: item.name,
          quantity: item.quantity,
          revenue: item.total,
          orders: 1,
          lastOrderDate: order.date_created,
        });
      } else {
        current.quantity += item.quantity;
        current.revenue += item.total;
        current.orders += 1;

        if (new Date(order.date_created) > new Date(current.lastOrderDate)) {
          current.lastOrderDate = order.date_created;
        }
      }
    }
  }

  return Array.from(map.values()).sort((a, b) => b.quantity - a.quantity);
}

async function fetchOrdersByStatus(params: {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
  status: string;
  after: string;
}) {
  const cleanStoreUrl = params.storeUrl.replace(/\/$/, "");
  const perPage = 100;
  const maxPages = 30;

  const allOrders: WooOrder[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(`${cleanStoreUrl}/wp-json/wc/v3/orders`);

    url.searchParams.set("consumer_key", params.consumerKey);
    url.searchParams.set("consumer_secret", params.consumerSecret);
    url.searchParams.set("status", params.status);
    url.searchParams.set("after", params.after);
    url.searchParams.set("per_page", String(perPage));
    url.searchParams.set("page", String(page));
    url.searchParams.set("orderby", "date");
    url.searchParams.set("order", "desc");

    const response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await response.text();

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(
        `WooCommerce não retornou JSON válido para status "${params.status}". Status HTTP: ${response.status}`
      );
    }

    if (!response.ok) {
      throw new Error(
        `Erro ao consultar WooCommerce para status "${params.status}". HTTP ${response.status}: ${JSON.stringify(json)}`
      );
    }

    if (!Array.isArray(json) || json.length === 0) {
      break;
    }

    allOrders.push(...json);

    if (json.length < perPage) {
      break;
    }
  }

  return allOrders;
}

export async function GET() {
  try {
    const env = getRequiredEnv();

    if (!env.ok) {
      return NextResponse.json(env, { status: 500 });
    }

    const after = getDateMonthsAgo(3);

    /*
      Status aceitos:
      - processing = processando
      - shipped-out = enviado

      Status ignorados:
      - pending = aguardando pagamento
      - cancelled/canceled = cancelado
      - on-hold = em espera
      - failed = falhou
      - refunded = reembolsado
      - checkout-draft = rascunho
    */
    const allowedStatuses = ["processing", "shipped-out"];

    const blockedStatuses = new Set([
      "pending",
      "cancelled",
      "canceled",
      "on-hold",
      "failed",
      "refunded",
      "checkout-draft",
      "trash",
      "auto-draft",
    ]);

    const results = await Promise.all(
      allowedStatuses.map((status) =>
        fetchOrdersByStatus({
          storeUrl: env.storeUrl,
          consumerKey: env.consumerKey,
          consumerSecret: env.consumerSecret,
          status,
          after,
        })
      )
    );

    const rawOrders = results.flat();

    const orders = rawOrders
      .filter((order) => allowedStatuses.includes(order.status))
      .filter((order) => !blockedStatuses.has(order.status))
      .map(normalizeOrder);

    const skuSummary = buildSkuSummary(orders);

    const totalRevenue = orders.reduce((acc, order) => acc + order.total, 0);
    const totalItems = skuSummary.reduce((acc, sku) => acc + sku.quantity, 0);

    return NextResponse.json({
      ok: true,
      source: "WooCommerce",
      period: {
        months: 3,
        after,
      },
      filters: {
        includedStatuses: allowedStatuses,
        excludedStatuses: Array.from(blockedStatuses),
      },
      count: orders.length,
      totalRevenue,
      totalItems,
      skuCount: skuSummary.length,
      orders: orders.slice(0, 100),
      skuSummary,
      syncedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro ao consultar WooCommerce.",
      },
      { status: 500 }
    );
  }
}