export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { MAP_CACHE_TTL_MS } from '@/lib/cache-config';

/**
 * 오너 집무실(president) 브리핑 — 이정우(실인) 전용 개인 공간.
 *
 * CEO실(Opus/AI 경영)과는 완전히 분리된 데이터 소스:
 *  - 오늘 Preply 수업 일정 + 수입 (~/.jarvis/results/personal-schedule-daily/)
 *  - 미해결 약속 트래킹 (~/.jarvis/state/commitments.jsonl) — Discord 자동 추출
 *
 * 표시 정보:
 *  - 오늘 수업 건수 + 예정 수입 (₩/$)
 *  - 미해결 commitment 건수 + 최근 3건
 *  - personal-schedule-daily 최신 결과 본문 (마크다운 렌더)
 */

const HOME = homedir();
const PERSONAL_SCHEDULE_DIR = path.join(HOME, '.jarvis', 'results', 'personal-schedule-daily');
const COMMITMENTS_FILE = path.join(HOME, '.jarvis', 'state', 'commitments.jsonl');

interface Commitment {
  id: string;
  status: string;
  text: string;
  created_at: string;
  source?: string;
  resolved_at?: string;
}

interface RichActivity {
  time: string;
  task: string;
  result: string;
  description: string;
  icon: string;
}

// ── 오늘 personal-schedule-daily 최신 md 로드 ────────────────────────────
function getLatestPersonalSchedule(): { filename: string; content: string; resultSection: string } | null {
  try {
    if (!existsSync(PERSONAL_SCHEDULE_DIR)) return null;
    const files = readdirSync(PERSONAL_SCHEDULE_DIR).filter(f => f.endsWith('.md')).sort().reverse();
    if (files.length === 0) return null;
    const fp = path.join(PERSONAL_SCHEDULE_DIR, files[0]);
    const content = readFileSync(fp, 'utf8');
    // "## Result" 이후 섹션만 추출 (프롬프트는 제외)
    const resultMatch = content.split(/^## Result\s*$/m);
    const resultSection = resultMatch.length > 1 ? resultMatch[1].trim() : content;
    return { filename: files[0], content, resultSection };
  } catch { return null; }
}

// ── personal-schedule-daily Result 섹션에서 수업/수입 추출 ────────────────
interface TodayLesson {
  time: string;
  student: string;
  usd: string;
}

function parseTodayLessons(result: string): { lessons: TodayLesson[]; totalUsd: string; totalKrw: string; title: string } {
  // 헤더: "오늘(4/13 일요일) 수업 브리핑" 또는 "오늘은 수업이 없어요!"
  const titleMatch = result.match(/^(오늘.*브리핑.*|오늘은 수업이 없어요.*)/m);
  const title = titleMatch ? titleMatch[1].trim() : '오늘 일정';

  // 총합: "총 N개 수업 · 총 수입 $XXX.XX (~₩XXX,XXX)"
  const totalMatch = result.match(/총\s*\d+개\s*수업[^$]*\$([\d.,]+)[^₩]*₩([\d,]+)/);
  const totalUsd = totalMatch ? totalMatch[1] : '0';
  const totalKrw = totalMatch ? totalMatch[2] : '0';

  // 개별 수업: "🕐 HH:MM · name · $XX.XX"
  const lessonLines = result.match(/🕐\s*(\d{2}:\d{2})\s*·\s*([^·]+)\s*·\s*\$([\d.]+)/g) || [];
  const lessons: TodayLesson[] = lessonLines.map(line => {
    const m = line.match(/🕐\s*(\d{2}:\d{2})\s*·\s*([^·]+)\s*·\s*\$([\d.]+)/);
    return m ? { time: m[1], student: m[2].trim(), usd: m[3] } : { time: '', student: '', usd: '' };
  }).filter(l => l.time);

  return { lessons, totalUsd, totalKrw, title };
}

// ── commitments.jsonl 로드 ─────────────────────────────────────────────
function getCommitments(): { open: Commitment[]; totalOpen: number; recentOpen: Commitment[] } {
  try {
    if (!existsSync(COMMITMENTS_FILE)) return { open: [], totalOpen: 0, recentOpen: [] };
    const raw = readFileSync(COMMITMENTS_FILE, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const all: Commitment[] = [];
    for (const line of lines) {
      try {
        const c = JSON.parse(line) as Commitment;
        all.push(c);
      } catch { /* skip */ }
    }
    const open = all.filter(c => c.status === 'open');
    // 최신순 정렬
    open.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    return { open, totalOpen: open.length, recentOpen: open.slice(0, 5) };
  } catch { return { open: [], totalOpen: 0, recentOpen: [] }; }
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
  recentActivity: RichActivity[];            // 오늘 수업 타임라인 (기존 recentActivity 슬롯 재사용)
  lastBoardMinutes: string | null;            // personal-schedule Result 섹션 (마크다운)
  boardMinutesFile: string | null;
  stats: {                                    // 수업 KPI (기존 stats 슬롯 재사용 → 팝업이 자동 시각화)
    total: number;
    success: number;
    failed: number;
    rate: number;
  };
  ownerData: {                                 // 오너 전용 구조화 필드
    todayIncome: { usd: string; krw: string };
    openCommitments: number;
    recentCommitments: Array<{ text: string; createdAt: string; source?: string }>;
  };
  updatedAt: string;
}

let cache: { data: OwnerBriefing; ts: number } | null = null;

export async function GET() {
  if (cache && Date.now() - cache.ts < MAP_CACHE_TTL_MS) {
    return NextResponse.json(cache.data);
  }

  const latestSchedule = getLatestPersonalSchedule();
  const parsed = latestSchedule
    ? parseTodayLessons(latestSchedule.resultSection)
    : { lessons: [], totalUsd: '0', totalKrw: '0', title: '오늘 일정 데이터 없음' };
  const commitments = getCommitments();

  // 수업을 recentActivity 포맷으로 변환
  const recentActivity: RichActivity[] = parsed.lessons.map(l => ({
    time: l.time,
    task: l.student,
    result: 'success',                          // 모두 예정으로 표기
    description: `${l.student} 수업 예정 · $${l.usd}`,
    icon: '📚',
  }));

  // 수업 stats (총/학생수/수입)
  const lessonCount = parsed.lessons.length;
  const stats = {
    total: lessonCount,
    success: lessonCount,
    failed: 0,
    rate: 100,
  };

  // Summary 생성
  let summary: string;
  if (lessonCount === 0) {
    summary = commitments.totalOpen > 0
      ? `오늘 수업 없음. 미해결 약속 ${commitments.totalOpen}건 확인 필요.`
      : '오늘은 수업이 없어요. 미해결 약속도 없습니다. 😊';
  } else {
    summary = `오늘 ${lessonCount}개 수업 · 예정 수입 $${parsed.totalUsd} (~₩${parsed.totalKrw})`;
    if (commitments.totalOpen > 0) {
      summary += ` · 미해결 약속 ${commitments.totalOpen}건`;
    }
  }

  // Status 결정
  const status: 'GREEN' | 'YELLOW' | 'RED' =
    commitments.totalOpen >= 10 ? 'RED'
    : commitments.totalOpen >= 3 ? 'YELLOW'
    : 'GREEN';

  const data: OwnerBriefing = {
    type: 'owner',
    id: 'president',                             // 룸 ID는 그대로 (delegate 매핑 유지)
    name: '오너 집무실',
    title: '이정우(대표) 개인 공간',
    avatar: '🏛️',
    emoji: '🏛️',
    status,
    summary,
    recentActivity,
    lastBoardMinutes: latestSchedule ? latestSchedule.resultSection : null,
    boardMinutesFile: latestSchedule ? latestSchedule.filename : null,
    stats,
    ownerData: {
      todayIncome: { usd: parsed.totalUsd, krw: parsed.totalKrw },
      openCommitments: commitments.totalOpen,
      recentCommitments: commitments.recentOpen.map(c => ({
        text: c.text,
        createdAt: c.created_at,
        source: c.source,
      })),
    },
    updatedAt: new Date().toISOString(),
  };

  cache = { data, ts: Date.now() };
  return NextResponse.json(data);
}
