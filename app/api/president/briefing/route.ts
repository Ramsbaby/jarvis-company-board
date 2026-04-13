export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { MAP_CACHE_TTL_MS } from '@/lib/cache-config';

/**
 * 오너 집무실(president) 브리핑 — 이정우(실인) 전용 개인 공간.
 *
 * ⚠️ 주의: 이전 버전에서 ~/.jarvis/results/personal-schedule-daily/*.md 를 사용했는데,
 * 이건 preply-today.sh가 **보람이 채널**용으로 호출하는 Preply 수업 데이터였음.
 * 오너(이정우)는 개발자라 Preply 강사 아님 → 데이터 소스 오판. 제거하고 아래 소스로 교체.
 *
 * 진짜 오너 데이터 소스:
 *  1. ~/.jarvis/state/commitments.jsonl — 오너 Discord 대화에서 자동 추출한 약속 트래킹
 *     (userId: 364093757018079234)
 *  2. ~/.claude/sessions/*.json — 오늘 Claude Code 세션 활동 (세션 수 + 최근 프로젝트)
 *  3. ~/.claude/projects/.../memory/*.md — 오너 개인 메모리 (career/interview/project)
 *     최근 수정된 상위 5개 파일 목록
 */

const HOME = homedir();
const COMMITMENTS_FILE = path.join(HOME, '.jarvis', 'state', 'commitments.jsonl');
const CLAUDE_SESSIONS_DIR = path.join(HOME, '.claude', 'sessions');
const CLAUDE_MEMORY_DIR = path.join(HOME, '.claude', 'projects', '-Users-ramsbaby-jarvis', 'memory');

const OWNER_USER_ID = '364093757018079234';

interface Commitment {
  id: string;
  status: string;
  text: string;
  created_at: string;
  source?: string;
  userId?: string;
  resolved_at?: string;
}

interface RichActivity {
  time: string;
  task: string;
  result: string;
  description: string;
  icon: string;
}

// ── commitments.jsonl: 오너 약속 트래커 ───────────────────────────────
function getCommitments(): {
  totalOpen: number;
  totalDone: number;
  recentOpen: Commitment[];
  recentDone: Commitment[];
} {
  try {
    if (!existsSync(COMMITMENTS_FILE)) return { totalOpen: 0, totalDone: 0, recentOpen: [], recentDone: [] };
    const raw = readFileSync(COMMITMENTS_FILE, 'utf8');
    const all: Commitment[] = [];
    for (const line of raw.split('\n').filter(Boolean)) {
      try {
        const c = JSON.parse(line) as Commitment;
        // 오너 것만 (다른 userId가 섞여있을 수 있음 — 방어적 필터)
        if (c.userId && c.userId !== OWNER_USER_ID) continue;
        all.push(c);
      } catch { /* skip */ }
    }
    const open = all.filter(c => c.status === 'open');
    const done = all.filter(c => c.status === 'done');
    open.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    done.sort((a, b) => (b.resolved_at || b.created_at || '').localeCompare(a.resolved_at || a.created_at || ''));
    return {
      totalOpen: open.length,
      totalDone: done.length,
      recentOpen: open.slice(0, 5),
      recentDone: done.slice(0, 5),
    };
  } catch { return { totalOpen: 0, totalDone: 0, recentOpen: [], recentDone: [] }; }
}

// ── Claude Code 오늘 세션 활동 ────────────────────────────────────────
function getClaudeSessionsToday(): { count: number; latestHourMin: string | null } {
  try {
    if (!existsSync(CLAUDE_SESSIONS_DIR)) return { count: 0, latestHourMin: null };
    const files = readdirSync(CLAUDE_SESSIONS_DIR).filter(f => f.endsWith('.json'));
    const KST_OFFSET = 9 * 3600_000;
    const nowKst = new Date(Date.now() + KST_OFFSET);
    const todayKstStr = `${nowKst.getUTCFullYear()}-${String(nowKst.getUTCMonth() + 1).padStart(2, '0')}-${String(nowKst.getUTCDate()).padStart(2, '0')}`;
    let count = 0;
    let latestMs = 0;
    for (const f of files) {
      const fp = path.join(CLAUDE_SESSIONS_DIR, f);
      try {
        const stat = statSync(fp);
        const mtimeKst = new Date(stat.mtimeMs + KST_OFFSET);
        const kstDateStr = `${mtimeKst.getUTCFullYear()}-${String(mtimeKst.getUTCMonth() + 1).padStart(2, '0')}-${String(mtimeKst.getUTCDate()).padStart(2, '0')}`;
        if (kstDateStr === todayKstStr) {
          count++;
          if (stat.mtimeMs > latestMs) latestMs = stat.mtimeMs;
        }
      } catch { /* skip */ }
    }
    let latestHourMin: string | null = null;
    if (latestMs > 0) {
      const latestKst = new Date(latestMs + KST_OFFSET);
      latestHourMin = `${String(latestKst.getUTCHours()).padStart(2, '0')}:${String(latestKst.getUTCMinutes()).padStart(2, '0')}`;
    }
    return { count, latestHourMin };
  } catch { return { count: 0, latestHourMin: null }; }
}

// ── 최근 수정된 오너 메모리 파일 상위 5개 ──────────────────────────────
interface MemoryFile {
  filename: string;
  mtime: number;
  kindLabel: string;   // 'career' | 'interview' | 'project' | ...
}

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

function getRecentMemoryFiles(): MemoryFile[] {
  try {
    if (!existsSync(CLAUDE_MEMORY_DIR)) return [];
    const files = readdirSync(CLAUDE_MEMORY_DIR).filter(f => f.endsWith('.md') && f !== 'MEMORY.md');
    const entries: MemoryFile[] = files.map(f => {
      try {
        const stat = statSync(path.join(CLAUDE_MEMORY_DIR, f));
        return { filename: f, mtime: stat.mtimeMs, kindLabel: classifyMemoryFile(f) };
      } catch { return null; }
    }).filter((e): e is MemoryFile => e !== null);
    entries.sort((a, b) => b.mtime - a.mtime);
    return entries.slice(0, 5);
  } catch { return []; }
}

// ── Route Handler ────────────────────────────────────────────────────────────

interface OwnerBriefing {
  type: 'owner';
  id: 'president';
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
  ownerData: {
    openCommitments: number;
    doneCommitments: number;
    recentOpenCommitments: Array<{ text: string; createdAt: string; source?: string }>;
    claudeSessionsToday: number;
    claudeLastSessionKst: string | null;
    recentMemoryFiles: MemoryFile[];
  };
  updatedAt: string;
}

let cache: { data: OwnerBriefing; ts: number } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.ts < MAP_CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const commitments = getCommitments();
  const sessions = getClaudeSessionsToday();
  const memoryFiles = getRecentMemoryFiles();

  // recentActivity: commitments + memory updates + claude sessions 혼합 타임라인
  const activity: RichActivity[] = [];

  // 1. 최근 완료된 commitment (최근 3건)
  for (const c of commitments.recentDone.slice(0, 3)) {
    const ts = c.resolved_at || c.created_at;
    const timeMatch = ts.match(/T(\d{2}:\d{2})/);
    activity.push({
      time: timeMatch ? timeMatch[1] : '',
      task: '약속 완료',
      result: 'success',
      description: c.text.slice(0, 100),
      icon: '✅',
    });
  }

  // 2. 최근 수정된 메모리 파일
  for (const m of memoryFiles.slice(0, 3)) {
    const date = new Date(m.mtime + 9 * 3600_000);
    const hhmm = `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
    activity.push({
      time: hhmm,
      task: `${m.kindLabel} 메모리 업데이트`,
      result: 'success',
      description: m.filename.replace('.md', ''),
      icon: '📝',
    });
  }

  // Summary
  let summary: string;
  if (commitments.totalOpen === 0) {
    summary = sessions.count > 0
      ? `오늘 Claude Code 세션 ${sessions.count}회 · 미해결 약속 0건 · 최근 메모리 ${memoryFiles.length}개`
      : '미해결 약속 없음. 오늘 아직 Claude Code 세션 기록 없음.';
  } else {
    summary = `미해결 약속 ${commitments.totalOpen}건 · 오늘 세션 ${sessions.count}회`;
  }

  // Status: 미해결 약속 기반
  const status: 'GREEN' | 'YELLOW' | 'RED' =
    commitments.totalOpen >= 10 ? 'RED'
    : commitments.totalOpen >= 3 ? 'YELLOW'
    : 'GREEN';

  // lastBoardMinutes 자리에 최근 메모리 파일 summary
  let memorySummary = '';
  if (memoryFiles.length > 0) {
    memorySummary = `## 📝 최근 업데이트된 오너 메모리\n\n`;
    for (const m of memoryFiles) {
      const date = new Date(m.mtime + 9 * 3600_000);
      const mmdd = `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`;
      memorySummary += `- **${m.kindLabel}** · \`${m.filename}\` — ${mmdd} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}\n`;
    }
    memorySummary += `\n*출처: \`~/.claude/projects/-Users-ramsbaby-jarvis/memory/\`*\n`;
  }
  if (commitments.totalOpen > 0) {
    memorySummary += `\n## ⚠️ 미해결 Discord 약속 ${commitments.totalOpen}건\n\n`;
    for (const c of commitments.recentOpen) {
      memorySummary += `- ${c.text.slice(0, 200)}\n`;
    }
  }

  const data: OwnerBriefing = {
    type: 'owner',
    id: 'president',
    name: '오너 집무실',
    title: '이정우(대표) 개인 공간',
    avatar: '🏛️',
    emoji: '🏛️',
    status,
    summary,
    recentActivity: activity,
    lastBoardMinutes: memorySummary || null,
    boardMinutesFile: null,
    stats: {
      total: sessions.count + commitments.totalOpen,
      success: sessions.count,
      failed: commitments.totalOpen,
      rate: commitments.totalOpen === 0 ? 100 : Math.max(0, 100 - commitments.totalOpen * 10),
    },
    ownerData: {
      openCommitments: commitments.totalOpen,
      doneCommitments: commitments.totalDone,
      recentOpenCommitments: commitments.recentOpen.map(c => ({
        text: c.text,
        createdAt: c.created_at,
        source: c.source,
      })),
      claudeSessionsToday: sessions.count,
      claudeLastSessionKst: sessions.latestHourMin,
      recentMemoryFiles: memoryFiles,
    },
    updatedAt: new Date().toISOString(),
  };

  cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
