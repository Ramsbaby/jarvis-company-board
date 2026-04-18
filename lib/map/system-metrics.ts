/**
 * 시스템 리소스 측정 헬퍼 (SSoT)
 *
 * 디스크 / 메모리 / CPU 수치를 단일 구현으로 통일.
 * 이전에는 statusline/route.ts 와 briefing/route.ts 가 각각 비슷한 헬퍼를
 * 중복 구현하고 있었다. 새 라우트가 추가될 때 구현이 드리프트할 위험이 있어
 * 여기로 모았다.
 *
 * 모든 함수는 실패 시 안전한 기본값을 반환한다 — throw 하지 않음.
 */

import { execSync } from 'child_process';
import { getDb } from '@/lib/db';

function safeExec(cmd: string, timeoutMs = 2000): string {
  try {
    return execSync(cmd, { timeout: timeoutMs, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}


export interface DiskUsage {
  percent: number;
  used: string;
  total: string;
}

export interface MemoryUsage {
  percent: number;
  usedGb: number;
  totalGb: number;
}

export interface CpuUsage {
  usage: number;
  loadAvg: number;
}

export function getDiskUsage(): DiskUsage {
  const out = safeExec("df -h / | awk 'NR==2{print $3,$2,$5}'");
  if (!out) return { percent: 0, used: '?', total: '?' };
  const [used, total, pct] = out.split(/\s+/);
  return { percent: parseInt(pct) || 0, used: used || '?', total: total || '?' };
}

export function getMemoryUsage(): MemoryUsage {
  try {
    // Total memory via sysctl (bytes) — instant, no TTY needed
    const totalBytes = parseInt(safeExec('sysctl -n hw.memsize')) || 0;
    if (!totalBytes) return { percent: 0, usedGb: 0, totalGb: 0 };
    const totalGb = totalBytes / (1024 ** 3);

    // Used memory: sum active + wired + compressed pages via vm_stat
    const vmOut = safeExec('vm_stat');
    const pageSize = 16384; // macOS default 16KB page
    const getPages = (label: string) => {
      const m = vmOut.match(new RegExp(label + '[^:]*:\\s+(\\d+)'));
      return m ? parseInt(m[1]) : 0;
    };
    const usedPages = getPages('Pages active') + getPages('Pages wired down') + getPages('Pages occupied by compressor');
    const usedGb = (usedPages * pageSize) / (1024 ** 3);
    const percent = Math.round((usedGb / totalGb) * 100);
    return { percent, usedGb, totalGb };
  } catch {
    return { percent: 0, usedGb: 0, totalGb: 0 };
  }
}

export function getCpuUsage(): CpuUsage {
  try {
    // Load average via sysctl — instant
    const loadOut = safeExec('sysctl -n vm.loadavg');
    const loadAvg = parseFloat(loadOut.replace(/[{}]/g, '').trim().split(/\s+/)[0]) || 0;

    // CPU usage: sum all process %cpu / logical cores
    const psOut = safeExec('ps -A -o %cpu', 2000);
    const nCores = parseInt(safeExec('sysctl -n hw.logicalcpu')) || 1;
    const totalCpu = psOut.trim().split('\n').slice(1).reduce((s, l) => s + (parseFloat(l) || 0), 0);
    const usage = Math.min(100, Math.round(totalCpu / nCores));

    return { usage, loadAvg };
  } catch {
    return { usage: 0, loadAvg: 0 };
  }
}

/**
 * 팀 브리핑 UI 가 구조화 drill-down 모달을 띄우기 위해 소비하는 형태.
 * label / value(%) / type 세 필드만으로 충분하다.
 */
export interface BriefingSystemMetric {
  label: string;
  value: number;
  icon: string;
  type: 'disk' | 'memory' | 'cpu';
}

/** board_settings 캐시에서 Mac Mini 푸시 메트릭을 읽어 반환. null이면 캐시 없음/만료. */
function getPushedMetrics(): { disk?: number; memory?: number; cpu?: number } | null {
  try {
    const db = getDb();
    const row = db
      .prepare("SELECT value, updated_at FROM board_settings WHERE key = 'system_metrics_cache'")
      .get() as { value: string; updated_at: string } | undefined;
    if (!row) return null;
    // updated_at은 SQLite datetime('now') → UTC, 'Z' 붙여서 파싱
    const age = Date.now() - new Date(row.updated_at + 'Z').getTime();
    if (age > 15 * 60 * 1000) return null; // 15분 초과 → stale
    const data = JSON.parse(row.value) as {
      disk?: { used_pct?: number };
      memory?: { used_pct?: number };
      cpu?: { used_pct?: number };
    };
    return {
      disk: data.disk?.used_pct,
      memory: data.memory?.used_pct,
      cpu: data.cpu?.used_pct,
    };
  } catch {
    return null;
  }
}

/**
 * 전사 공통 시스템 메트릭 3종.
 * 모든 팀 브리핑 응답에 포함해서 CEO 가 어느 방을 클릭하든 동일한 건강 지표를
 * 즉시 확인할 수 있게 한다.
 *
 * 우선순위: board_settings 캐시(Mac Mini push) → execSync 로컬 측정
 * Railway 환경에서 macOS 전용 명령(vm_stat, sysctl)이 실패하므로 push 값 우선.
 */
export function getBriefingSystemMetrics(): BriefingSystemMetric[] {
  const pushed = getPushedMetrics();
  const out: BriefingSystemMetric[] = [];

  // 디스크
  const diskPct = pushed?.disk ?? getDiskUsage().percent;
  if (diskPct > 0) out.push({ label: '디스크 사용률', value: diskPct, icon: '💾', type: 'disk' });

  // 메모리 — push 값 우선, 없으면 execSync
  const memPct = pushed?.memory ?? getMemoryUsage().percent;
  if (memPct > 0) out.push({ label: '메모리 사용률', value: memPct, icon: '🧠', type: 'memory' });

  // CPU
  const cpuLive = getCpuUsage();
  const cpuPct = pushed?.cpu ?? cpuLive.usage;
  if (cpuPct > 0 || cpuLive.loadAvg > 0) out.push({ label: 'CPU 사용률', value: cpuPct, icon: '⚡', type: 'cpu' });

  return out;
}
