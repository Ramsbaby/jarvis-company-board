'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { X, RefreshCw, Play, RotateCcw, Bot, AlertTriangle, CheckCircle2, Terminal } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DrawerType = 'cron' | 'service' | 'rag' | 'cb' | 'health';

export interface DrawerSpec {
  type: DrawerType;
  title: string;
  subtitle?: string;
  data: unknown; // type-specific payload
}

// data shapes per type:
// cron: { task: string; status: 'OK'|'FAILED'|'unknown'; failCount?: number; lastRun?: string; circuitOpen?: boolean; cbName?: string }
// service: { name: string; pid: string|null; exitCode: number|null; loaded: boolean; label: string }
// rag: { dbSize: string; inboxCount: number; chunks: number; rebuilding: boolean; stuck: boolean }
// cb: { name: string; failCount: number; lastFailAgo: number; cooldownRemaining: number }
// health: { overall: string; issues: Array<{severity:string; message:string}>; bot: string; cronRate: number; disk: {used_pct:number; free_gb:number}; memory_mb?: number }

// ── useAction hook ─────────────────────────────────────────────────────────────

function useAction() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const run = useCallback(async (type: string, params: Record<string, unknown> = {}) => {
    setLoading(true);
    setResult(null);
    try {
      const r = await fetch('/api/admin/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, params }),
      });
      const d = await r.json();
      setResult({ ok: d.ok !== false, message: d.message || d.error || (r.ok ? '완료' : '실패') });
    } catch {
      setResult({ ok: false, message: '네트워크 오류' });
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, result, run, clearResult: () => setResult(null) };
}

// ── useServiceLogs hook ────────────────────────────────────────────────────────

function useServiceLogs(service: string | null) {
  const [lines, setLines] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const fetch_ = useCallback(async () => {
    if (!service) return;
    setFetching(true);
    try {
      const r = await fetch(`/api/admin/logs?service=${encodeURIComponent(service)}&lines=100`);
      const d = await r.json();
      if (d.lines) {
        setLines(d.lines);
        // auto-scroll to bottom
        setTimeout(() => {
          if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
        }, 50);
      }
    } catch { /* ignore */ }
    finally { setFetching(false); }
  }, [service]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { lines, fetching, refresh: fetch_, logRef };
}

// ── LogViewer component ────────────────────────────────────────────────────────

function colorLine(line: string): string {
  if (/SUCCESS|DONE/i.test(line)) return 'text-emerald-400';
  if (/FAILED|ABORTED|ERROR/i.test(line)) return 'text-rose-400';
  if (/START|INFO/i.test(line)) return 'text-blue-400';
  if (/WARN|SKIP|CB_OPEN/i.test(line)) return 'text-amber-400';
  return 'text-zinc-400';
}

function LogViewer({ service, title = '최근 로그' }: { service: string; title?: string }) {
  const { lines, fetching, refresh, logRef } = useServiceLogs(service);

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wide flex items-center gap-1.5">
          <Terminal size={12} /> {title}
        </span>
        <button onClick={refresh} disabled={fetching}
          className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1 transition-colors">
          <RefreshCw size={11} className={fetching ? 'animate-spin' : ''} /> 새로고침
        </button>
      </div>
      <div ref={logRef} className="bg-zinc-950 rounded-lg p-3 h-52 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-0.5">
        {lines.length === 0 ? (
          <div className="text-zinc-600 italic">{fetching ? '로딩 중...' : '로그 없음 (Mac Mini 오프라인?)'}</div>
        ) : (
          lines.map((line, i) => (
            <div key={i} className={colorLine(line)}>{line}</div>
          ))
        )}
      </div>
    </div>
  );
}

// ── ActionResult component ─────────────────────────────────────────────────────

function ActionResult({ result, onClose }: { result: { ok: boolean; message: string } | null; onClose: () => void }) {
  if (!result) return null;
  return (
    <div className={`mt-3 p-3 rounded-lg flex items-start gap-2 text-sm ${
      result.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'
    }`}>
      {result.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
      <span className="flex-1">{result.message}</span>
      <button onClick={onClose} className="text-current opacity-50 hover:opacity-100"><X size={14} /></button>
    </div>
  );
}

// ── CronContent ───────────────────────────────────────────────────────────────

function CronContent({ data }: { data: { task: string; status: string; failCount?: number; lastRun?: string; circuitOpen?: boolean; cbName?: string } }) {
  const { loading, result, run, clearResult } = useAction();

  const claudeContext = `Jarvis 크론 작업 '${data.task}'이 실패했습니다. 최근 ${data.failCount || 1}회 연속 실패. 로그 파일: ~/.jarvis/logs/cron.log. 원인을 분석하고 수정해주세요.`;

  return (
    <div className="p-6 flex flex-col h-full">
      {/* Status badge */}
      <div className="flex items-center gap-3 mb-4">
        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
          data.status === 'OK' ? 'bg-emerald-100 text-emerald-700' :
          data.status === 'FAILED' ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-500'
        }`}>
          {data.status === 'OK' ? '✓ 정상' : data.status === 'FAILED' ? `✗ 실패 (${data.failCount}회)` : '미실행'}
        </span>
        {data.lastRun && <span className="text-xs text-zinc-400">마지막: {data.lastRun.slice(11, 19)}</span>}
        {data.circuitOpen && (
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-700">🔒 회로차단 중</span>
        )}
      </div>

      <LogViewer service={data.task} />

      <ActionResult result={result} onClose={clearResult} />

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => run('run_cron', { task: data.task })}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Play size={14} /> 지금 실행
        </button>
        {data.circuitOpen && data.cbName && (
          <button
            onClick={() => run('reset_cb', { name: data.cbName })}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            <RotateCcw size={14} /> 회로차단 해제
          </button>
        )}
        <button
          onClick={() => run('claude_fix', { context: claudeContext, title: data.task })}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Bot size={14} /> Claude로 수정
        </button>
      </div>
    </div>
  );
}

// ── ServiceContent ─────────────────────────────────────────────────────────────

function ServiceContent({ data }: { data: { name: string; pid: string | null; exitCode: number | null; loaded: boolean; label: string } }) {
  const { loading, result, run, clearResult } = useAction();

  // exitCode -15 = SIGTERM (normal restart), 0 = clean, 127 = broken
  const isBroken = data.exitCode === 127;

  const statusText = !data.loaded ? '미로드' : data.pid ? `실행 중 (PID: ${data.pid})` : `종료됨 (exitCode: ${data.exitCode})`;
  const statusColor = !data.loaded ? 'bg-zinc-100 text-zinc-500' : data.pid ? 'bg-emerald-100 text-emerald-700' : isBroken ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-500';

  const claudeContext = `LaunchAgent '${data.name}'이 문제 상태입니다. exitCode: ${data.exitCode}. ${isBroken ? '127은 명령어를 찾을 수 없음을 의미합니다.' : ''} ~/.jarvis/logs/ 에서 관련 로그를 확인하고 수정해주세요.`;

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="mb-4 p-4 bg-zinc-50 rounded-xl">
        <div className="flex items-center justify-between">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${statusColor}`}>{statusText}</span>
        </div>
        {isBroken && (
          <div className="mt-3 p-3 bg-rose-50 rounded-lg text-xs text-rose-700">
            <strong>exitCode 127</strong> = 실행 파일을 찾을 수 없음.<br/>
            plist에 정의된 경로가 잘못되었거나 스크립트가 삭제된 경우입니다.
          </div>
        )}
        {data.exitCode === -15 && (
          <div className="mt-3 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
            <strong>exitCode -15 (SIGTERM)</strong> = launchd가 재시작을 위해 정상 종료한 것. KeepAlive=true이면 자동 재시작됩니다.
          </div>
        )}
      </div>

      <LogViewer service={data.name} />

      <ActionResult result={result} onClose={clearResult} />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => run('restart_service', { name: data.name.replace('ai.jarvis.', '') })}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <RotateCcw size={14} /> 재시작
        </button>
        <button
          onClick={() => run('claude_fix', { context: claudeContext, title: data.name })}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Bot size={14} /> Claude로 수정
        </button>
      </div>
    </div>
  );
}

// ── RagContent ─────────────────────────────────────────────────────────────────

function RagContent({ data }: { data: { dbSize: string; inboxCount: number; chunks: number; rebuilding: boolean; stuck: boolean } }) {
  const { loading, result, run, clearResult } = useAction();

  const riskLevel = data.inboxCount > 15000 ? 'critical' : data.inboxCount > 5000 ? 'warning' : 'ok';

  return (
    <div className="p-6 flex flex-col h-full">
      {/* What is RAG - explanation */}
      <div className="mb-5 p-4 bg-blue-50 rounded-xl border border-blue-100">
        <div className="text-sm font-semibold text-blue-900 mb-1">💡 RAG이 뭔가요?</div>
        <div className="text-xs text-blue-700 leading-relaxed">
          자비스의 <strong>장기 기억 시스템</strong>입니다. 디스코드 메시지, 문서, 대화 내용 등을 벡터 DB에 저장해서, 질문할 때 관련 내용을 꺼내 답변에 활용합니다.
        </div>
      </div>

      {/* Inbox explanation */}
      <div className={`mb-4 p-4 rounded-xl border ${
        riskLevel === 'critical' ? 'bg-rose-50 border-rose-200' :
        riskLevel === 'warning' ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'
      }`}>
        <div className={`text-sm font-semibold mb-1 ${
          riskLevel === 'critical' ? 'text-rose-900' : riskLevel === 'warning' ? 'text-amber-900' : 'text-emerald-900'
        }`}>
          📥 인박스: {data.inboxCount.toLocaleString()}건
          {riskLevel === 'critical' && ' 🔴 Compact 위험!'}
          {riskLevel === 'warning' && ' 🟡 주의 필요'}
        </div>
        <div className={`text-xs leading-relaxed ${
          riskLevel === 'critical' ? 'text-rose-700' : riskLevel === 'warning' ? 'text-amber-700' : 'text-emerald-700'
        }`}>
          <strong>인박스</strong> = 아직 DB에 넣지 못한 새 문서들. rag-index 크론이 주기적으로 처리하는데,
          {riskLevel === 'critical' ? ' 15,000건 초과 시 compact 작업(DB 재구성)이 발생해 자비스가 일시 중단될 수 있습니다!' :
           riskLevel === 'warning' ? ' 5,000건 초과 상태입니다. 처리를 권장합니다.' :
           ' 현재 처리 속도가 유입보다 빠릅니다. 정상.'}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-zinc-50 rounded-lg">
          <div className="text-xs text-zinc-500">DB 크기</div>
          <div className="text-lg font-bold text-zinc-900 mt-0.5">{data.dbSize}</div>
        </div>
        <div className="p-3 bg-zinc-50 rounded-lg">
          <div className="text-xs text-zinc-500">인덱싱된 청크</div>
          <div className="text-lg font-bold text-zinc-900 mt-0.5">{data.chunks?.toLocaleString() ?? '?'}</div>
        </div>
      </div>

      {data.rebuilding && (
        <div className="mb-3 p-3 bg-amber-50 rounded-lg text-xs text-amber-700 border border-amber-200">
          ⚙️ 현재 재인덱싱 작업 진행 중입니다.
        </div>
      )}

      <ActionResult result={result} onClose={clearResult} />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => run('run_cron', { task: 'rag-index' })}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Play size={14} /> 인박스 지금 처리
        </button>
        <button
          onClick={() => run('claude_fix', { context: `RAG 인박스가 ${data.inboxCount}건 쌓여있습니다. ~/.jarvis/rag/ 디렉토리와 rag-index 크론을 확인하고 최적화 방안을 제시해주세요.`, title: 'RAG 인박스 분석' })}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Bot size={14} /> Claude로 분석
        </button>
      </div>
    </div>
  );
}

// ── CircuitBreakerContent ──────────────────────────────────────────────────────

function CircuitBreakerContent({ data }: { data: { name: string; failCount: number; lastFailAgo: number; cooldownRemaining: number } }) {
  const { loading, result, run, clearResult } = useAction();
  const minutes = Math.floor(data.cooldownRemaining / 60);

  return (
    <div className="p-6 flex flex-col h-full">
      <div className="mb-5 p-4 bg-orange-50 rounded-xl border border-orange-200">
        <div className="text-sm font-semibold text-orange-900 mb-1">🔒 회로차단(Circuit Breaker)이란?</div>
        <div className="text-xs text-orange-700 leading-relaxed">
          크론 작업이 연속 3회 이상 실패하면 자동으로 차단됩니다. 차단 중에는 1시간 동안 실행이 중지되어 과부하를 방지합니다.
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-rose-50 rounded-lg border border-rose-100">
          <div className="text-xs text-rose-500">연속 실패</div>
          <div className="text-2xl font-bold text-rose-700 mt-0.5">{data.failCount}회</div>
        </div>
        <div className="p-3 bg-zinc-50 rounded-lg">
          <div className="text-xs text-zinc-500">쿨다운 남은 시간</div>
          <div className="text-2xl font-bold text-zinc-700 mt-0.5">{minutes}분</div>
        </div>
      </div>

      <LogViewer service={data.name} title="실패 로그" />

      <ActionResult result={result} onClose={clearResult} />

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => run('reset_cb', { name: data.name })}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <RotateCcw size={14} /> 차단 해제 후 재시도
        </button>
        <button
          onClick={() => run('claude_fix', { context: `크론 작업 '${data.name}'이 연속 ${data.failCount}회 실패해서 회로차단 상태입니다. ~/.jarvis/logs/cron.log에서 원인을 분석하고 수정해주세요.`, title: `${data.name} 회로차단 수정` })}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <Bot size={14} /> Claude로 수정
        </button>
      </div>
    </div>
  );
}

// ── HealthContent ──────────────────────────────────────────────────────────────

function HealthContent({ data }: { data: { overall: string; issues: Array<{ severity: string; message: string }>; bot: string; cronRate: number; disk: { used_pct: number; free_gb: number }; memory_mb?: number } }) {
  return (
    <div className="p-6">
      <div className="space-y-3">
        {/* Bot */}
        <div className={`p-4 rounded-xl border ${data.bot === 'healthy' ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-900">Discord 봇</span>
            <span className={`text-xs font-bold ${data.bot === 'healthy' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {data.bot === 'healthy' ? '✓ 정상' : '✗ 이상'}
            </span>
          </div>
          {data.bot !== 'healthy' && (
            <div className="mt-2 text-xs text-rose-700">봇이 응답하지 않습니다. watchdog이 자동 재시작을 시도합니다.</div>
          )}
        </div>

        {/* Cron rate */}
        <div className={`p-4 rounded-xl border ${data.cronRate >= 90 ? 'bg-emerald-50 border-emerald-200' : data.cronRate >= 70 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-900">크론 성공률</span>
            <span className={`text-xl font-bold ${data.cronRate >= 90 ? 'text-emerald-600' : data.cronRate >= 70 ? 'text-amber-600' : 'text-rose-600'}`}>
              {data.cronRate}%
            </span>
          </div>
          <div className="mt-2 w-full bg-zinc-200 rounded-full h-2">
            <div className={`h-2 rounded-full transition-all ${data.cronRate >= 90 ? 'bg-emerald-500' : data.cronRate >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
              style={{ width: `${data.cronRate}%` }} />
          </div>
        </div>

        {/* Disk */}
        {data.disk && (
          <div className={`p-4 rounded-xl border ${data.disk.used_pct < 75 ? 'bg-emerald-50 border-emerald-200' : data.disk.used_pct < 90 ? 'bg-amber-50 border-amber-200' : 'bg-rose-50 border-rose-200'}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-900">디스크</span>
              <span className="text-sm font-bold text-zinc-700">{data.disk.used_pct}% 사용 / 여유 {data.disk.free_gb}GB</span>
            </div>
            <div className="mt-2 w-full bg-zinc-200 rounded-full h-2">
              <div className={`h-2 rounded-full ${data.disk.used_pct < 75 ? 'bg-emerald-500' : data.disk.used_pct < 90 ? 'bg-amber-500' : 'bg-rose-500'}`}
                style={{ width: `${data.disk.used_pct}%` }} />
            </div>
          </div>
        )}

        {/* Issues list */}
        {data.issues && data.issues.length > 0 && (
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
            <div className="text-sm font-semibold text-zinc-700 mb-2">감지된 문제</div>
            <ul className="space-y-1.5">
              {data.issues.map((issue, i) => (
                <li key={i} className={`text-xs flex items-start gap-2 ${issue.severity === 'critical' ? 'text-rose-700' : 'text-amber-700'}`}>
                  <span className="mt-0.5 shrink-0">{issue.severity === 'critical' ? '🔴' : '🟡'}</span>
                  {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Drawer component (exported) ──────────────────────────────────────────

export function Drawer({ spec, onClose }: { spec: DrawerSpec | null; onClose: () => void }) {
  const isOpen = spec !== null;

  // ESC key handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      />
      {/* Drawer panel */}
      <div className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[480px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-zinc-100 shrink-0">
          <div>
            <h2 className="text-base font-bold text-zinc-900">{spec?.title ?? ''}</h2>
            {spec?.subtitle && <p className="text-sm text-zinc-500 mt-0.5">{spec.subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors mt-0.5">
            <X size={18} />
          </button>
        </div>

        {/* Content (scrollable) */}
        <div className="flex-1 overflow-y-auto">
          {spec?.type === 'cron' && <CronContent data={spec.data as Parameters<typeof CronContent>[0]['data']} />}
          {spec?.type === 'service' && <ServiceContent data={spec.data as Parameters<typeof ServiceContent>[0]['data']} />}
          {spec?.type === 'rag' && <RagContent data={spec.data as Parameters<typeof RagContent>[0]['data']} />}
          {spec?.type === 'cb' && <CircuitBreakerContent data={spec.data as Parameters<typeof CircuitBreakerContent>[0]['data']} />}
          {spec?.type === 'health' && <HealthContent data={spec.data as Parameters<typeof HealthContent>[0]['data']} />}
        </div>
      </div>
    </>
  );
}
