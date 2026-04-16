export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { TASKS_JSON } from '@/lib/jarvis-paths';

interface TaskDef {
  id: string;
  name?: string;
  enabled?: boolean;
  disabled?: boolean;
  schedule?: string;
  script?: string;
  prompt?: string;
  [key: string]: unknown;
}

interface TasksFile {
  tasks: TaskDef[];
  [key: string]: unknown;
}

/**
 * PATCH /api/crons/[id] — 크론 태스크 설정 변경
 * Body: { enabled?: boolean, schedule?: string, name?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
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

  // tasks.json 쓰기 (원본 포맷 유지)
  try {
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

  if (!existsSync(TASKS_JSON)) {
    return NextResponse.json({ error: 'tasks.json을 찾을 수 없습니다.' }, { status: 500 });
  }

  let tasksFile: TasksFile;
  try {
    tasksFile = JSON.parse(readFileSync(TASKS_JSON, 'utf-8'));
  } catch {
    return NextResponse.json({ error: 'tasks.json 파싱 실패' }, { status: 500 });
  }

  const task = tasksFile.tasks.find((t) => t.id === cronId);
  if (!task) {
    return NextResponse.json({ error: `크론 '${cronId}'를 찾을 수 없습니다.` }, { status: 404 });
  }

  return NextResponse.json({ task });
}
