import { promises as fs } from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface CostRecord {
  ts: number;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

interface Store {
  records: CostRecord[];
}

const MAX_RECORDS = 10_000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// USD per million tokens
const RATES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-5': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 0.8, output: 4 },
  'claude-opus-4-5': { input: 15, output: 75 },
};

function resolveRate(model: string): { input: number; output: number } {
  if (RATES[model]) return RATES[model];
  // Loose match — sonnet / haiku / opus family
  const lower = model.toLowerCase();
  if (lower.includes('haiku')) return RATES['claude-haiku-4-5'];
  if (lower.includes('sonnet')) return RATES['claude-sonnet-4-5'];
  return RATES['claude-opus-4-5'];
}

function storePath(): string {
  const home = os.homedir();
  return path.join(home, '.jarvis', 'state', 'game-chat-cost.json');
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(storePath(), 'utf8');
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || !Array.isArray(parsed.records)) return { records: [] };
    return parsed;
  } catch {
    return { records: [] };
  }
}

async function writeStore(store: Store): Promise<void> {
  const p = storePath();
  await fs.mkdir(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store), 'utf8');
  await fs.rename(tmp, p);
}

export function computeCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rate = resolveRate(model);
  return (inputTokens * rate.input + outputTokens * rate.output) / 1_000_000;
}

export async function recordCost(
  r: Omit<CostRecord, 'ts' | 'costUsd'>,
): Promise<void> {
  const store = await readStore();
  const costUsd = computeCostUsd(r.model, r.inputTokens, r.outputTokens);
  const record: CostRecord = {
    ts: Date.now(),
    model: r.model,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd,
  };
  store.records.push(record);
  if (store.records.length > MAX_RECORDS) {
    store.records = store.records.slice(store.records.length - MAX_RECORDS);
  }
  await writeStore(store);
}

function kstDayStartMs(now: number): number {
  // Start of KST day expressed as unix ms
  const kstNow = now + KST_OFFSET_MS;
  const dayStartKst = Math.floor(kstNow / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);
  return dayStartKst - KST_OFFSET_MS;
}

function kstMonthStartMs(now: number): number {
  const kstNow = new Date(now + KST_OFFSET_MS);
  const year = kstNow.getUTCFullYear();
  const month = kstNow.getUTCMonth();
  // First day of the month at 00:00 KST, expressed as unix ms
  const monthStartKstUtc = Date.UTC(year, month, 1, 0, 0, 0, 0);
  return monthStartKstUtc - KST_OFFSET_MS;
}

export async function getTodayCost(): Promise<number> {
  const store = await readStore();
  const cutoff = kstDayStartMs(Date.now());
  let sum = 0;
  for (const r of store.records) {
    if (r.ts >= cutoff) sum += r.costUsd;
  }
  return sum;
}

export async function getMonthCost(): Promise<number> {
  const store = await readStore();
  const cutoff = kstMonthStartMs(Date.now());
  let sum = 0;
  for (const r of store.records) {
    if (r.ts >= cutoff) sum += r.costUsd;
  }
  return sum;
}

export async function getDailyCap(): Promise<number> {
  const raw = process.env.JARVIS_MAP_DAILY_CAP_USD;
  if (raw) {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 2;
}
