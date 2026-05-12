// app/api/woocommerce/orders/route.ts
// Endpoint que devolve pedidos com seus itens.
// Aceita ?days=30 para limitar o período.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const days = Number(url.searchParams.get('days') || '30');
    const status = url.searchParams.get('status'); // opcional: filtrar por status

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Busca pedidos
    const orders = status
      ? await sql`
          SELECT * FROM orders
          WHERE date_created >= ${since} AND status = ${status}
          ORDER BY date_created DESC
        `
      : await sql`
          SELECT * FROM orders
          WHERE date_created >= ${since}
          ORDER BY date_created DESC
        `;

    // Agrupa itens por SKU para gerar consumo
    const itemsBySku = await sql`
      SELECT
        oi.sku,
        SUM(oi.quantity) AS total_quantity,
        SUM(oi.total) AS total_revenue,
        COUNT(DISTINCT oi.order_id) AS order_count
      FROM order_items oi
      INNER JOIN orders o ON o.id = oi.order_id
      WHERE o.date_created >= ${since}
        AND o.status IN ('completed', 'processing', 'em-separacao', 'shipped-out')
        AND oi.sku IS NOT NULL
      GROUP BY oi.sku
      ORDER BY total_quantity DESC
    `;

    return NextResponse.json({
      success: true,
      period_days: days,
      orders_count: orders.length,
      orders,
      consumption_by_sku: itemsBySku,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}