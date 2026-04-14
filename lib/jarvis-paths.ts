/**
 * jarvis-paths.ts — ~/.jarvis 경로 SSoT
 *
 * 왜 이 파일이 존재하는가:
 *   `~/.jarvis` 하위 경로 상수가 app/api/ 아래 13개 route 파일에 각자
 *   정의되어 있었다. 패턴도 3가지로 달랐다:
 *     - `const HOME = homedir(); path.join(HOME, '.jarvis', ...)`
 *     - `const JARVIS_HOME = path.join(process.env.HOME || '', '.jarvis')`
 *     - `const JARVIS = path.join(HOME, '.jarvis'); path.join(JARVIS, ...)`
 *   이 파일 하나로 통일한다.
 *
 * 규칙:
 *   - ~/.claude/* 경로는 여기에 넣지 않는다 (jarvis 무관 도메인).
 *   - 새 경로 추가 시 이 파일에만 추가하면 모든 caller 가 혜택받는다.
 */

import { join } from 'path';
import { homedir } from 'os';

/** ~/.jarvis 루트 */
export const JARVIS_HOME = join(homedir(), '.jarvis');

// ── Logs ──────────────────────────────────────────────────────────────────────
export const LOGS_DIR        = join(JARVIS_HOME, 'logs');
export const CRON_LOG        = join(JARVIS_HOME, 'logs', 'cron.log');
export const RAG_INDEX_LOG   = join(JARVIS_HOME, 'logs', 'rag-index.log');

// ── Config ────────────────────────────────────────────────────────────────────
export const TASKS_JSON      = join(JARVIS_HOME, 'config', 'tasks.json');

// ── State ─────────────────────────────────────────────────────────────────────
export const STATE_DIR           = join(JARVIS_HOME, 'state');
export const BOARD_MINUTES_DIR   = join(JARVIS_HOME, 'state', 'board-minutes');
export const CIRCUIT_BREAKER_DIR = join(JARVIS_HOME, 'state', 'circuit-breaker');
export const COMMITMENTS_FILE    = join(JARVIS_HOME, 'state', 'commitments.jsonl');

// ── Results ───────────────────────────────────────────────────────────────────
export const RESULTS_DIR         = join(JARVIS_HOME, 'results');

// ── RAG ───────────────────────────────────────────────────────────────────────
export const RAG_DATA_DIR        = join(JARVIS_HOME, 'rag', 'data');
