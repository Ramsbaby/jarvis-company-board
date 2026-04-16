export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { exec, spawn } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import { TASKS_JSON as TASKS_FILE, CRON_LOG, JARVIS_HOME as JARVIS } from '@/lib/jarvis-paths';
import { getRequestAuth } from '@/lib/guest-guard';

const HOME = homedir();

interface TaskDef {
  id: string;
  name?: string;
  script?: string;
  prompt?: string;
  prompt_file?: string;
  enabled?: boolean;
  discordChannel?: string;
}

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
  try {
    const raw = readFileSync(TASKS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as { tasks?: TaskDef[] } | TaskDef[];
    return Array.isArray(parsed) ? parsed : parsed.tasks ?? [];
  } catch {
    return [];
  }
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

    // ── LLM 태스크 (prompt 또는 prompt_file): jarvis-cron.sh를 detached 실행 ──
    const isLlmTask = !task.script && (task.prompt || task.prompt_file);
    if (isLlmTask) {
      const preview = (task.prompt || `(prompt_file: ${task.prompt_file})`).replace(/\s+/g, ' ').trim().slice(0, 240);
      // jarvis-cron.sh를 detached spawn (prompt_file 포함 모든 LLM 태스크)
      const llmRunner = path.join(JARVIS, 'bin', 'jarvis-cron.sh');

      if (!existsSync(llmRunner)) {
        return NextResponse.json<RetryResponse>({
          success: false,
          message: 'jarvis-cron.sh를 찾을 수 없습니다. LLM 태스크 재실행 불가.',
          alternativeActions: buildLlmAlternatives(task),
          promptPreview: preview,
          logPath: CRON_LOG,
        });
      }

      lastRetry.set(cronId, now);

      let pid: number | null = null;
      let spawnError: string | null = null;
      try {
        const child = spawn(
          'bash',
          [llmRunner, cronId],
          {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, HOME, TASK_ID: cronId, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
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
          message: `백그라운드 실행 시작 실패: ${spawnError || 'PID 없음'}`,
          alternativeActions: buildLlmAlternatives(task),
          promptPreview: preview,
          logPath: CRON_LOG,
        });
      }

      return NextResponse.json<RetryResponse>({
        success: true,
        message: `🚀 LLM 태스크 백그라운드 실행 시작 (PID ${pid}) — cron.log에 결과가 기록됩니다`,
        promptPreview: preview,
        logPath: CRON_LOG,
        logTailLines: 20,
        stdout: tailCronLogForTask(cronId, 10) || '(기존 실행 이력 없음 — 결과가 곧 여기에 기록됩니다)',
        alternativeActions: [
          { label: '진행 상황 확인', description: '백그라운드에서 실행 중입니다. 1-2분 후 이 팝업을 다시 열면 결과가 업데이트됩니다.' },
          { label: '결과가 안 나타나면', description: '2분이 지나도 결과가 없으면 재시도 버튼을 다시 누르거나, 팀장 채팅에서 상태를 물어보세요.' },
        ],
      });
    }

    if (!task.script) {
      return NextResponse.json<RetryResponse>({
        success: false,
        message: '실행 가능한 스크립트가 없습니다. tasks.json에 script 또는 prompt를 지정하세요.',
        logPath: TASKS_FILE,
      });
    }

    // ── 스크립트 실행 (크론 러너와 동일 로직: script 있으면 직접, 없으면 jarvis-cron.sh) ──
    lastRetry.set(cronId, now);
    let scriptPath = '';
    let scriptExists = false;
    if (task.script) {
      const rawScript = task.script.startsWith('~') ? task.script.replace(/^~/, HOME) : task.script;
      scriptPath = rawScript.startsWith('/') ? rawScript : path.join(JARVIS, rawScript);
      scriptExists = existsSync(scriptPath);
    }

    // script가 없거나 파일이 없으면 → jarvis-cron.sh로 실행 (prompt 기반 포함)
    // 크론 러너(jarvis-cron.sh)가 script/prompt 분기를 자체 처리함
    const cronRunner = path.join(JARVIS, 'bin', 'jarvis-cron.sh');
    const useCronRunner = !scriptExists && existsSync(cronRunner);

    if (!scriptExists && !useCronRunner) {
      return NextResponse.json<RetryResponse>({
        success: false,
        message: `스크립트(${scriptPath || 'N/A'})도 없고 크론 러너(${cronRunner})도 없습니다.`,
        logPath: scriptPath || TASKS_FILE,
      });
    }

    // 로그 파일 경로 (task 전용 있으면 우선)
    const taskLog = path.join(JARVIS, 'logs', `${cronId}.log`);
    const resolvedLog = existsSync(taskLog) ? taskLog : CRON_LOG;

    const startMs = Date.now();
    // script가 존재하면 직접 실행, 없으면 jarvis-cron.sh TASK_ID로 실행
    const runCommand = scriptExists
      ? `bash "${scriptPath}"`
      : `TASK_ID="${cronId}" bash "${cronRunner}" "${cronId}"`;
    const runTimeout = useCronRunner ? 120_000 : 15_000; // 크론 러너는 LLM 호출 포함 가능 → 2분
    const result = await new Promise<RetryResponse>(resolve => {
      exec(
        runCommand,
        { timeout: runTimeout, env: { ...process.env, HOME }, maxBuffer: 4 * 1024 * 1024 },
        (err, stdout, stderr) => {
          const durationMs = Date.now() - startMs;
          const exitCode = err ? (typeof err.code === 'number' ? err.code : null) : 0;
          const success = !err;
          const trimmedOut = truncate(stdout, 3000);
          const trimmedErr = truncate(stderr, 3000);

          if (success) {
            resolve({
              success: true,
              message: `✅ 재실행 성공 (${(durationMs / 1000).toFixed(1)}s, exit ${exitCode})`,
              exitCode,
              stdout: trimmedOut || '(stdout 없음)',
              stderr: trimmedErr,
              logPath: resolvedLog,
              logTailLines: 40,
              durationMs,
              runnerCommand: `bash "${scriptPath}"`,
            });
          } else {
            resolve({
              success: false,
              message: err?.killed
                ? `⏱ 타임아웃 (30초 초과) — 스크립트가 너무 오래 걸립니다.`
                : `❌ 재실행 실패 (exit ${exitCode ?? '?'}, ${(durationMs / 1000).toFixed(1)}s)`,
              exitCode,
              stdout: trimmedOut,
              stderr: trimmedErr || err?.message || '(stderr 없음)',
              logPath: resolvedLog,
              logTailLines: 40,
              durationMs,
              runnerCommand: `bash "${scriptPath}"`,
              alternativeActions: [
                { label: '잠시 후 자동 재시도', description: '일시적인 오류일 수 있습니다. 다음 스케줄에 자동으로 재실행됩니다.' },
                { label: '실패 패턴 확인', description: '이 팝업의 실행 이력에서 같은 에러가 반복되는지 확인하세요.' },
                { label: '팀장에게 진단 요청', description: '해당 팀장 NPC를 클릭해 채팅으로 원인 분석을 요청할 수 있습니다.' },
              ],
            });
          }
        },
      );
    });

    return NextResponse.json<RetryResponse>(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json<RetryResponse>(
      { success: false, message: `서버 오류: ${msg}` },
      { status: 500 },
    );
  }
}
