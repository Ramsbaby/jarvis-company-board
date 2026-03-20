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
  }
  return _db;
}
