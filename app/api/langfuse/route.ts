export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { getRequestAuth } from '@/lib/guest-guard';
import type { NextRequest } from 'next/server';

const LANGFUSE_BASE_URL = process.env.LANGFUSE_BASE_URL || 'http://localhost:3200';
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY || '';
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY || '';

function authHeader() {
  const creds = Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString('base64');
  return `Basic ${creds}`;
}

function daysAgoIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

async function fetchGenerations(fromIso: string) {
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) return [];
  try {
    const res = await fetch(
      `${LANGFUSE_BASE_URL}/api/public/generations?limit=500&fromStartTime=${fromIso}`,
      { headers: { Authorization: authHeader() }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data ?? []) as Record<string, unknown>[];
  } catch {
    return [];
  }
}

function summarise(gens: Record<string, unknown>[]) {
  const total = gens.length;
  const errors = gens.filter(g => g.level === 'ERROR').length;
  const inputTokens = gens.reduce((s, g) => {
    const u = g.usage as Record<string, number> | null;
    return s + (u?.input ?? 0);
  }, 0);
  const outputTokens = gens.reduce((s, g) => {
    const u = g.usage as Record<string, number> | null;
    return s + (u?.output ?? 0);
  }, 0);
  const cost = gens.reduce((s, g) => {
    const m = g.metadata as Record<string, unknown> | null;
    return s + parseFloat(String(m?.cost_usd ?? 0));
  }, 0);

  const durations = gens
    .map(g => {
      const m = g.metadata as Record<string, unknown> | null;
      return parseFloat(String(m?.duration_ms ?? 0));
    })
    .filter(d => d > 0)
    .sort((a, b) => a - b);

  const avgDurMs = durations.length
    ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
    : 0;
  const p95DurMs = durations.length
    ? Math.round(durations[Math.floor(durations.length * 0.95)] ?? 0)
    : 0;

  const modelMap: Record<string, number> = {};
  for (const g of gens) {
    const m = String(g.model ?? 'unknown').split('-')[0];
    modelMap[m] = (modelMap[m] ?? 0) + 1;
  }
  const topModels = Object.entries(modelMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([model, count]) => ({ model, count }));

  // Daily breakdown for chart (last 7 days)
  const dailyMap: Record<string, { calls: number; errors: number; cost: number }> = {};
  for (const g of gens) {
    const day = String(g.startTime ?? '').slice(0, 10);
    if (!day || day.length < 10) continue;
    if (!dailyMap[day]) dailyMap[day] = { calls: 0, errors: 0, cost: 0 };
    dailyMap[day].calls++;
    if (g.level === 'ERROR') dailyMap[day].errors++;
    const m = g.metadata as Record<string, unknown> | null;
    dailyMap[day].cost += parseFloat(String(m?.cost_usd ?? 0));
  }
  const daily = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, ...v, cost: Math.round(v.cost * 10000) / 10000 }));

  return {
    total,
    errors,
    errorRate: total ? Math.round((errors / total) * 1000) / 10 : 0,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost: Math.round(cost * 10000) / 10000,
    avgDurMs,
    p95DurMs,
    topModels,
    daily,
  };
}

export async function GET(req: NextRequest) {
  const auth = getRequestAuth(req);
  if (!auth.isOwner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const configured = !!(LANGFUSE_PUBLIC_KEY && LANGFUSE_SECRET_KEY);

  if (!configured) {
    return NextResponse.json({ configured: false });
  }

  // Check Langfuse health
  let healthy = false;
  try {
    const h = await fetch(`${LANGFUSE_BASE_URL}/api/public/health`, {
      headers: { Authorization: authHeader() },
      signal: AbortSignal.timeout(3000),
    });
    healthy = h.ok;
  } catch { /* offline */ }

  if (!healthy) {
    return NextResponse.json({ configured: true, healthy: false, url: LANGFUSE_BASE_URL });
  }

  const [gens7, gens1] = await Promise.all([
    fetchGenerations(daysAgoIso(7)),
    fetchGenerations(daysAgoIso(1)),
  ]);

  return NextResponse.json({
    configured: true,
    healthy: true,
    url: LANGFUSE_BASE_URL,
    week: summarise(gens7),
    today: summarise(gens1),
    ts: new Date().toISOString(),
  });
}
