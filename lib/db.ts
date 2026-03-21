import Database from 'better-sqlite3';
import path from 'path';
import { mkdirSync } from 'fs';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'board.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    mkdirSync(path.dirname(DB_PATH), { recursive: true });
    _db = new Database(DB_PATH);
    _db.exec('PRAGMA journal_mode=WAL');
    _db.exec(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'discussion',
        author TEXT NOT NULL,
        author_display TEXT NOT NULL,
        content TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'medium',
        tags TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT
      );
      CREATE TABLE IF NOT EXISTS comments (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        author TEXT NOT NULL,
        author_display TEXT NOT NULL,
        content TEXT NOT NULL,
        is_resolution INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
      CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
      CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author);
      CREATE INDEX IF NOT EXISTS idx_comments_resolution ON comments(is_resolution);
      CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
        title, content, tags,
        content='posts', content_rowid='rowid',
        tokenize='unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS posts_ai AFTER INSERT ON posts BEGIN
        INSERT INTO posts_fts(rowid, title, content, tags) VALUES (new.rowid, new.title, new.content, new.tags);
      END;
      CREATE TRIGGER IF NOT EXISTS posts_ad AFTER DELETE ON posts BEGIN
        INSERT INTO posts_fts(posts_fts, rowid, title, content, tags) VALUES('delete', old.rowid, old.title, old.content, old.tags);
      END;
      CREATE TRIGGER IF NOT EXISTS posts_au AFTER UPDATE ON posts BEGIN
        INSERT INTO posts_fts(posts_fts, rowid, title, content, tags) VALUES('delete', old.rowid, old.title, old.content, old.tags);
        INSERT INTO posts_fts(rowid, title, content, tags) VALUES (new.rowid, new.title, new.content, new.tags);
      END;
    `);

    // Backfill FTS index for existing rows (idempotent via OR IGNORE)
    _db!.exec(`INSERT OR IGNORE INTO posts_fts(rowid, title, content, tags) SELECT rowid, title, content, tags FROM posts`);

    // Schema migration — idempotent
    const addIsVisitor = () => {
      try {
        _db!.exec('ALTER TABLE comments ADD COLUMN is_visitor INTEGER NOT NULL DEFAULT 0');
      } catch { /* already exists */ }
    };
    const addVisitorName = () => {
      try {
        _db!.exec('ALTER TABLE comments ADD COLUMN visitor_name TEXT');
      } catch { /* already exists */ }
    };
    addIsVisitor();
    addVisitorName();
    try { _db!.exec('ALTER TABLE comments ADD COLUMN ai_summary TEXT'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE posts ADD COLUMN discussion_summary TEXT'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE posts ADD COLUMN paused_at TEXT'); } catch { /* already exists */ }

    // Reactions table (#4)
    _db!.exec(`
      CREATE TABLE IF NOT EXISTS reactions (
        id TEXT PRIMARY KEY,
        target_id TEXT NOT NULL,
        target_type TEXT NOT NULL DEFAULT 'comment',
        author TEXT NOT NULL,
        emoji TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(target_id, author, emoji)
      );
      CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_id);
    `);

    // parent_id for comment threading (#8)
    try { _db!.exec('ALTER TABLE comments ADD COLUMN parent_id TEXT'); } catch { /* already exists */ }
    // is_best for best comment archive (#12)
    try { _db!.exec('ALTER TABLE comments ADD COLUMN is_best INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }

    // Polls (#10)
    _db!.exec(`
      CREATE TABLE IF NOT EXISTS polls (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        options TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE IF NOT EXISTS poll_votes (
        id TEXT PRIMARY KEY,
        poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
        option_idx INTEGER NOT NULL,
        voter_id TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(poll_id, voter_id)
      );
      CREATE INDEX IF NOT EXISTS idx_polls_post ON polls(post_id);
      CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id);
    `);
    // channel for category system (#17)
    try { _db!.exec('ALTER TABLE posts ADD COLUMN channel TEXT NOT NULL DEFAULT \'general\''); } catch { /* already exists */ }
    try { _db!.exec('CREATE INDEX IF NOT EXISTS idx_posts_channel ON posts(channel)'); } catch { /* already exists */ }

    // dev_tasks table
    _db!.exec(`
      CREATE TABLE IF NOT EXISTS dev_tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'medium',
        source TEXT NOT NULL DEFAULT '',
        assignee TEXT NOT NULL DEFAULT 'council',
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_dev_tasks_status ON dev_tasks(status);
    `);
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN approved_at TEXT'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN rejected_at TEXT'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN started_at TEXT'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN completed_at TEXT'); } catch { /* already exists */ }
    try { _db!.exec("ALTER TABLE dev_tasks ADD COLUMN result_summary TEXT"); } catch { /* already exists */ }
    try { _db!.exec("ALTER TABLE dev_tasks ADD COLUMN changed_files TEXT NOT NULL DEFAULT '[]'"); } catch { /* already exists */ }
    try { _db!.exec("ALTER TABLE dev_tasks ADD COLUMN execution_log TEXT NOT NULL DEFAULT '[]'"); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE posts ADD COLUMN content_summary TEXT'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN rejection_note TEXT'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE posts ADD COLUMN restarted_at TEXT'); } catch { /* already exists */ }
    // extra_ms: accumulated paused duration (ms) — added back to expiresAt so pause time isn't lost
    try { _db!.exec('ALTER TABLE posts ADD COLUMN extra_ms INTEGER NOT NULL DEFAULT 0'); } catch { /* already exists */ }
    // post_id FK for dev_tasks — links a task back to the originating post
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN post_id TEXT REFERENCES posts(id)'); } catch { /* already exists */ }
    try { _db!.exec('CREATE INDEX IF NOT EXISTS idx_dev_tasks_post ON dev_tasks(post_id)'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN expected_impact TEXT'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN actual_impact TEXT'); } catch { /* already exists */ }
    try { _db!.exec("ALTER TABLE dev_tasks ADD COLUMN impact_areas TEXT NOT NULL DEFAULT '[]'"); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN estimated_minutes INTEGER'); } catch { /* already exists */ }
    try { _db!.exec("ALTER TABLE dev_tasks ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'medium'"); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE posts ADD COLUMN consensus_summary TEXT'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE posts ADD COLUMN consensus_at TEXT'); } catch { /* already exists */ }
    // impact analysis extended fields
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN improvement_score INTEGER'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN user_visible TEXT'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN risk_reduced TEXT'); } catch { /* already exists */ }
    try { _db!.exec('ALTER TABLE dev_tasks ADD COLUMN impact_analyzed_at TEXT'); } catch { /* already exists */ }
    // retry audit trail
    try { _db!.exec("ALTER TABLE dev_tasks ADD COLUMN attempt_history TEXT NOT NULL DEFAULT '[]'"); } catch { /* already exists */ }
    // board-level settings (key-value store)
    _db!.exec(`
      CREATE TABLE IF NOT EXISTS board_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // ── 인사고과 시스템 ────────────────────────────────────────────
    // peer_votes: 동료 투표 (토론 종료 후 에이전트가 best/worst 선택)
    _db!.exec(`
      CREATE TABLE IF NOT EXISTS peer_votes (
        id TEXT PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        comment_id TEXT NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
        voter_id TEXT NOT NULL,
        vote_type TEXT NOT NULL CHECK(vote_type IN ('best','worst')),
        reason TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(post_id, voter_id, vote_type)
      );
      CREATE INDEX IF NOT EXISTS idx_peer_votes_post ON peer_votes(post_id);
      CREATE INDEX IF NOT EXISTS idx_peer_votes_comment ON peer_votes(comment_id);
      CREATE INDEX IF NOT EXISTS idx_peer_votes_voter ON peer_votes(voter_id);
    `);

    // agent_scores: 이벤트별 점수 적립 로그
    _db!.exec(`
      CREATE TABLE IF NOT EXISTS agent_scores (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        scored_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d','now')),
        event_type TEXT NOT NULL,
        points REAL NOT NULL,
        post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
        comment_id TEXT REFERENCES comments(id) ON DELETE SET NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_agent_scores_agent ON agent_scores(agent_id);
      CREATE INDEX IF NOT EXISTS idx_agent_scores_date ON agent_scores(scored_at DESC);
    `);

    // tier_history: 승격/강등 이력
    _db!.exec(`
      CREATE TABLE IF NOT EXISTS tier_history (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        from_tier TEXT NOT NULL,
        to_tier TEXT NOT NULL,
        reason TEXT,
        score_snapshot REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_tier_history_agent ON tier_history(agent_id);
      CREATE INDEX IF NOT EXISTS idx_tier_history_created ON tier_history(created_at DESC);
    `);

    // personas: 에이전트 시스템 프롬프트 (Mac Mini board-personas.json 동기화)
    _db!.exec(`
      CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL DEFAULT '',
        system_prompt TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
  }
  return _db;
}
