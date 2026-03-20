'use client';
import { useState, useEffect } from 'react';

const TYPE_OPTIONS = [
  { value: 'discussion', label: '💬 토론' },
  { value: 'issue',      label: '🔴 이슈' },
  { value: 'inquiry',    label: '❓ 문의' },
  { value: 'decision',   label: '✅ 결정' },
];

const DRAFT_KEY = 'jarvis-board-draft';

interface Draft {
  title: string;
  type: string;
  content: string;
  tags: string;
}

interface Props {
  onClose: () => void;
  onCreated: (post: any) => void;
}

export default function WritePostModal({ onClose, onCreated }: Props) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('discussion');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [draftRestored, setDraftRestored] = useState(false);
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);

  // #7 Check for saved draft on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const draft: Draft = JSON.parse(saved);
        if (draft.title || draft.content) {
          setPendingDraft(draft);
          setShowDraftPrompt(true);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // #7 Auto-save draft to localStorage (debounced via useEffect)
  useEffect(() => {
    if (draftRestored || showDraftPrompt) return; // don't save during prompt
    const draft: Draft = { title, type, content, tags };
    if (title || content) {
      try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch { /* ignore */ }
    }
  }, [title, type, content, tags, draftRestored, showDraftPrompt]);

  function restoreDraft() {
    if (pendingDraft) {
      setTitle(pendingDraft.title);
      setType(pendingDraft.type);
      setContent(pendingDraft.content);
      setTags(pendingDraft.tags);
      setDraftRestored(true);
    }
    setShowDraftPrompt(false);
    setPendingDraft(null);
  }

  function discardDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setShowDraftPrompt(false);
    setPendingDraft(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) { setError('제목과 내용을 입력해주세요'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch('/api/posts/owner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          type,
          content: content.trim(),
          tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || '오류'); }
      const post = await res.json();
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      onCreated(post);
      onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-gray-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">✏️ 새 글 작성</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none">×</button>
        </div>

        {/* #7 Draft restore prompt */}
        {showDraftPrompt && (
          <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-xs text-amber-800 font-medium mb-2">💾 저장된 초안이 있습니다</p>
            <p className="text-[11px] text-amber-700 mb-3 line-clamp-1">
              {pendingDraft?.title || '(제목 없음)'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={restoreDraft}
                className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
              >
                복원하기
              </button>
              <button
                type="button"
                onClick={discardDraft}
                className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors"
              >
                삭제
              </button>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Type */}
          <div className="flex gap-2 flex-wrap">
            {TYPE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setType(opt.value)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  type === opt.value
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Title */}
          <div>
            <input
              type="text"
              placeholder="제목"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
              maxLength={100}
              required
            />
          </div>

          {/* Content */}
          <div>
            <textarea
              placeholder="내용 (마크다운 지원)"
              value={content}
              onChange={e => setContent(e.target.value)}
              rows={5}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none font-mono text-xs"
              required
            />
          </div>

          {/* Tags */}
          <div>
            <input
              type="text"
              placeholder="태그 (쉼표로 구분, 예: jarvis, dev, 긴급)"
              value={tags}
              onChange={e => setTags(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex items-center gap-2 justify-end pt-2">
            <span className="text-[11px] text-zinc-400 mr-auto">자동 저장 중 💾</span>
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
              취소
            </button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50">
              {loading ? '게시 중...' : '게시하기'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
