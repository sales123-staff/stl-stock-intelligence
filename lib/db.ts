// lib/db.ts
// Helper único de conexão com o banco Neon.
// Reusado por todos os endpoints da API.

import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não está definida nas variáveis de ambiente');
}

export const sql = neon(process.env.DATABASE_URL);

// Tipos compartilhados entre os endpoints
export type SyncStatus = 'running' | 'success' | 'error';
export type SyncType = 'orders' | 'products' | 'full';
export type TriggerSource = 'manual' | 'cron' | 'first_sync';
// app/api/woocommerce/sync/route.ts
// Endpoint que puxa pedidos e produtos do WooCommerce e grava no banco.
// Sincronização incremental: só pega o que mudou desde a última sync.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/db';

const WC_API_URL = process.env.WC_API_URL!;
const WC_KEY = process.env.WC_CONSUMER_KEY!;
const WC_SECRET = process.env.WC_CONSUMER_SECRET!;

// Autenticação Basic Auth (key:secret em Base64)
const AUTH_HEADER = `Basic ${Buffer.from(`${WC_KEY}:${WC_SECRET}`).toString('base64')}`;

// ─── Helper: chamada autenticada ao WooCommerce ─────────────
async function wcFetch(endpoint: string, params: Record<string, string> = {}) {
  const url = new URL(`${WC_API_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: AUTH_HEADER,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WooCommerce API ${res.status}: ${text.slice(0, 200)}`);
  }

  return {
    data: await res.json(),
    totalPages: Number(res.headers.get('x-wp-totalpages') || 1),
    total: Number(res.headers.get('x-wp-total') || 0),
  };
}

// ─── Sincroniza PRODUTOS ───────────────────────────────────
async function syncProducts(): Promise<number> {
  let page = 1;
  let totalSynced = 0;
  const perPage = 100; // máximo permitido pela API

  while (true) {
    const { data, totalPages } = await wcFetch('/products', {
      page: String(page),
      per_page: String(perPage),
      status: 'publish',
    });

    for (const p of data) {
      await sql`
        INSERT INTO products (
          id, sku, name, status, type, price, regular_price, sale_price,
          stock_quantity, stock_status, manage_stock,
          date_created, date_modified, synced_at
        ) VALUES (
          ${p.id}, ${p.sku || null}, ${p.name}, ${p.status}, ${p.type},
          ${p.price ? Number(p.price) : null},
          ${p.regular_price ? Number(p.regular_price) : null},
          ${p.sale_price ? Number(p.sale_price) : null},
          ${p.stock_quantity}, ${p.stock_status}, ${p.manage_stock},
          ${p.date_created}, ${p.date_modified}, NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          sku = EXCLUDED.sku,
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          price = EXCLUDED.price,
          regular_price = EXCLUDED.regular_price,
          sale_price = EXCLUDED.sale_price,
          stock_quantity = EXCLUDED.stock_quantity,
          stock_status = EXCLUDED.stock_status,
          date_modified = EXCLUDED.date_modified,
          synced_at = NOW()
      `;
      totalSynced++;
    }

    if (page >= totalPages) break;
    page++;
  }

  return totalSynced;
}

// ─── Sincroniza PEDIDOS ────────────────────────────────────
async function syncOrders(sinceDate?: string): Promise<number> {
  let page = 1;
  let totalSynced = 0;
  const perPage = 100;

  // Se for primeira sync, pega últimos 60 dias.
  // Se for incremental, pega só desde a última sync.
  const after = sinceDate || new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

  while (true) {
    const { data, totalPages } = await wcFetch('/orders', {
      page: String(page),
      per_page: String(perPage),
      after,
      orderby: 'date',
      order: 'asc',
    });

    for (const o of data) {
      // Insere/atualiza o cabeçalho do pedido
      await sql`
        INSERT INTO orders (
          id, number, status, currency, date_created, date_modified,
          date_completed, date_paid, total, total_tax, shipping_total,
          discount_total, customer_id, customer_email,
          payment_method, payment_method_title, synced_at
        ) VALUES (
          ${o.id}, ${o.number}, ${o.status}, ${o.currency},
          ${o.date_created}, ${o.date_modified},
          ${o.date_completed || null}, ${o.date_paid || null},
          ${Number(o.total || 0)}, ${Number(o.total_tax || 0)},
          ${Number(o.shipping_total || 0)}, ${Number(o.discount_total || 0)},
          ${o.customer_id || null}, ${o.billing?.email || null},
          ${o.payment_method || null}, ${o.payment_method_title || null},
          NOW()
        )
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          date_modified = EXCLUDED.date_modified,
          date_completed = EXCLUDED.date_completed,
          date_paid = EXCLUDED.date_paid,
          total = EXCLUDED.total,
          synced_at = NOW()
      `;

      // Apaga itens antigos desse pedido (caso tenha mudado)
      await sql`DELETE FROM order_items WHERE order_id = ${o.id}`;

      // Insere itens atuais
      for (const item of o.line_items || []) {
        await sql`
          INSERT INTO order_items (
            order_id, product_id, variation_id, sku, name,
            quantity, subtotal, total, total_tax, price, synced_at
          ) VALUES (
            ${o.id}, ${item.product_id || null}, ${item.variation_id || null},
            ${item.sku || null}, ${item.name || null},
            ${item.quantity || 0},
            ${Number(item.subtotal || 0)}, ${Number(item.total || 0)},
            ${Number(item.total_tax || 0)}, ${Number(item.price || 0)},
            NOW()
          )
        `;
      }

      totalSynced++;
    }

    if (page >= totalPages) break;
    page++;
  }

  return totalSynced;
}

// ─── Handler principal: POST /api/woocommerce/sync ─────────
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const type = (url.searchParams.get('type') || 'full') as 'orders' | 'products' | 'full';
  const trigger = (url.searchParams.get('trigger') || 'manual') as 'manual' | 'cron' | 'first_sync';

  // Cria registro no sync_log
  const logResult = await sql`
    INSERT INTO sync_log (sync_type, status, trigger_source)
    VALUES (${type}, 'running', ${trigger})
    RETURNING id
  ` as { id: number }[];
  const logId = logResult[0].id;

  try {
    let productsSynced = 0;
    let ordersSynced = 0;

    // Define a data de corte (última sync bem-sucedida)
    let lastSyncDate: string | undefined;
    if (trigger !== 'first_sync') {
      const lastSync = await sql`
        SELECT finished_at FROM sync_log
        WHERE status = 'success' AND sync_type IN ('orders', 'full')
        ORDER BY finished_at DESC LIMIT 1
      ` as { finished_at: string }[];
      if (lastSync.length > 0) {
        lastSyncDate = new Date(lastSync[0].finished_at).toISOString();
      }
    }

    if (type === 'products' || type === 'full') {
      productsSynced = await syncProducts();
    }
    if (type === 'orders' || type === 'full') {
      ordersSynced = await syncOrders(lastSyncDate);
    }

    const totalSynced = productsSynced + ordersSynced;

    await sql`
      UPDATE sync_log
      SET status = 'success', finished_at = NOW(), items_synced = ${totalSynced}
      WHERE id = ${logId}
    `;

    return NextResponse.json({
      success: true,
      type,
      trigger,
      products_synced: productsSynced,
      orders_synced: ordersSynced,
      total_synced: totalSynced,
      since: lastSyncDate || 'last 60 days',
    });
  } catch (err: any) {
    await sql`
      UPDATE sync_log
      SET status = 'error', finished_at = NOW(), error_message = ${err.message}
      WHERE id = ${logId}
    `;
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}

// GET para checar status da última sync
export async function GET() {
  const last = await sql`
    SELECT * FROM sync_log ORDER BY started_at DESC LIMIT 5
  `;
  return NextResponse.json({ last_syncs: last });
}