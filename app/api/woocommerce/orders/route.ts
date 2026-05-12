import { NextResponse } from "next/server";

type WooItem = {
  id: number;
  name: string;
  sku: string;
  quantity: number;
  total: string;
  subtotal: string;
  price: number;
};

type WooOrder = {
  id: number;
  number: string;
  status: string;
  date_created: string;
  total: string;
  currency: string;
  payment_method_title?: string;
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
  };
  line_items: WooItem[];
};

function getEnv() {
  const storeUrl =
    process.env.WC_STORE_URL ||
    process.env.WC_API_URL ||
    process.env.WOOCOMMERCE_STORE_URL ||
    "";

  const consumerKey =
    process.env.WC_CONSUMER_KEY ||
    process.env.WC_KEY ||
    process.env.WOOCOMMERCE_CONSUMER_KEY ||
    "";

  const consumerSecret =
    process.env.WC_CONSUMER_SECRET ||
    process.env.WC_SECRET ||
    process.env.WOOCOMMERCE_CONSUMER_SECRET ||
    "";

  return {
    storeUrl: storeUrl.replace(/\/$/, ""),
    consumerKey,
    consumerSecret,
  };
}

export async function GET() {
  try {
    const { storeUrl, consumerKey, consumerSecret } = getEnv();

    if (!storeUrl || !consumerKey || !consumerSecret) {
      return NextResponse.json(
        {
          ok: false,
          error: "Credenciais WooCommerce não configuradas.",
          required: [
            "WC_STORE_URL",
            "WC_CONSUMER_KEY",
            "WC_CONSUMER_SECRET",
          ],
        },
        { status: 500 }
      );
    }

    const allOrders: WooOrder[] = [];
    const perPage = 100;
    const maxPages = 1;

    for (let page = 1; page <= maxPages; page++) {
      const url = new URL(`${storeUrl}/wp-json/wc/v3/orders`);

      url.searchParams.set("consumer_key", consumerKey);
      url.searchParams.set("consumer_secret", consumerSecret);
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(page));
      url.searchParams.set("status", "any");
      url.searchParams.set("orderby", "date");
      url.searchParams.set("order", "desc");

      const response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        const details = await response.text();

        return NextResponse.json(
          {
            ok: false,
            error: "Erro ao consultar WooCommerce.",
            status: response.status,
            details,
          },
          { status: response.status }
        );
      }

      const orders = (await response.json()) as WooOrder[];

      if (!Array.isArray(orders) || orders.length === 0) {
        break;
      }

      allOrders.push(...orders);

      if (orders.length < perPage) {
        break;
      }
    }

    const simplifiedOrders = allOrders.map((order) => ({
      id: order.id,
      number: order.number,
      status: order.status,
      date: order.date_created,
      total: Number(order.total || 0),
      currency: order.currency,
      paymentMethod: order.payment_method_title || "",
      customer: `${order.billing?.first_name || ""} ${order.billing?.last_name || ""}`.trim(),
      email: order.billing?.email || "",
      items: order.line_items.map((item) => ({
        id: item.id,
        name: item.name,
        sku: item.sku || "SEM-SKU",
        quantity: Number(item.quantity || 0),
        total: Number(item.total || 0),
        subtotal: Number(item.subtotal || 0),
        price: Number(item.price || 0),
      })),
    }));

    const skuMap = new Map<
      string,
      {
        sku: string;
        name: string;
        quantity: number;
        revenue: number;
        orders: number;
      }
    >();

    for (const order of simplifiedOrders) {
      for (const item of order.items) {
        const sku = item.sku || "SEM-SKU";
        const current =
          skuMap.get(sku) ||
          {
            sku,
            name: item.name,
            quantity: 0,
            revenue: 0,
            orders: 0,
          };

        current.quantity += item.quantity;
        current.revenue += item.total;
        current.orders += 1;

        skuMap.set(sku, current);
      }
    }

    const skuSummary = Array.from(skuMap.values()).sort(
      (a, b) => b.revenue - a.revenue
    );

    const statusSummary = allOrders.reduce<Record<string, number>>(
      (acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      },
      {}
    );

    const revenueTotal = simplifiedOrders.reduce(
      (acc, order) => acc + order.total,
      0
    );

    return NextResponse.json({
      ok: true,
      source: "woocommerce",
      count: simplifiedOrders.length,
      revenueTotal,
      statusSummary,
      skuCount: skuSummary.length,
      orders: simplifiedOrders,
      skuSummary,
      lastSync: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || "Erro desconhecido ao buscar pedidos.",
      },
      { status: 500 }
    );
  }
}