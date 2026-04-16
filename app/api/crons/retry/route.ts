export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { exec, spawn } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import { TASKS_JSON as TASKS_FILE, CRON_LOG, JARVIS_HOME as JARVIS, JARVIS_BIN } from '@/lib/jarvis-paths';
import { type TaskDef, getTasksFile } from '@/lib/task-types';
import { getRequestAuth } from '@/lib/guest-guard';

const HOME = homedir();


interface AltAction {
  label: string;
  command?: string;
  description: string;
}

interface RetryResponse {
  success: boolean;
  message: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  logPath?: string;
  logTailLines?: number;
  runnerCommand?: string;
  alternativeActions?: AltAction[];
  promptPreview?: string;
  durationMs?: number;
}

// Rate limit: 1 retry per task per 30 seconds
const lastRetry = new Map<string, number>();

function loadTasks(): TaskDef[] {
  return getTasksFile().tasks;
}

function tailCronLogForTask(taskId: string, lines = 40): string {
  try {
    const raw = readFileSync(CRON_LOG, 'utf-8');
    const all = raw.split('\n').filter(Boolean);
    // Last N lines that belong to this task
    const matched: string[] = [];
    const needle = `] [${taskId}] `;
    for (let i = all.length - 1; i >= 0 && matched.length < lines; i--) {
      if (all[i].includes(needle)) matched.unshift(all[i]);
    }
    return matched.join('\n').slice(-3000);
  } catch {
    return '';
  }
}

function truncate(s: string | undefined | null, n: number): string {
  if (!s) return '';
  return s.length > n ? s.slice(-n) : s;
}

function buildLlmAlternatives(task: TaskDef): AltAction[] {
  // NPC 원칙: shell 명령어 노출 금지 — "무엇을/왜"만 안내
  const actions: AltAction[] = [
    {
      label: '잠시 후 자동 재시도',
      description: '일시적인 오류일 수 있습니다. 다음 스케줄에 자동으로 재실행됩니다.',
    },
  ];
  if (task.discordChannel) {
    actions.push({
      label: `Discord #${task.discordChannel} 에서 확인`,
      description: '봇이 살아있다면 Discord에서 실행 결과를 확인하거나 수동 트리거할 수 있습니다.',
    });
  }
  actions.push({
    label: '팀장에게 진단 요청',
    description: '맵의 해당 팀장 NPC를 클릭해 채팅으로 원인 분석을 요청할 수 있습니다.',
  });
  return actions;
}

export async function POST(req: NextRequest) {
  // ── 인증 확인 (defense-in-depth: middleware 1차 + route handler 2차) ──
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) {
    return NextResponse.json<RetryResponse>(
      { success: false, message: '크론 재실행은 오너 인증이 필요합니다.' },
      { status: 403 },
    );
  }

  try {
    const { cronId } = (await req.json()) as { cronId?: string };
    if (!cronId) {
      return NextResponse.json<RetryResponse>({ success: false, message: '크론 ID가 필요합니다.' }, { status: 400 });
    }

    // Rate limit
    const now = Date.now();
    const last = lastRetry.get(cronId) ?? 0;
    if (now - last < 15_000) {
      const wait = Math.ceil((15_000 - (now - last)) / 1000);
      return NextResponse.json<RetryResponse>(
        { success: false, message: `⏳ ${wait}초 후 재시도 가능합니다 (연타 방지).` },
        { status: 429 },
      );
    }

    const tasks = loadTasks();
    if (tasks.length === 0) {
      return NextResponse.json<RetryResponse>(
        { success: false, message: 'tasks.json을 읽을 수 없습니다.', logPath: TASKS_FILE },
        { status: 500 },
      );
    }

    const task = tasks.find(t => t.id === cronId);
    if (!task) {
      return NextResponse.json<RetryResponse>(
        {
          success: false,
          message: `태스크 "${cronId}"를 tasks.json에서 찾을 수 없습니다.`,
          logPath: TASKS_FILE,
          alternativeActions: [
            { label: 'tasks.json 전체 보기', command: `cat "${TASKS_FILE}" | jq '.tasks[].id'`, description: '등록된 모든 태스크 ID를 확인합니다.' },
          ],
        },
        { status: 404 },
      );
    }

    // ══════════════════════════════════════════════════════════════
    // DRY 원칙: 크론 실행의 SSoT = jarvis-cron.sh
    //
    // 어떤 태스크든 (script/prompt/prompt_file/하이브리드) 동일 경로:
    //   jarvis-cron.sh TASK_ID → detached spawn → cron.log에 결과 기록
    //
    // retry route는 "실행 트리거"만 담당. 실행 로직을 재구현하지 않는다.
    // ══════════════════════════════════════════════════════════════
    const cronRunner = path.join(JARVIS_BIN, 'jarvis-cron.sh');
    if (!existsSync(cronRunner)) {
      return NextResponse.json<RetryResponse>({
        success: false,
        message: 'jarvis-cron.sh를 찾을 수 없습니다.',
        logPath: CRON_LOG,
      });
    }

    lastRetry.set(cronId, now);

    let pid: number | null = null;
    let spawnError: string | null = null;
    try {
      const child = spawn(
        'bash',
        [cronRunner, cronId],
        {
          detached: true,
          stdio: 'ignore',
          env: {
            ...process.env,
            HOME,
            TASK_ID: cronId,
            PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
          },
        },
      );
      pid = child.pid ?? null;
      child.unref();
      child.on('error', (err) => { spawnError = err.message; });
    } catch (e) {
      spawnError = e instanceof Error ? e.message : String(e);
    }

    if (spawnError || pid === null) {
      return NextResponse.json<RetryResponse>({
        success: false,
        message: `실행 시작 실패: ${spawnError || 'PID 없음'}`,
        alternativeActions: buildLlmAlternatives(task),
        logPath: CRON_LOG,
      });
    }

    const taskLog = path.join(JARVIS, 'logs', `${cronId}.log`);
    const resolvedLog = existsSync(taskLog) ? taskLog : CRON_LOG;

    return NextResponse.json<RetryResponse>({
      success: true,
      message: `🚀 재실행 시작 (PID ${pid}) — 결과는 로그에 기록됩니다`,
      logPath: resolvedLog,
      logTailLines: 20,
      stdout: tailCronLogForTask(cronId, 10) || '(결과가 곧 여기에 기록됩니다)',
      alternativeActions: [
        { label: '진행 상황 확인', description: '백그라운드에서 실행 중입니다. 잠시 후 이 팝업을 다시 열면 결과가 업데이트됩니다.' },
        { label: '팀장에게 진단 요청', description: '해당 팀장 NPC를 클릭해 채팅으로 상태를 물어볼 수 있습니다.' },
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json<RetryResponse>(
      { success: false, message: `서버 오류: ${msg}` },
      { status: 500 },
    );
  }
}
