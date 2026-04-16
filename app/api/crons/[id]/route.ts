export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { TASKS_JSON } from '@/lib/jarvis-paths';
import { getRequestAuth } from '@/lib/guest-guard';
import { type TaskDef, type TasksFile, getTask } from '@/lib/task-types';

/**
 * PATCH /api/crons/[id] — 크론 태스크 설정 변경
 * Body: { enabled?: boolean, schedule?: string, name?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // ── 인증 확인 (defense-in-depth: middleware 1차 + route handler 2차) ──
  const { isOwner } = getRequestAuth(req);
  if (!isOwner) {
    return NextResponse.json(
      { error: '크론 설정 변경은 오너 인증이 필요합니다.' },
      { status: 403 },
    );
  }

  const { id: cronId } = await params;
  if (!cronId) {
    return NextResponse.json({ error: 'cronId는 필수입니다.' }, { status: 400 });
  }

  let updates: Partial<Pick<TaskDef, 'enabled' | 'disabled' | 'schedule' | 'name'>>;
  try {
    updates = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청 본문입니다.' }, { status: 400 });
  }

  if (!existsSync(TASKS_JSON)) {
    return NextResponse.json({ error: 'tasks.json을 찾을 수 없습니다.' }, { status: 500 });
  }

  let tasksFile: TasksFile;
  try {
    tasksFile = JSON.parse(readFileSync(TASKS_JSON, 'utf-8'));
  } catch (err) {
    return NextResponse.json({ error: `tasks.json 파싱 실패: ${err}` }, { status: 500 });
  }

  const taskIdx = tasksFile.tasks.findIndex((t) => t.id === cronId);
  if (taskIdx === -1) {
    return NextResponse.json({ error: `크론 '${cronId}'를 찾을 수 없습니다.` }, { status: 404 });
  }

  const task = tasksFile.tasks[taskIdx];
  const changes: string[] = [];

  // enabled/disabled 토글 — tasks.json은 disabled 필드 사용
  if (typeof updates.enabled === 'boolean') {
    const newDisabled = !updates.enabled;
    if (task.disabled !== newDisabled) {
      task.disabled = newDisabled;
      if (newDisabled) {
        delete task.enabled;
      } else {
        delete task.disabled;
      }
      changes.push(`활성화: ${updates.enabled ? '켜짐' : '꺼짐'}`);
    }
  }

  if (updates.schedule && updates.schedule !== task.schedule) {
    const old = task.schedule;
    task.schedule = updates.schedule;
    changes.push(`스케줄: ${old} → ${updates.schedule}`);
  }

  if (updates.name && updates.name !== task.name) {
    task.name = updates.name;
    changes.push(`이름 변경: ${updates.name}`);
  }

  if (changes.length === 0) {
    return NextResponse.json({ success: true, message: '변경 사항이 없습니다.', task });
  }

  // 안전 가드: tasks 배열이 비정상적으로 작으면 쓰기 거부 (파일 오염 방지)
  if (tasksFile.tasks.length < 10) {
    return NextResponse.json({
      error: `안전 가드: tasks 배열이 ${tasksFile.tasks.length}개로 비정상입니다. 쓰기를 거부합니다.`,
    }, { status: 500 });
  }

  // tasks.json 쓰기 (원본 포맷 유지) + 백업 생성
  try {
    const backupPath = TASKS_JSON + '.bak-' + new Date().toISOString().slice(0, 19).replace(/[T:]/g, '');
    writeFileSync(backupPath, readFileSync(TASKS_JSON, 'utf-8'));
    writeFileSync(TASKS_JSON, JSON.stringify(tasksFile, null, 2) + '\n', 'utf-8');
  } catch (err) {
    return NextResponse.json({ error: `tasks.json 저장 실패: ${err}` }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    message: `'${cronId}' 변경 완료: ${changes.join(', ')}`,
    task,
    changes,
  });
}

/**
 * GET /api/crons/[id] — 단일 크론 태스크 정보
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: cronId } = await params;

  const task = getTask(cronId);
  if (!task) {
    return NextResponse.json({ error: `크론 '${cronId}'를 찾을 수 없습니다.` }, { status: 404 });
  }

  return NextResponse.json({ task });
}
