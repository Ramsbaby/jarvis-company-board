export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import { MAP_CACHE_TTL_MS } from '@/lib/cache-config';

/**
 * 라이브러리(library) 브리핑 — 전사 지식 베이스 프론트엔드.
 *
 * 데이터 소스:
 *  1. ~/.jarvis/rag/data — RAG LanceDB 크기 (du -sh)
 *  2. ~/.jarvis/logs/rag-index.log — 최근 인덱싱 이력
 *  3. ~/.claude/projects/.../memory/ — 오너 개인 메모리 파일 목록 + 분류
 *
 * 기록팀(record-lead) = 백엔드 아카이빙, 라이브러리 = 사용자 접근 레이어
 */

const HOME = homedir();
const RAG_DATA_DIR = path.join(HOME, '.jarvis', 'rag', 'data');
const RAG_INDEX_LOG = path.join(HOME, '.jarvis', 'logs', 'rag-index.log');
const MEMORY_DIR = path.join(HOME, '.claude', 'projects', '-Users-ramsbaby-jarvis', 'memory');

interface RichActivity {
  time: string;
  task: string;
  result: string;
  description: string;
  icon: string;
}

interface MemoryFile {
  filename: string;
  mtime: number;
  kindLabel: string;
  sizeBytes: number;
}

function safeExec(cmd: string): string {
  try { return execSync(cmd, { timeout: 3000, encoding: 'utf8' }).trim(); }
  catch { return ''; }
}

function readSafe(p: string): string {
  try { return readFileSync(p, 'utf8'); } catch { return ''; }
}

// ── RAG 크기 ─────────────────────────────────────────────────────────
function getRagSize(): { size: string; ragExists: boolean } {
  if (!existsSync(RAG_DATA_DIR)) return { size: '0', ragExists: false };
  const out = safeExec(`du -sh "${RAG_DATA_DIR}" 2>/dev/null | awk '{print $1}'`);
  return { size: out || '?', ragExists: true };
}

// ── 최근 인덱싱 이력 ──────────────────────────────────────────────────
function getRecentIndexing(limit = 10): RichActivity[] {
  const raw = readSafe(RAG_INDEX_LOG);
  if (!raw) return [];
  const lines = raw.split('\n').filter(Boolean).slice(-limit * 3);
  const activity: RichActivity[] = [];
  const LOG_RE = /^\[?(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2})/;
  for (const line of lines.reverse()) {
    const m = line.match(LOG_RE);
    const time = m ? m[1].split('T')[1]?.slice(0, 5) || m[1].slice(-5) : '';
    const snippet = line.slice(0, 120).replace(/^\[[\d\-:T ]+\]\s*/, '').trim();
    activity.push({
      time,
      task: 'RAG 인덱싱',
      result: 'success',
      description: snippet || '(내용 없음)',
      icon: '📚',
    });
    if (activity.length >= limit) break;
  }
  return activity;
}

// ── 메모리 파일 전체 목록 (카테고리별 분류) ───────────────────────────
function classifyMemoryFile(fname: string): string {
  const lower = fname.toLowerCase();
  if (lower.startsWith('career')) return '커리어';
  if (lower.startsWith('resume') || lower.startsWith('portfolio')) return '이력서';
  if (lower.startsWith('interview')) return '면접';
  if (lower.startsWith('project')) return '프로젝트';
  if (lower.startsWith('feedback')) return '피드백';
  if (lower.startsWith('reference')) return '참조';
  return '기타';
}

function getAllMemoryFiles(): MemoryFile[] {
  try {
    if (!existsSync(MEMORY_DIR)) return [];
    const files = readdirSync(MEMORY_DIR).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
    const entries: MemoryFile[] = files.map(f => {
      try {
        const stat = statSync(path.join(MEMORY_DIR, f));
        return {
          filename: f,
          mtime: stat.mtimeMs,
          kindLabel: classifyMemoryFile(f),
          sizeBytes: stat.size,
        };
      } catch { return null; }
    }).filter((e): e is MemoryFile => e !== null);
    entries.sort((a, b) => b.mtime - a.mtime);
    return entries;
  } catch { return []; }
}

// ── Route Handler ────────────────────────────────────────────────────────────

interface LibraryBriefing {
  type: 'library';
  id: 'library';
  name: string;
  title: string;
  avatar: string;
  emoji: string;
  status: 'GREEN' | 'YELLOW' | 'RED';
  summary: string;
  recentActivity: RichActivity[];
  lastBoardMinutes: string | null;
  boardMinutesFile: string | null;
  stats: { total: number; success: number; failed: number; rate: number };
  libraryData: {
    ragSize: string;
    ragExists: boolean;
    totalMemoryFiles: number;
    memoryByCategory: Record<string, number>;
    recentIndexingCount: number;
  };
  updatedAt: string;
}

let cache: { data: LibraryBriefing; ts: number } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.ts < MAP_CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const ragInfo = getRagSize();
  const indexing = getRecentIndexing(10);
  const memoryFiles = getAllMemoryFiles();

  // 카테고리별 카운트
  const byCategory: Record<string, number> = {};
  for (const m of memoryFiles) {
    byCategory[m.kindLabel] = (byCategory[m.kindLabel] || 0) + 1;
  }

  const summary = `RAG ${ragInfo.size} · 메모리 ${memoryFiles.length}개 (${Object.entries(byCategory).map(([k, v]) => `${k} ${v}`).join(', ')}) · 최근 인덱싱 ${indexing.length}건`;

  const status: 'GREEN' | 'YELLOW' | 'RED' =
    !ragInfo.ragExists || memoryFiles.length === 0 ? 'YELLOW' : 'GREEN';

  // 마크다운 본문 — 카테고리별 메모리 파일 전체 목록
  let bodyMd = '';
  bodyMd += `## 📚 전사 지식 베이스 현황\n\n`;
  bodyMd += `- **RAG LanceDB 크기**: \`${ragInfo.size}\` (${RAG_DATA_DIR})\n`;
  bodyMd += `- **오너 메모리 파일**: 총 ${memoryFiles.length}개\n\n`;

  // 카테고리별 섹션
  const categoryOrder = ['커리어', '면접', '이력서', '프로젝트', '피드백', '참조', '기타'];
  for (const cat of categoryOrder) {
    const inCat = memoryFiles.filter(m => m.kindLabel === cat);
    if (inCat.length === 0) continue;
    bodyMd += `### ${cat} (${inCat.length})\n\n`;
    for (const m of inCat.slice(0, 10)) {
      const date = new Date(m.mtime + 9 * 3600_000);
      const mmdd = `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`;
      bodyMd += `- \`${m.filename}\` — ${mmdd}\n`;
    }
    if (inCat.length > 10) bodyMd += `- *...and ${inCat.length - 10} more*\n`;
    bodyMd += '\n';
  }

  if (indexing.length > 0) {
    bodyMd += `## 📥 최근 인덱싱 이력\n\n`;
    for (const e of indexing.slice(0, 5)) {
      bodyMd += `- ${e.icon} **${e.time}** — ${e.description.slice(0, 100)}\n`;
    }
  }

  const data: LibraryBriefing = {
    type: 'library',
    id: 'library',
    name: '라이브러리',
    title: '전사 지식 베이스 프론트엔드',
    avatar: '📖',
    emoji: '📖',
    status,
    summary,
    recentActivity: indexing,
    lastBoardMinutes: bodyMd,
    boardMinutesFile: null,
    stats: {
      total: memoryFiles.length,
      success: memoryFiles.length,
      failed: 0,
      rate: 100,
    },
    libraryData: {
      ragSize: ragInfo.size,
      ragExists: ragInfo.ragExists,
      totalMemoryFiles: memoryFiles.length,
      memoryByCategory: byCategory,
      recentIndexingCount: indexing.length,
    },
    updatedAt: new Date().toISOString(),
  };

  cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
