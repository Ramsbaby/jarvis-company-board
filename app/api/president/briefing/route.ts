export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { MAP_CACHE_TTL_MS } from '@/lib/cache-config';

/**
 * 대표실(president) 브리핑 — 이정우(실인)의 통합 공간.
 * 구 CEO실(AI 경영) + 오너 집무실(개인 데이터)을 하나로 흡수.
 *
 * 데이터 소스 (4종):
 *  1. AI 경영 크론 — cron.log에서 board-meeting, council-insight, ceo-daily-digest 추출
 *  2. ~/.jarvis/state/commitments.jsonl — 오너 Discord 대화 자동 추출 약속 (userId 필터)
 *  3. ~/.claude/sessions/*.json — 오늘 Claude Code 세션 활동
 *  4. ~/.claude/projects/.../memory/*.md — 오너 개인 메모리 파일 최근 수정 5개
 */

const HOME = homedir();
const COMMITMENTS_FILE = path.join(HOME, '.jarvis', 'state', 'commitments.jsonl');
const CLAUDE_SESSIONS_DIR = path.join(HOME, '.claude', 'sessions');
const CLAUDE_MEMORY_DIR = path.join(HOME, '.claude', 'projects', '-Users-ramsbaby-jarvis', 'memory');
const CRON_LOG = path.join(HOME, '.jarvis', 'logs', 'cron.log');

const OWNER_USER_ID = '364093757018079234';

// AI 경영 크론 키워드 (구 CEO실이 보던 것)
const AI_EXEC_KEYWORDS = ['board-meeting', 'ceo-daily-digest', 'council', 'monthly-review'];

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

// ── AI 경영 크론 (board-meeting / council-insight / ceo-daily-digest / monthly-review) ──
interface ExecCronEntry {
  time: string;        // "HH:MM"
  task: string;
  result: 'success' | 'failed' | 'skipped' | 'running';
  description: string;
  icon: string;
}

function getAiExecCrons(limit = 5): { entries: ExecCronEntry[]; successCount: number; failedCount: number } {
  try {
    const raw = readFileSync(CRON_LOG, 'utf8');
    const lines = raw.split('\n').filter(Boolean).slice(-3000);
    const LOG_RE = /^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] \[([^\]]+)\] (.+)$/;
    const entries: ExecCronEntry[] = [];
    let successCount = 0, failedCount = 0;
    for (const line of lines) {
      const m = line.match(LOG_RE);
      if (!m) continue;
      const [, ts, task, msg] = m;
      if (/^task_\d+_/.test(task)) continue;
      const lower = task.toLowerCase();
      if (!AI_EXEC_KEYWORDS.some(kw => lower.includes(kw))) continue;

      let result: ExecCronEntry['result'] | null = null;
      if (/\bSUCCESS\b|\bDONE\b/.test(line)) { result = 'success'; successCount++; }
      else if (/FAILED|ERROR|CRITICAL/.test(line)) { result = 'failed'; failedCount++; }
      else if (/\bSKIPPED\b/.test(line)) result = 'skipped';
      else if (/\bSTARTED?\b|\bRUNNING\b/.test(line)) result = 'running';
      if (!result) continue;

      const timeOnly = ts.split(' ')[1]?.slice(0, 5) || '';
      const icon = result === 'success' ? '💚' : result === 'failed' ? '🔴' : result === 'skipped' ? '⏭️' : '🔄';
      const desc =
        result === 'success' ? `${task} 완료` :
        result === 'failed' ? `${task} 실패 — ${msg.slice(0, 60)}` :
        result === 'skipped' ? `${task} 건너뜀` :
        `${task} 진행중`;
      entries.push({ time: timeOnly, task, result, description: desc, icon });
    }
    entries.reverse(); // 최신순
    return { entries: entries.slice(0, limit), successCount, failedCount };
  } catch {
    return { entries: [], successCount: 0, failedCount: 0 };
  }
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

interface PresidentBriefing {
  type: 'president';
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
    aiExecCrons: { successCount: number; failedCount: number; recent: ExecCronEntry[] };
  };
  updatedAt: string;
}

let cache: { data: PresidentBriefing; ts: number } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.ts < MAP_CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const commitments = getCommitments();
  const sessions = getClaudeSessionsToday();
  const memoryFiles = getRecentMemoryFiles();
  const aiExec = getAiExecCrons(5);

  // recentActivity: AI 경영 크론 + commitments + memory updates 혼합 타임라인
  const activity: RichActivity[] = [];

  // 1. AI 경영 크론 최근 3건 (가장 최근 순서대로)
  for (const e of aiExec.entries.slice(0, 3)) {
    activity.push({
      time: e.time,
      task: e.task,
      result: e.result,
      description: e.description,
      icon: e.icon,
    });
  }

  // 2. 최근 완료된 commitment (최근 2건)
  for (const c of commitments.recentDone.slice(0, 2)) {
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

  // 3. 최근 수정된 메모리 파일 (최근 2건)
  for (const m of memoryFiles.slice(0, 2)) {
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

  // Summary — AI 경영 + 오너 개인 통합
  const summaryParts: string[] = [];
  if (aiExec.entries.length > 0) {
    summaryParts.push(`AI 경영 ${aiExec.successCount}건 정상${aiExec.failedCount > 0 ? `, ${aiExec.failedCount}건 실패` : ''}`);
  }
  if (sessions.count > 0) {
    summaryParts.push(`Claude 세션 ${sessions.count}회`);
  }
  if (commitments.totalOpen > 0) {
    summaryParts.push(`미해결 약속 ${commitments.totalOpen}건`);
  } else {
    summaryParts.push('미해결 약속 0건');
  }
  const summary = summaryParts.length > 0 ? summaryParts.join(' · ') : '오늘 활동 기록 없음';

  // Status: AI 경영 실패 또는 약속 쌓임이 기준
  const status: 'GREEN' | 'YELLOW' | 'RED' =
    aiExec.failedCount > 0 || commitments.totalOpen >= 10 ? 'RED'
    : commitments.totalOpen >= 3 ? 'YELLOW'
    : 'GREEN';

  // lastBoardMinutes 자리에 AI 경영 요약 + 메모리 + 약속 통합 마크다운
  let bodyMarkdown = '';
  if (aiExec.entries.length > 0) {
    bodyMarkdown += `## 🏛️ AI 경영 최근 활동\n\n`;
    for (const e of aiExec.entries) {
      bodyMarkdown += `- ${e.icon} **${e.time}** \`${e.task}\` — ${e.description}\n`;
    }
    bodyMarkdown += '\n';
  }
  if (memoryFiles.length > 0) {
    bodyMarkdown += `## 📝 최근 업데이트된 오너 메모리\n\n`;
    for (const m of memoryFiles) {
      const date = new Date(m.mtime + 9 * 3600_000);
      const mmdd = `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`;
      bodyMarkdown += `- **${m.kindLabel}** · \`${m.filename}\` — ${mmdd} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}\n`;
    }
    bodyMarkdown += '\n';
  }
  if (commitments.totalOpen > 0) {
    bodyMarkdown += `## ⚠️ 미해결 Discord 약속 ${commitments.totalOpen}건\n\n`;
    for (const c of commitments.recentOpen) {
      bodyMarkdown += `- ${c.text.slice(0, 200)}\n`;
    }
  }

  const data: PresidentBriefing = {
    type: 'president',
    id: 'president',
    name: '대표실',
    title: '이정우 — 자비스 AI 경영 + 개인 데이터 통합',
    avatar: '🏛️',
    emoji: '🏛️',
    status,
    summary,
    recentActivity: activity,
    lastBoardMinutes: bodyMarkdown || null,
    boardMinutesFile: null,
    stats: {
      total: aiExec.successCount + aiExec.failedCount,
      success: aiExec.successCount,
      failed: aiExec.failedCount,
      rate: aiExec.successCount + aiExec.failedCount > 0
        ? Math.round((aiExec.successCount / (aiExec.successCount + aiExec.failedCount)) * 100)
        : 100,
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
      aiExecCrons: {
        successCount: aiExec.successCount,
        failedCount: aiExec.failedCount,
        recent: aiExec.entries,
      },
    },
    updatedAt: new Date().toISOString(),
  };

  cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
