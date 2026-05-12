// app/api/cron/sync-hourly/route.ts
// Endpoint chamado automaticamente pela Vercel a cada hora.
// Protegido por CRON_SECRET para impedir chamadas externas.

import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Verifica autorização do cron
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Chama o endpoint de sync com type=full
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'http://localhost:3000';

  const res = await fetch(`${baseUrl}/api/woocommerce/sync?type=full&trigger=cron`, {
    method: 'POST',
  });

  const result = await res.json();
  return NextResponse.json(result);
}
