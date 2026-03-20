'use client';
import { useState, useEffect } from 'react';

interface DevTask {
  id: string;
  title: string;
  detail: string;
  priority: string;
  source: string;
  assignee: string;
  status: string;
  created_at: string;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'bg-red-50 text-red-600 border-red-200',
  high:   'bg-orange-50 text-orange-600 border-orange-200',
  medium: 'bg-blue-50 text-blue-600 border-blue-200',
  low:    'bg-gray-50 text-gray-500 border-gray-200',
};
const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-400', medium: 'bg-blue-400', low: 'bg-gray-300',
};

export default function DevTaskList() {
  const [tasks, setTasks] = useState<DevTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/dev-tasks')
      .then(r => r.json())
      .then(data => { setTasks(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const pending = tasks.filter(t => t.status === 'pending');

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">DEV 태스크</span>
        {pending.length > 0 && (
          <span className="text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 px-1.5 py-0.5 rounded-full">
            {pending.length}
          </span>
        )}
      </div>

      {loading ? (
        <div className="p-4 space-y-2">
          {[1,2].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
        </div>
      ) : pending.length === 0 ? (
        <div className="px-4 py-5 text-center text-xs text-gray-400">
          <p className="text-xl mb-1">✅</p>
          대기 중인 태스크 없음
        </div>
      ) : (
        <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
          {pending.map(task => (
            <div key={task.id} className="px-3 py-2.5 hover:bg-gray-50 transition-colors">
              <button
                className="w-full text-left"
                onClick={() => setExpanded(expanded === task.id ? null : task.id)}
              >
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[task.priority] || 'bg-gray-300'}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800 leading-snug line-clamp-2">{task.title}</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${PRIORITY_COLOR[task.priority] || PRIORITY_COLOR.low}`}>
                        {task.priority}
                      </span>
                      {task.assignee && (
                        <span className="text-[10px] text-gray-400">{task.assignee}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-gray-300 text-xs shrink-0">{expanded === task.id ? '▲' : '▼'}</span>
                </div>
              </button>
              {expanded === task.id && task.detail && (
                <p className="text-[11px] text-gray-500 mt-2 ml-3.5 leading-relaxed border-l-2 border-gray-200 pl-2">
                  {task.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
