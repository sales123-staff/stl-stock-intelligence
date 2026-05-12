// app/api/woocommerce/products/route.ts
// Endpoint que o frontend chama pra ler produtos cacheados.

import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';

export async function GET() {
  try {
    const products = await sql`
      SELECT
        id, sku, name, status, type,
        price, regular_price, sale_price,
        stock_quantity, stock_status, manage_stock,
        date_created, date_modified, synced_at
      FROM products
      WHERE status = 'publish'
      ORDER BY name
    `;

    return NextResponse.json({
      success: true,
      count: products.length,
      products,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}