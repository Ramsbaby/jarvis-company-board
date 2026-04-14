export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, existsSync } from 'fs';
import { exec, spawn } from 'child_process';
import { homedir } from 'os';
import path from 'path';
import { TASKS_JSON as TASKS_FILE, CRON_LOG, JARVIS_HOME as JARVIS } from '@/lib/jarvis-paths';

const HOME = homedir();

interface TaskDef {
  id: string;
  name?: string;
  script?: string;
  prompt?: string;
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
  const actions: AltAction[] = [];
  const askClaude = path.join(JARVIS, 'bin', 'ask-claude.sh');
  const runnerMjs = path.join(JARVIS, 'scripts', 'prompt-runner.mjs');

  // 1순위: ask-claude.sh 존재 시
  if (existsSync(askClaude)) {
    actions.push({
      label: 'ask-claude.sh로 수동 실행',
      command: `bash "${askClaude}" --task "${task.id}"`,
      description: 'Jarvis 게이트웨이를 통해 이 태스크의 프롬프트를 Claude에 직접 요청합니다.',
    });
  }
  // 2순위: prompt-runner.mjs
  if (existsSync(runnerMjs)) {
    actions.push({
      label: 'prompt-runner.mjs로 실행',
      command: `node "${runnerMjs}" "${task.id}"`,
      description: 'tasks.json에 정의된 프롬프트와 동일한 컨텍스트로 실행합니다.',
    });
  }
  // 3순위: Discord 슬래시 명령
  if (task.discordChannel) {
    actions.push({
      label: `Discord #${task.discordChannel} 에서 /ask 트리거`,
      description: '봇이 살아 있으면 Discord에서 /ask 명령으로 수동 트리거할 수 있습니다.',
    });
  }
  // 4순위: tasks.json 확인
  actions.push({
    label: 'tasks.json 에서 프롬프트 확인',
    command: `cat "${TASKS_FILE}" | jq '.tasks[] | select(.id=="${task.id}")'`,
    description: '태스크 정의를 열어 직접 확인/수정한 뒤 다음 스케줄에 재시도합니다.',
  });
  return actions;
}

export async function POST(req: NextRequest) {
  try {
    const { cronId } = (await req.json()) as { cronId?: string };
    if (!cronId) {
      return NextResponse.json<RetryResponse>({ success: false, message: '크론 ID가 필요합니다.' }, { status: 400 });
    }

    // Rate limit
    const now = Date.now();
    const last = lastRetry.get(cronId) ?? 0;
    if (now - last < 30_000) {
      const wait = Math.ceil((30_000 - (now - last)) / 1000);
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

    // ── LLM 프롬프트 전용 태스크: ask-claude.sh 를 detached 실행 ──
    if (!task.script && task.prompt) {
      const preview = task.prompt.replace(/\s+/g, ' ').trim().slice(0, 240);
      const askClaude = path.join(JARVIS, 'bin', 'ask-claude.sh');

      if (!existsSync(askClaude)) {
        return NextResponse.json<RetryResponse>({
          success: false,
          message: 'ask-claude.sh 를 찾을 수 없습니다. LLM 태스크 재실행 불가.',
          alternativeActions: buildLlmAlternatives(task),
          promptPreview: preview + (task.prompt.length > 240 ? '…' : ''),
          logPath: CRON_LOG,
          logTailLines: 40,
          stdout: tailCronLogForTask(cronId, 40),
        });
      }

      // rate limit mark
      lastRetry.set(cronId, now);

      // ask-claude.sh 를 detached + 분리 (stdout/stderr → 전용 파일)
      // 인자: TASK_ID PROMPT [TOOLS] [TIMEOUT] [MAX_BUDGET]
      let pid: number | null = null;
      let spawnError: string | null = null;
      try {
        const child = spawn(
          'bash',
          [askClaude, cronId, task.prompt, 'Read', '120'],
          {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, HOME, PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin' },
          },
        );
        pid = child.pid ?? null;
        child.unref();
        // 에러 핸들러 — 바로 실패하는 경우 (e.g. bash 없음)
        child.on('error', (err) => {
          spawnError = err.message;
        });
      } catch (e) {
        spawnError = e instanceof Error ? e.message : String(e);
      }

      if (spawnError || pid === null) {
        return NextResponse.json<RetryResponse>({
          success: false,
          message: `백그라운드 실행 시작 실패: ${spawnError || 'PID 없음'}`,
          alternativeActions: buildLlmAlternatives(task),
          promptPreview: preview + (task.prompt.length > 240 ? '…' : ''),
          logPath: CRON_LOG,
          logTailLines: 40,
          stdout: tailCronLogForTask(cronId, 40),
        });
      }

      return NextResponse.json<RetryResponse>({
        success: true,
        message: `🚀 LLM 태스크 백그라운드 실행 시작 (PID ${pid}) — 최대 2분 이내 cron.log에 결과 기록`,
        runnerCommand: `bash "${askClaude}" ${cronId} "<prompt>" Read 120`,
        promptPreview: preview + (task.prompt.length > 240 ? '…' : ''),
        logPath: CRON_LOG,
        logTailLines: 20,
        stdout: tailCronLogForTask(cronId, 10) || '(기존 실행 이력 없음 — 결과가 곧 여기에 기록됩니다)',
        alternativeActions: [
          {
            label: '실행 진행 상황 실시간 확인',
            command: `tail -f "${CRON_LOG}" | grep "\\[${cronId}\\]"`,
            description: '백그라운드 태스크가 진행되는 동안 cron.log를 실시간으로 팔로우합니다.',
          },
          {
            label: 'Claude stderr 로그 확인',
            command: `tail -n 50 "${path.join(JARVIS, 'logs', `claude-stderr-${cronId}.log`)}"`,
            description: 'Claude CLI가 남긴 stderr를 확인해 실패 원인을 분석합니다.',
          },
          {
            label: '수동 재실행 (동일 파라미터)',
            command: `bash "${askClaude}" ${cronId} "<prompt>" Read 120`,
            description: '같은 인자로 터미널에서 다시 실행합니다.',
          },
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

    // ── 스크립트 실행 ──
    lastRetry.set(cronId, now);
    const scriptPath = task.script.startsWith('/') ? task.script : path.join(JARVIS, task.script);
    const scriptExists = existsSync(scriptPath);
    if (!scriptExists) {
      return NextResponse.json<RetryResponse>({
        success: false,
        message: `스크립트 파일을 찾을 수 없습니다: ${scriptPath}`,
        logPath: scriptPath,
        runnerCommand: `bash "${scriptPath}"`,
        alternativeActions: [
          { label: '상위 디렉토리 확인', command: `ls -la "${path.dirname(scriptPath)}"`, description: '상위 디렉토리에 실제 어떤 파일이 있는지 확인합니다.' },
          { label: 'git log에서 이동 흔적 찾기', command: `cd "${JARVIS}" && git log --diff-filter=R --summary | grep -A1 "${path.basename(scriptPath)}"`, description: '스크립트가 이름 변경/이동됐는지 확인합니다.' },
        ],
      });
    }

    // 로그 파일 경로 (task 전용 있으면 우선)
    const taskLog = path.join(JARVIS, 'logs', `${cronId}.log`);
    const resolvedLog = existsSync(taskLog) ? taskLog : CRON_LOG;

    const startMs = Date.now();
    const result = await new Promise<RetryResponse>(resolve => {
      exec(
        `bash "${scriptPath}"`,
        { timeout: 30_000, env: { ...process.env, HOME }, maxBuffer: 4 * 1024 * 1024 },
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
                {
                  label: '로그 꼬리 보기 (50줄)',
                  command: `tail -n 50 "${resolvedLog}"`,
                  description: '실제 cron 로그 파일에서 가장 최근 50줄을 직접 확인합니다.',
                },
                {
                  label: '수동 실행 + 디버그 출력',
                  command: `bash -x "${scriptPath}"`,
                  description: 'bash -x 로 한 줄씩 추적하며 어느 단계에서 실패하는지 확인합니다.',
                },
                {
                  label: '실패 가이드 — 크론 실패 추적기',
                  command: `bash "${path.join(JARVIS, 'scripts', 'cron-failure-tracker.sh')}" "${cronId}"`,
                  description: 'Jarvis 장애 추적 스크립트를 이 태스크에 대해 수동 실행합니다.',
                },
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
