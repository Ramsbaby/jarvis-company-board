/**
 * task-types.ts — TaskDef SSoT + 싱글턴 캐시
 *
 * effective-tasks.json의 실제 필드를 모두 포함하는 공유 타입 정의.
 * 개별 route 파일마다 TaskDef를 재정의하던 중복을 제거한다.
 *
 * getTasksFile() / getTask() — 모듈 레벨 캐시 (10초 TTL)
 *   기존 route 6곳에서 각자 readFileSync + JSON.parse + 로컬 캐시를
 *   돌리던 중복 I/O를 단일 캐시로 통합한다.
 */

import { readFileSync } from 'fs';
import { TASKS_JSON } from '@/lib/jarvis-paths';

// ── TaskDef: effective-tasks.json 단일 태스크 ────────────────────────────────

export interface TaskDef {
  id: string;
  name?: string;
  schedule?: string;

  // 실행 방식
  prompt?: string;
  prompt_file?: string;
  script?: string;
  scriptArgs?: string[];

  // 활성화/비활성화
  disabled?: boolean;
  enabled?: boolean;
  _disabled_reason?: string;

  // 채널·팀·우선순위
  discordChannel?: string;
  channel?: string;
  priority?: string;
  team?: string;
  description?: string;

  // 타임아웃·예산·모델
  timeout?: number;
  maxBudget?: number;
  model?: string;
  allowedTools?: string[];

  // 출력·결과
  output?: string;
  successPattern?: string;
  resultRetention?: number;
  resultMaxChars?: number;
  allowEmptyResult?: boolean;

  // 재시도·서킷브레이커
  retry?: number | { count?: number; delay?: number };
  circuitBreakerCooldown?: number;

  // 컨텍스트
  contextFile?: string;
  contextBudget?: number;

  // 실행 조건
  oncePerDay?: boolean;
  event_trigger?: string;
  event_trigger_debounce_s?: number;
  event_trigger_note?: string;
  depends?: string[];
  requiresMarket?: boolean;
  skipDuringRagRebuild?: boolean;

  // 전략·기타
  strategy?: string;
  continueSites?: string[];
  aliases?: string[];
  env?: Record<string, string>;
  note?: string;
  bypassRag?: boolean;

  // catch-all (tasks.json에 새 필드가 추가되어도 타입 에러 방지)
  [key: string]: unknown;
}

// ── TasksFile: { tasks: TaskDef[] } 래퍼 ─────────────────────────────────────

export interface TasksFile {
  tasks: TaskDef[];
  [key: string]: unknown;
}

// ── 싱글턴 캐시 ──────────────────────────────────────────────────────────────

let _cache: { data: TasksFile; ts: number } | null = null;
const CACHE_TTL = 10_000; // 10초

/**
 * effective-tasks.json을 읽어 TasksFile로 반환한다.
 * 모듈 레벨 캐시 (10초 TTL) — 여러 route가 동시에 호출해도 1회만 I/O.
 */
export function getTasksFile(): TasksFile {
  const now = Date.now();
  if (_cache && now - _cache.ts < CACHE_TTL) return _cache.data;
  try {
    const raw = readFileSync(TASKS_JSON, 'utf-8');
    const data = JSON.parse(raw) as TasksFile;
    _cache = { data, ts: now };
    return data;
  } catch {
    return { tasks: [] };
  }
}

/** 단일 태스크 조회 (id 매칭) */
export function getTask(id: string): TaskDef | undefined {
  return getTasksFile().tasks.find(t => t.id === id);
}
