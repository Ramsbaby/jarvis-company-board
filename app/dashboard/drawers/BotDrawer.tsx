'use client';
import { useState, useCallback } from 'react';
import { Bot, Play, RotateCcw, AlertTriangle, CheckCircle2, X } from 'lucide-react';

// ── Inline useAction (will be replaced by ./hooks import on integration) ────────

function useAction() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const run = useCallback(async (type: string, params: Record<string, unknown> = {}, onSuccess?: () => void) => {
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, params }),
      });
      const d = await r.json();
      const ok = d.ok !== false && r.ok;
      setResult({ ok, message: d.message || d.error || (r.ok ? '완료' : '실패') });
      if (ok) onSuccess?.();
    } catch {
      setResult({ ok: false, message: '네트워크 오류' });
    } finally {
      setLoading(false);
    }
  }, []);
  const createTask = useCallback(async (title: string, detail: string) => {
    setLoading(true);
    setResult(null);
    try {
      const id = 'fix-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      const r = await fetch('/api/dev-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ id, title: `🔧 ${title}`, detail, priority: 'high', source: 'dashboard:fix', assignee: 'jarvis-coder', status: 'awaiting_approval' }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '태스크 생성 실패');
      setResult({ ok: true, message: 'Dev 큐에 등록됨 → Dev 태스크에서 승인하면 Jarvis Coder가 처리합니다' });
    } catch (e) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);
  return { loading, result, run, createTask, clearResult: () => setResult(null) };
}

// ── Types ───────────────────────────────────────────────────────────────────────

export interface BotDrawerData {
  discord_stats: {
    claudeCount?: number;
    totalHuman?: number;
    avgElapsed?: number;
    restartCount?: number;
    botErrors?: number;
    channelActivity?: Array<{
      id: string;
      name: string;
      human: number;
      bot?: number;
      claudes: number;
    }>;
    lastHealth?: {
      silenceSec?: number;
      memMB?: number;
      wsPing?: number;
      uptimeSec?: number;
    };
  } | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}시간 ${m}분`;
  return `${m}분`;
}

function formatSilence(sec: number): { label: string; color: string } {
  const min = Math.floor(sec / 60);
  if (sec > 900) return { label: `${min}분 전`, color: 'text-rose-600' };
  if (sec > 300) return { label: `${min}분 전`, color: 'text-amber-600' };
  return { label: `${min}분 전`, color: 'text-emerald-600' };
}

function elapsedColor(ms?: number): string {
  if (ms == null) return 'text-zinc-500';
  const s = ms / 1000;
  if (s < 10) return 'text-emerald-600';
  if (s < 30) return 'text-amber-600';
  return 'text-rose-600';
}

// ── BotContent ──────────────────────────────────────────────────────────────────

export function BotContent({ data }: { data: BotDrawerData }) {
  const { loading, result, run, createTask, clearResult } = useAction();
  const [postCheck, setPostCheck] = useState<{ status: 'checking' | 'ok' | 'fail'; message: string } | null>(null);
  const stats = data.discord_stats;

  function pollBotStatus() {
    setPostCheck({ status: 'checking', message: '봇 상태 확인 중...' });
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      try {
        const r = await fetch('/api/admin/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'get_metrics' }),
        });
        const d = await r.json();
        if (d.ok && d.data) {
          const agent = (d.data.launch_agents ?? []).find(
            (a: { name: string; pid: string | null }) => a.name === 'ai.jarvis.discord-bot'
          );
          if (agent?.pid) {
            const health = d.data.health?.discord_bot;
            setPostCheck({ status: 'ok', message: `봇 재시작 완료 · PID ${agent.pid} · ${health === 'healthy' ? '정상 응답 중' : '초기화 중 (조금 기다려주세요)'}` });
            clearInterval(interval);
            return;
          }
        }
      } catch { /* continue */ }
      if (attempts >= 5) {
        setPostCheck({ status: 'fail', message: '⚠️ 15초 후에도 봇 PID 미확인 — 로그를 확인해주세요' });
        clearInterval(interval);
      }
    }, 3000);
  }

  if (!stats) {
    return (
      <div className="p-6 text-sm text-zinc-400 italic">Discord 통계 데이터가 없습니다.</div>
    );
  }

  const avgSec = stats.avgElapsed != null ? (stats.avgElapsed / 1000).toFixed(1) : null;
  const sortedChannels = [...(stats.channelActivity ?? [])]
    .sort((a, b) => b.human - a.human)
    .slice(0, 8);
  const maxHuman = Math.max(...sortedChannels.map((c) => c.human), 1);

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* 1. 봇 상태 헤더 */}
      <div className="grid grid-cols-3 gap-3">
        {/* Claude 응답 수 */}
        <div className="p-3 bg-zinc-50 rounded-xl">
          <div className="text-[11px] text-zinc-500 mb-1">Claude 응답</div>
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">
            {stats.claudeCount ?? 0}
          </span>
        </div>

        {/* 인간 메시지 */}
        <div className="p-3 bg-zinc-50 rounded-xl">
          <div className="text-[11px] text-zinc-500 mb-1">인간 메시지</div>
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-zinc-200 text-zinc-600">
            {stats.totalHuman ?? 0}
          </span>
        </div>

        {/* 평균 응답시간 */}
        <div className="p-3 bg-zinc-50 rounded-xl">
          <div className="text-[11px] text-zinc-500 mb-1">평균 응답시간</div>
          {avgSec != null ? (
            <span className={`text-sm font-bold ${elapsedColor(stats.avgElapsed)}`}>
              {avgSec}s
            </span>
          ) : (
            <span className="text-xs text-zinc-400">—</span>
          )}
        </div>

        {/* 재시작 횟수 (별도 행) */}
        {(stats.restartCount ?? 0) > 0 && (
          <div className="col-span-3 p-3 bg-rose-50 rounded-xl border border-rose-100 flex items-center gap-2">
            <AlertTriangle size={14} className="text-rose-500 shrink-0" />
            <span className="text-xs text-rose-700">
              오늘 봇이 <strong>{stats.restartCount}회</strong> 재시작되었습니다.
            </span>
          </div>
        )}
      </div>

      {/* 2. 봇 건강 상태 */}
      {stats.lastHealth && (
        <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            봇 건강 상태
          </div>
          <div className="grid grid-cols-2 gap-y-2.5 gap-x-4 text-sm">
            {/* 침묵 시간 */}
            {stats.lastHealth.silenceSec != null && (() => {
              const { label, color } = formatSilence(stats.lastHealth!.silenceSec!);
              return (
                <>
                  <span className="text-xs text-zinc-500">마지막 응답</span>
                  <span className={`text-xs font-semibold ${color}`}>{label}</span>
                </>
              );
            })()}

            {/* 메모리 */}
            {stats.lastHealth.memMB != null && (
              <>
                <span className="text-xs text-zinc-500">메모리</span>
                <span className="text-xs font-semibold text-zinc-700">
                  {stats.lastHealth.memMB} MB
                </span>
              </>
            )}

            {/* WS 핑 */}
            {stats.lastHealth.wsPing != null && (
              <>
                <span className="text-xs text-zinc-500">WebSocket 핑</span>
                <span className="text-xs font-semibold text-zinc-700">
                  {stats.lastHealth.wsPing} ms
                </span>
              </>
            )}

            {/* 업타임 */}
            {stats.lastHealth.uptimeSec != null && (
              <>
                <span className="text-xs text-zinc-500">업타임</span>
                <span className="text-xs font-semibold text-zinc-700">
                  {formatUptime(stats.lastHealth.uptimeSec)}
                </span>
              </>
            )}
          </div>
        </div>
      )}

      {/* 3. 채널별 활동 */}
      {sortedChannels.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-3">
            채널별 인간/봇 메시지 수
          </div>
          <div className="space-y-3">
            {sortedChannels.map((ch) => (
              <div key={ch.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-zinc-700 truncate max-w-[60%]">{ch.name}</span>
                  <span className="text-[11px] text-zinc-400">
                    인간 {ch.human} / Claude {ch.claudes}
                  </span>
                </div>
                {/* Human bar */}
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[11px] text-zinc-400 w-10 shrink-0">인간</span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-1.5">
                    <div
                      className="bg-blue-400 h-1.5 rounded-full transition-all"
                      style={{ width: `${(ch.human / maxHuman) * 100}%` }}
                    />
                  </div>
                </div>
                {/* Claude bar */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-zinc-400 w-10 shrink-0">봇</span>
                  <div className="flex-1 bg-zinc-100 rounded-full h-1.5">
                    <div
                      className="bg-emerald-400 h-1.5 rounded-full transition-all"
                      style={{ width: `${(ch.claudes / maxHuman) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. 오류 정보 */}
      {(stats.botErrors ?? 0) > 0 && (
        <div className="p-4 bg-rose-50 rounded-xl border border-rose-200">
          <div className="flex items-start gap-2">
            <AlertTriangle size={15} className="text-rose-500 mt-0.5 shrink-0" />
            <div>
              <div className="text-sm font-semibold text-rose-800">
                24시간 내 오류 {stats.botErrors}건 발생
              </div>
              <div className="text-xs text-rose-600 mt-0.5">
                로그를 확인하거나 봇을 재시작해보세요.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* postCheck 상태 */}
      {postCheck && (
        <div className={`p-3 rounded-lg flex items-center gap-2 text-xs ${
          postCheck.status === 'checking' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
          postCheck.status === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
          'bg-amber-50 text-amber-700 border border-amber-200'
        }`}>
          {postCheck.status === 'checking' && <span className="w-3 h-3 border-2 border-blue-400 border-t-blue-700 rounded-full animate-spin shrink-0" />}
          {postCheck.status === 'ok' && <CheckCircle2 size={14} className="shrink-0" />}
          {postCheck.status === 'fail' && <AlertTriangle size={14} className="shrink-0" />}
          <span>{postCheck.message}</span>
        </div>
      )}

      {/* Action result */}
      {result && (
        <div
          className={`p-3 rounded-lg flex items-start gap-2 text-sm ${
            result.ok
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {result.ok ? (
            <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          ) : (
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          )}
          <span className="flex-1">{result.message}</span>
          <button onClick={clearResult} className="text-current opacity-50 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* 5. 액션 버튼 */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run('restart_service', { name: 'discord-bot' }, () => {
            setPostCheck(null);
            pollBotStatus();
          })}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <RotateCcw size={14} /> 봇 재시작
        </button>
        <button
          onClick={() => createTask('Discord 봇 로그 분석', 'Discord 봇 로그 최근 50줄을 분석하고 이상 여부를 진단해주세요. 로그 경로: ~/.jarvis/logs/discord-bot.log')}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-blue-300 text-blue-700 hover:bg-blue-50 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Bot size={14} /> 로그 분석 요청
        </button>
        {loading && (
          <span className="flex items-center gap-1.5 text-xs text-zinc-400 self-center">
            <Play size={12} className="animate-pulse" /> 처리 중...
          </span>
        )}
      </div>
    </div>
  );
}
