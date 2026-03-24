/**
 * Shared TypeScript interfaces for the Jarvis Board domain model.
 * These types correspond to SQLite table rows returned by better-sqlite3.
 *
 * SQLite stores booleans as INTEGER (0/1) and JSON arrays as TEXT,
 * so those are reflected here.
 */

// ── Posts ────────────────────────────────────────────────────────────────────

export interface Post {
  [key: string]: unknown;
  id: string;
  title: string;
  type: string;
  author: string;
  author_display: string;
  content: string;
  status: string;
  priority: string;
  /** JSON-encoded string array, e.g. '["tag1","tag2"]' */
  tags: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  /** SQLite TEXT, may be null */
  restarted_at: string | null;
  paused_at: string | null;
  /** Extra milliseconds added by pause/extend operations */
  extra_ms: number;
  channel: string;
  discussion_summary: string | null;
  content_summary: string | null;
  consensus_summary: string | null;
  consensus_at: string | null;
  consensus_requested_at: string | null;
  consensus_pending_prompt: string | null;
}

/** Post row with computed comment_count (from JOIN) */
export interface PostWithCommentCount extends Post {
  comment_count: number;
  /** Comma-separated agent authors (from subquery) */
  agent_commenters: string | null;
  /** Computed absolute deadline (added server-side, not in DB) */
  board_closes_at?: string;
  /** Computed score for related post ranking */
  score?: number;
  /** Client-only flag: guest-mode stub post that hides real content */
  _locked?: boolean;
}

// ── Comments ─────────────────────────────────────────────────────────────────

export interface Comment {
  [key: string]: unknown;
  id: string;
  post_id: string;
  author: string;
  author_display: string;
  content: string;
  /** SQLite INTEGER: 1 = resolution/conclusion comment, 0 = regular */
  is_resolution: number;
  /** SQLite INTEGER: 1 = visitor comment, 0 = agent/owner */
  is_visitor: number;
  visitor_name: string | null;
  parent_id: string | null;
  /** SQLite INTEGER: 1 = best comment (award), 0 = regular */
  is_best: number;
  ai_summary: string | null;
  created_at: string;
}

// ── Dev Tasks ────────────────────────────────────────────────────────────────

export interface DevTask {
  [key: string]: unknown;
  id: string;
  title: string;
  detail: string;
  priority: string;
  source: string;
  assignee: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  result_summary: string | null;
  /** JSON-encoded string array of changed file paths */
  changed_files: string;
  /** JSON-encoded array of log entry objects */
  execution_log: string;
  rejection_note: string | null;
  post_id: string | null;
  post_title: string;
  expected_impact: string | null;
  actual_impact: string | null;
  /** JSON-encoded string array of impact area tags */
  impact_areas: string;
  estimated_minutes: number | null;
  difficulty: string;
  improvement_score: number | null;
  user_visible: string | null;
  risk_reduced: string | null;
  impact_analyzed_at: string | null;
  /** JSON-encoded array of attempt history objects */
  attempt_history: string;
  /** Group ID for parent-child task grouping (tasks from same discussion share a group_id) */
  group_id: string | null;
  /** JSON-encoded string array of task IDs this task depends on */
  depends_on: string;
}

// ── Reactions ────────────────────────────────────────────────────────────────

export interface Reaction {
  id: string;
  target_id: string;
  target_type: string;
  author: string;
  emoji: string;
  created_at: string;
}

// ── Polls ─────────────────────────────────────────────────────────────────────

export interface Poll {
  id: string;
  post_id: string;
  question: string;
  /** JSON-encoded string array of option labels */
  options: string;
  created_at: string;
}

export interface PollVote {
  id: string;
  poll_id: string;
  option_idx: number;
  voter_id: string;
  created_at: string;
}

// ── Peer Votes ────────────────────────────────────────────────────────────────

export interface PeerVote {
  id: string;
  post_id: string;
  comment_id: string;
  voter_id: string;
  vote_type: 'best' | 'worst';
  reason: string | null;
  /** SQLite INTEGER: 1 = owner vote (3x weight), 0 = agent vote */
  is_owner_vote: number;
  created_at: string;
}

// ── Agent Scores ──────────────────────────────────────────────────────────────

export interface AgentScore {
  id: string;
  agent_id: string;
  scored_at: string;
  event_type: string;
  points: number;
  post_id: string | null;
  comment_id: string | null;
  created_at: string;
}

// ── Board Settings ────────────────────────────────────────────────────────────

export interface BoardSetting {
  key: string;
  value: string;
  updated_at: string;
}

// ── Personas ──────────────────────────────────────────────────────────────────

export interface Persona {
  id: string;
  display_name: string;
  system_prompt: string;
  updated_at: string;
}

// ── Tier History ──────────────────────────────────────────────────────────────

export interface TierHistory {
  id: string;
  agent_id: string;
  from_tier: string;
  to_tier: string;
  reason: string | null;
  score_snapshot: number | null;
  created_at: string;
}

// ── Persona Generations (세대 기록) ──────────────────────────────────────────

export interface PersonaGeneration {
  id: string;
  generation_number: number;
  name: string;
  notes: string | null;
  avg_score: number | null;
  created_at: string;
}

export interface PersonaGenerationMember {
  id: string;
  generation_id: string;
  agent_id: string;
  system_prompt_snapshot: string;
  status: 'active' | 'fired' | 'hired';
  hired_at: string;
  fired_at: string | null;
  score_at_hire: number | null;
  score_at_fire: number | null;
  fire_reason: string | null;
}

// ── Activity feed items (constructed, not a DB table) ────────────────────────

export interface ActivityItem {
  id: string;
  type: 'new_comment' | 'new_post';
  title: string;
  author: string;
  authorDisplay: string;
  postId: string;
  postTitle: string;
  ts: number;
}

// ── Execution log entry (parsed from DevTask.execution_log JSON) ─────────────

export interface LogEntry {
  time: string;
  message: string;
}

// ── Attempt history entry (parsed from DevTask.attempt_history JSON) ─────────

export interface AttemptHistoryEntry {
  attempt: number;
  timestamp: string;
  previous_status: string;
  rejection_note: string | null;
  result_summary: string | null;
  started_at: string | null;
  completed_at: string | null;
  log_count: number;
}

// ── Minimal row shapes for cursor/cursor-based lookups ───────────────────────

export interface PostCursorRow {
  created_at: string;
}

export interface CountRow {
  cnt: number;
}

export interface IdRow {
  id: string;
}

export interface CommentMinimal {
  id: string;
  post_id: string;
}

export interface CommentIsBest {
  is_best: number;
}

export interface CommentStatus {
  status?: string;
}

export interface PostStatus {
  id: string;
  status: string;
}

export interface PostTypeRow {
  id: string;
  type: string;
}

export interface TaskStatusRow {
  id: string;
  status: string;
}

export interface PollVoteCount {
  option_idx: number;
  cnt: number;
}

export interface VoterOptionRow {
  option_idx: number;
}

export interface ReasonRow {
  reason: string | null;
}
