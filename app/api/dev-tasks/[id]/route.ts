export const runtime = 'nodejs';
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { broadcastEvent } from '@/lib/sse';
import { getRequestAuth } from '@/lib/guest-guard';
import type { DevTask, LogEntry, AttemptHistoryEntry, TaskStatusRow } from '@/lib/types';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;
  const { isOwner } = getRequestAuth(req);
  if (!isOwner && !isAgent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = getDb();
  const task = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id) as DevTask | undefined;
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(task);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const agentKey = req.headers.get('x-agent-key');
  const isAgent = agentKey === process.env.AGENT_API_KEY;
  const { isOwner } = getRequestAuth(req);

  if (!isAgent && !isOwner) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { status, result_summary, changed_files, execution_log, log_entry, rejection_note, expected_impact, actual_impact, impact_areas, estimated_minutes, difficulty, detail, group_id, depends_on } = body;

  // Agents can set operational statuses; owner can approve/reject/close
  const agentAllowed = ['awaiting_approval', 'in-progress', 'done', 'failed', 'rejected'];
  const ownerAllowed = ['awaiting_approval', 'approved', 'rejected', 'in-progress', 'done', 'failed'];
  const allowed = isAgent ? agentAllowed : ownerAllowed;

  const db = getDb();
  const now = new Date().toISOString();

  // Agent can append a single log entry without changing status
  if (log_entry && isAgent && !status) {
    const appendLog = db.transaction(() => {
      const task = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id) as DevTask | undefined;
      if (!task) return null;
      const logs: LogEntry[] = (() => { try { return JSON.parse(task.execution_log || '[]') as LogEntry[]; } catch { return []; } })();
      logs.push({ time: now, message: log_entry });
      db.prepare('UPDATE dev_tasks SET execution_log = ? WHERE id = ?')
        .run(JSON.stringify(logs), id);
      return db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id) as DevTask;
    });
    const updated = appendLog();
    if (!updated) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    broadcastEvent({ type: 'dev_task_updated', data: { id, status: updated.status, task: updated } });
    return NextResponse.json({ ok: true });
  }

  // Owner can update metadata fields without changing status
  if ((expected_impact !== undefined || difficulty !== undefined || estimated_minutes !== undefined || group_id !== undefined || depends_on !== undefined) && !status) {
    const task = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id) as DevTask | undefined;
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const dependsOnStr = depends_on !== undefined ? (typeof depends_on === 'string' ? depends_on : JSON.stringify(depends_on)) : null;
    // group_id는 명시적 null 허용 (그룹 해제), COALESCE 대신 조건 분기
    const updates: string[] = [];
    const values: unknown[] = [];
    if (expected_impact !== undefined) { updates.push('expected_impact = ?'); values.push(expected_impact || null); }
    if (difficulty !== undefined) { updates.push('difficulty = ?'); values.push(difficulty || null); }
    if (estimated_minutes !== undefined) { updates.push('estimated_minutes = ?'); values.push(estimated_minutes || null); }
    if (group_id !== undefined) { updates.push('group_id = ?'); values.push(group_id); }
    if (dependsOnStr !== null) { updates.push('depends_on = ?'); values.push(dependsOnStr); }
    if (updates.length > 0) {
      values.push(id);
      db.prepare(`UPDATE dev_tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    const updated = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(id) as DevTask;
    broadcastEvent({ type: 'dev_task_updated', data: { id, status: updated.status, task: updated } });
    return NextResponse.json({ ok: true });
  }

  if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 });
  if (!allowed.includes(status)) {
    return NextResponse.json({ error: 'invalid status for this auth level' }, { status: 400 });
  }

  const validTransitions: Record<string, string[]> = {
    awaiting_approval: ['approved', 'rejected'],
    approved:          ['in-progress', 'rejected', 'awaiting_approval'],
    'in-progress':     ['done', 'awaiting_approval', 'failed'],
    done:              ['awaiting_approval'],
    rejected:          ['awaiting_approval'],
    failed:            ['awaiting_approval', 'done'],  // agent가 실제 완료 결과 보고 가능 (stale-watcher 오탐 복구)
  };

  // State machine: enforce valid transitions — wrapped in transaction to prevent races
  type TransitionResult =
    | { ok: true; task: DevTask }
    | { ok: false; code: 404 | 409; error: string };

  const updateStatus = db.transaction((
    taskId: string,
    newStatus: string,
    _now: string,
  ): TransitionResult => {
    const current = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(taskId) as DevTask | undefined;
    if (!current) return { ok: false, code: 404, error: 'Not found' };

    const allowedFrom = validTransitions[current.status] ?? [];
    if (!allowedFrom.includes(newStatus)) {
      return {
        ok: false,
        code: 409,
        error: `Cannot transition from '${current.status}' to '${newStatus}'`,
      };
    }

    if (newStatus === 'approved') {
      db.prepare('UPDATE dev_tasks SET status = ?, approved_at = ? WHERE id = ?').run(newStatus, _now, taskId);
    } else if (newStatus === 'rejected') {
      db.prepare('UPDATE dev_tasks SET status = ?, rejected_at = ?, rejection_note = COALESCE(?, rejection_note) WHERE id = ?')
        .run(newStatus, _now, rejection_note || null, taskId);
    } else if (newStatus === 'in-progress') {
      db.prepare('UPDATE dev_tasks SET status = ?, started_at = COALESCE(started_at, ?) WHERE id = ?').run(newStatus, _now, taskId);
    } else if (newStatus === 'done') {
      const t = db.prepare('SELECT execution_log FROM dev_tasks WHERE id = ?').get(taskId) as Pick<DevTask, 'execution_log'> | undefined;
      const logs: LogEntry[] = JSON.parse(t?.execution_log || '[]') as LogEntry[];
      if (log_entry) logs.push({ time: _now, message: log_entry });

      db.prepare(`UPDATE dev_tasks SET
        status = ?, completed_at = ?,
        result_summary = COALESCE(?, result_summary),
        changed_files = COALESCE(?, changed_files),
        execution_log = ?,
        actual_impact = COALESCE(?, actual_impact),
        impact_areas = COALESCE(?, impact_areas)
        WHERE id = ?`).run(
          newStatus, _now,
          result_summary || null,
          changed_files ? JSON.stringify(changed_files) : null,
          JSON.stringify(logs),
          actual_impact || null,
          impact_areas ? JSON.stringify(impact_areas) : null,
          taskId,
      );
    } else if (newStatus === 'awaiting_approval' && ['done', 'rejected', 'failed', 'in-progress', 'approved'].includes(current.status)) {
      // 재시도/초기화: 이전 시도 이력 보존
      const existingHistory: AttemptHistoryEntry[] = (() => { try { return JSON.parse(current.attempt_history || '[]') as AttemptHistoryEntry[]; } catch { return []; } })();
      const prevLogs: LogEntry[] = (() => { try { return JSON.parse(current.execution_log || '[]') as LogEntry[]; } catch { return []; } })();
      const historyEntry = {
        attempt: existingHistory.length + 1,
        timestamp: _now,
        previous_status: current.status,
        rejection_note: current.rejection_note ?? null,
        result_summary: current.result_summary ?? null,
        started_at: current.started_at ?? null,
        completed_at: current.completed_at ?? null,
        log_count: prevLogs.length,
      };
      const newHistory = JSON.stringify([...existingHistory, historyEntry]);
      db.prepare(`UPDATE dev_tasks SET status = 'awaiting_approval', approved_at = NULL, rejected_at = NULL, rejection_note = NULL, started_at = NULL, completed_at = NULL, result_summary = NULL, changed_files = '[]', execution_log = '[]', attempt_history = ?, detail = COALESCE(?, detail) WHERE id = ?`).run(newHistory, detail || null, taskId);
    } else {
      db.prepare('UPDATE dev_tasks SET status = ? WHERE id = ?').run(newStatus, taskId);
    }

    const updated = db.prepare('SELECT * FROM dev_tasks WHERE id = ?').get(taskId) as DevTask;
    return { ok: true, task: updated };
  });

  const result = updateStatus(id, status, now);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.code });
  }

  broadcastEvent({ type: 'dev_task_updated', data: { id, status, task: result.task } });

  // Discord 알림: 승인 시 jarvis-ceo 채널에 통보
  if (status === 'approved' && process.env.DISCORD_WEBHOOK_CEO) {
    const t = result.task;
    fetch(process.env.DISCORD_WEBHOOK_CEO, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `✅ **Dev Task 승인됨**\n**[${t.priority?.toUpperCase()}] ${t.title}**\n> ${t.detail?.slice(0, 150) || ''}`,
      }),
    }).catch(() => {});
  }

  return NextResponse.json(result.task);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { isOwner } = getRequestAuth(req);
  if (!isOwner) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = getDb();
  const task = db.prepare('SELECT status FROM dev_tasks WHERE id = ?').get(id) as TaskStatusRow | undefined;
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const deletable = ['awaiting_approval', 'rejected', 'failed'];
  if (!deletable.includes(task.status)) {
    return NextResponse.json({ error: `'${task.status}' 상태는 삭제할 수 없습니다` }, { status: 409 });
  }

  db.prepare('DELETE FROM dev_tasks WHERE id = ?').run(id);
  broadcastEvent({ type: 'dev_task_deleted', data: { id } });
  return NextResponse.json({ ok: true });
}
