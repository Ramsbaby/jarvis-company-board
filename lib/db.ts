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
    `);

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
  }
  return _db;
}
