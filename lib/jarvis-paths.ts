/**
 * jarvis-paths.ts — 하드코딩 경로 SSoT
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
 *   - jarvis-board가 참조하는 외부 바이너리·캐시도 여기서 관리한다.
 *   - 새 경로 추가 시 이 파일에만 추가하면 모든 caller 가 혜택받는다.
 */

import { join } from 'path';
import { homedir, userInfo } from 'os';

/** ~/.jarvis 루트 */
export const JARVIS_HOME = join(homedir(), '.jarvis');

// ── Logs ──────────────────────────────────────────────────────────────────────
export const LOGS_DIR        = join(JARVIS_HOME, 'logs');
export const CRON_LOG        = join(JARVIS_HOME, 'logs', 'cron.log');
export const RAG_INDEX_LOG   = join(JARVIS_HOME, 'logs', 'rag-index.log');

// ── Config ────────────────────────────────────────────────────────────────────
export const TASKS_JSON      = join(JARVIS_HOME, 'config', 'effective-tasks.json');

// ── State ─────────────────────────────────────────────────────────────────────
export const STATE_DIR           = join(JARVIS_HOME, 'state');
export const BOARD_MINUTES_DIR   = join(JARVIS_HOME, 'state', 'board-minutes');
export const CIRCUIT_BREAKER_DIR = join(JARVIS_HOME, 'state', 'circuit-breaker');
export const COMMITMENTS_FILE    = join(JARVIS_HOME, 'state', 'commitments.jsonl');

// ── Results ───────────────────────────────────────────────────────────────────
export const RESULTS_DIR         = join(JARVIS_HOME, 'results');

// ── RAG ───────────────────────────────────────────────────────────────────────
export const RAG_DATA_DIR        = join(JARVIS_HOME, 'rag', 'data');
export const RAG_QUERY_PATH      = join(JARVIS_HOME, 'lib', 'rag-query.mjs');

// ── Bin ───────────────────────────────────────────────────────────────────────
export const JARVIS_BIN          = join(JARVIS_HOME, 'bin');

// ── Wiki ──────────────────────────────────────────────────────────────────────
export const WIKI_DIR            = join(JARVIS_HOME, 'wiki');

// ── External (Claude CLI / cache / sessions / memory) ─────────────────────────
export const CLAUDE_CLI          = join(homedir(), '.local', 'bin', 'claude');
export const CLAUDE_USAGE_CACHE  = join(homedir(), '.claude', 'usage-cache.json');
export const CLAUDE_SESSIONS_DIR = join(homedir(), '.claude', 'sessions');
export const CLAUDE_MEMORY_DIR   = join(homedir(), '.claude', 'projects', `-Users-${userInfo().username}-jarvis`, 'memory');
